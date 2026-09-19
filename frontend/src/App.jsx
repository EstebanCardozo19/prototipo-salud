import { useEffect, useState } from 'react';
import { useTranslation } from './i18n';
import { LangContext } from './contexts/LangContext';
import { ToastProvider } from './contexts/ToastContext';
import { AuthScreen, MainScreen } from './components';

export default function App() {
  const i18n = useTranslation();
  const [user, setUser] = useState(() => {
    try {
      const s = localStorage.getItem('user');
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);

  const handleLogin = (u, t) => {
    setUser(u);
    setToken(t);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setToken(null);
  };

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const validateStoredSession = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401 && !cancelled) {
          handleLogout();
        }
      } catch {
        // Los errores temporales de red no deben cerrar una sesión válida.
      }
    };

    validateStoredSession();
    return () => { cancelled = true; };
  }, [token]);

  const handleUserUpdate = (u) => {
    setUser(u);
    localStorage.setItem('user', JSON.stringify(u));
  };

  return (
    <LangContext.Provider value={i18n}>
      <ToastProvider>
        {!user || !token ? (
          <AuthScreen onLogin={handleLogin} />
        ) : (
          <MainScreen
            user={user}
            token={token}
            onLogout={handleLogout}
            onUnauthorized={handleLogout}
            onUserUpdate={handleUserUpdate}
          />
        )}
      </ToastProvider>
    </LangContext.Provider>
  );
}
