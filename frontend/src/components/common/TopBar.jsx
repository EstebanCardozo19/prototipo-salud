import { useLang } from '../../contexts/LangContext';
import { getRoleLabel } from '../../utils/helpers';
import NotificationCenter from './NotificationCenter';

// ─── TopBar ─────────────────────────────────────────────────
export default function TopBar({ user, token, activeNav, onNav, onLogout, onOpenMessages }) {
  const { t, lang } = useLang();

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
        { key: 'my-requests', label: ['caregiver', 'nurse'].includes(user.role) ? 'Mis servicios' : t('nav.myRequests') },
        { key: 'account', label: t('nav.myAccount') },
      ];

  return (
    <div className="shrink-0 shadow-md z-50">
      {/* ── Barra principal ── */}
      <header className="bg-[#0040a1] text-white flex items-center justify-between px-4 md:px-8 h-[56px] md:h-[64px]">
        {/* Logo */}
        <div className="flex items-center gap-2 font-bold text-[17px] md:text-[20px] shrink-0 min-w-0">
          <span className="material-symbols-outlined text-[24px] md:text-[28px] shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
            favorite
          </span>
          <span className="hidden sm:inline truncate">{t('nav.appName')}</span>
        </div>

        {/* Nav escritorio — solo visible en md+ */}
        <nav className="hidden md:flex items-center gap-1 min-w-0 overflow-x-auto">
          {navItems.map(item => (
            <button
              key={item.key}
              onClick={() => onNav(item.key)}
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
            <span className="whitespace-nowrap">
              {user.full_name.trim().split(/\s+/).slice(0, 2).join(' ')}
            </span>
          </div>
          {/* Icono usuario solo en móvil */}
          <button
            onClick={() => onNav('account')}
            className="md:hidden p-1.5 hover:bg-white/10 rounded-full transition-colors"
            title={t('nav.myAccount')}
          >
            <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              account_circle
            </span>
          </button>
          <button
            onClick={onLogout}
            title={t('nav.logout')}
            className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
          >
            <span className="material-symbols-outlined text-[22px]">logout</span>
          </button>
        </div>
      </header>

      {/* ── Nav móvil: fila scrolleable horizontal, solo visible en < md ── */}
      <nav className="md:hidden bg-[#0040a1] border-t border-white/10 flex overflow-x-auto">
        {navItems.map(item => (
          <button
            key={item.key}
            onClick={() => onNav(item.key)}
            className={`shrink-0 px-4 py-2 text-[12px] font-semibold whitespace-nowrap transition-all border-b-2 ${
              activeNav === item.key
                ? 'text-white border-[#8df1e3] opacity-100'
                : 'text-white/65 border-transparent hover:text-white hover:opacity-100'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
