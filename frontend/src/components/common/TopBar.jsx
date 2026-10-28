import { useState } from 'react';
import { useLang } from '../../contexts/LangContext';
import { getRoleLabel } from '../../utils/helpers';
import NotificationCenter from './NotificationCenter';

// ─── TopBar ─────────────────────────────────────────────────
export default function TopBar({ user, token, activeNav, onNav, onLogout, onOpenMessages }) {
  const { t, lang } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = user.role === 'admin'
    ? [
        { key: 'users', label: t('admin.users') },
        { key: 'account', label: t('nav.myAccount') },
      ]
    : [
        ...(user.role === 'family'
          ? [
              { key: 'caregivers', label: t('nav.caregivers') },
              { key: 'nurses', label: t('nav.nurses') },
              { key: 'calendar', label: t('nav.calendar') },
               { key: 'medical-appointments', label: 'Citas médicas' },
            ]
          : []),
        ...(['caregiver', 'nurse'].includes(user.role)
          ? [{ key: 'calendar', label: t('nav.calendar') }, { key: 'availability', label: 'Disponibilidad' }]
          : []),
        // Rutinas y medicamentos: visible para familia y profesionales
        ...(['family', 'caregiver', 'nurse'].includes(user.role)
          ? [{ key: 'medications', label: 'Medicamentos' }]
          : []),
        { key: 'my-requests', label: t('nav.myRequests') },
        { key: 'account', label: t('nav.myAccount') },
      ];

  const handleNav = (key) => {
    onNav(key);
    setMenuOpen(false);
  };

  return (
    <>
      <header className="bg-[#0040a1] text-white flex items-center justify-between px-4 md:px-8 h-[56px] md:h-[64px] shrink-0 shadow-md z-50 relative">
        {/* Logo */}
        <div className="flex items-center gap-2 font-bold text-[17px] md:text-[20px] shrink-0 min-w-0">
          <span className="material-symbols-outlined text-[24px] md:text-[28px] shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
            favorite
          </span>
          <span className="hidden sm:inline truncate">{t('nav.appName')}</span>
        </div>

        {/* Nav escritorio */}
        <nav className="hidden md:flex items-center gap-1 min-w-0 overflow-x-auto">
          {navItems.map(item => (
            <button
              key={item.key}
              onClick={() => handleNav(item.key)}
              style={{
                color: '#ffffff',
                opacity: activeNav === item.key ? 1 : 0.65,
                borderBottom: activeNav === item.key ? '2px solid #8df1e3' : '2px solid transparent',
                paddingTop: '6px',
                paddingBottom: activeNav === item.key ? '2px' : '4px',
                paddingLeft: '14px',
                paddingRight: '14px',
                background: 'none',
                fontWeight: 600,
                fontSize: 13,
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { if (activeNav !== item.key) e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={e => { if (activeNav !== item.key) e.currentTarget.style.opacity = '0.65'; }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Acciones derecha */}
        <div className="flex items-center gap-1 shrink-0">
          <NotificationCenter token={token} role={user.role} onNavigate={onNav} onOpenMessages={onOpenMessages} />
          {/* Nombre solo en desktop */}
          <div className="hidden md:flex items-center gap-1.5 text-[13px] font-semibold ml-1">
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              account_circle
            </span>
            <span className="max-w-[140px] truncate">
              {user.full_name} — {getRoleLabel(user.role, lang)}
            </span>
          </div>
          {/* Botón hamburguesa solo en móvil */}
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="md:hidden p-1.5 hover:bg-white/10 rounded-full transition-colors"
            aria-label="Menú de navegación"
            aria-expanded={menuOpen}
          >
            <span className="material-symbols-outlined text-[24px]">
              {menuOpen ? 'close' : 'menu'}
            </span>
          </button>
          <button
            onClick={onLogout}
            title={t('nav.logout')}
            className="hidden md:flex p-1.5 hover:bg-white/10 rounded-full transition-colors"
          >
            <span className="material-symbols-outlined text-[22px]">logout</span>
          </button>
        </div>
      </header>

      {/* ── Drawer móvil ── */}
      {menuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-[60] bg-[#071426]/50 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          {/* Panel */}
          <div className="md:hidden fixed top-[56px] left-0 right-0 z-[70] bg-[#0040a1] shadow-2xl border-t border-white/10 pb-2">
            {/* Nombre del usuario */}
            <div className="px-5 py-3 border-b border-white/10 flex items-center gap-2">
              <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                account_circle
              </span>
              <div className="min-w-0">
                <p className="font-bold text-[14px] truncate">{user.full_name}</p>
                <p className="text-white/60 text-[11px]">{getRoleLabel(user.role, lang)}</p>
              </div>
            </div>
            {/* Ítems de navegación */}
            <nav className="flex flex-col py-1">
              {navItems.map(item => (
                <button
                  key={item.key}
                  onClick={() => handleNav(item.key)}
                  className={`flex items-center gap-3 px-5 py-3 text-[14px] font-semibold text-left transition-colors ${
                    activeNav === item.key
                      ? 'bg-white/15 text-white border-l-4 border-[#8df1e3]'
                      : 'text-white/80 hover:bg-white/10 border-l-4 border-transparent'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              {/* Cerrar sesión al final */}
              <button
                onClick={() => { setMenuOpen(false); onLogout(); }}
                className="flex items-center gap-3 px-5 py-3 text-[14px] font-semibold text-left text-white/70 hover:bg-white/10 border-l-4 border-transparent transition-colors mt-1 border-t border-white/10 pt-3"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
                {t('nav.logout')}
              </button>
            </nav>
          </div>
        </>
      )}
    </>
  );
}
