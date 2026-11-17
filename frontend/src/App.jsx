import { useEffect, useState } from 'react';
import { useTranslation } from './i18n';
import { LangContext } from './contexts/LangContext';
import { ToastProvider } from './contexts/ToastContext';
import { AuthScreen, MainScreen } from './components';
import LandingPage from './components/common/LandingPage';

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
  const [publicView, setPublicView] = useState('home');

  const handleLogin = (u, t) => {
    setUser(u);
    setToken(t);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setToken(null);
    setPublicView('home');
  };

  // Evita que el botón "atrás" del navegador saque al usuario de la SPA
  // sin romper la navegación interna. Cada cambio de sección empuja un estado
  // al historial del browser. Al presionar atrás, popstate llama a handleNav
  // con la sección anterior registrada en el estado.
  useEffect(() => {
    const handlePopState = (event) => {
      const section = event.state?.section;
      if (section) {
        // El estado guardado tiene la sección — se delega a MainScreen via evento
        window.dispatchEvent(new CustomEvent('app:navigate', { detail: { section } }));
      } else {
        // No hay estado guardado → volver al estado neutro sin salir
        window.history.pushState({ section: null }, '', window.location.pathname);
      }
    };
    // Estado inicial
    window.history.replaceState({ section: null }, '', window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
          publicView === 'home'
            ? <LandingPage onAccess={setPublicView} />
            : <AuthScreen onLogin={handleLogin} initialTab={publicView} onBack={() => setPublicView('home')} />
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
