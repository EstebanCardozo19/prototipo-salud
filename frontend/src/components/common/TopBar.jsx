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
        { key: 'my-requests', label: t('nav.myRequests') },
        { key: 'account', label: t('nav.myAccount') },
      ];

  return (
    <header className="bg-[#0040a1] text-white flex flex-wrap items-center justify-between gap-y-2 px-4 py-2 lg:h-[64px] lg:flex-nowrap lg:px-8 lg:py-0 shrink-0 shadow-md z-50">
      <div className="flex min-w-0 items-center gap-2 font-bold text-[16px] sm:text-[20px]">
        <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
          favorite
        </span>
        <span className="truncate">{t('nav.appName')}</span>
      </div>

      <nav className="order-3 -mx-1 flex w-full items-center gap-1 overflow-x-auto pb-1 lg:order-none lg:mx-0 lg:w-auto lg:overflow-visible lg:pb-0">
        {navItems.map(item => (
          <button
            key={item.key}
            onClick={() => onNav(item.key)}
            className="shrink-0 whitespace-nowrap px-3 lg:shrink lg:px-4"
            style={{
              color: '#ffffff',
              opacity: activeNav === item.key ? 1 : 0.65,
              borderBottom: activeNav === item.key ? '2px solid #8df1e3' : '2px solid transparent',
              paddingTop: '6px',
              paddingBottom: activeNav === item.key ? '2px' : '4px',
              background: 'none',
              fontWeight: 600,
              fontSize: 14,
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              if (activeNav !== item.key) e.currentTarget.style.opacity = '1';
            }}
            onMouseLeave={e => {
              if (activeNav !== item.key) e.currentTarget.style.opacity = '0.65';
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        <NotificationCenter token={token} role={user.role} onNavigate={onNav} onOpenMessages={onOpenMessages} />
        <div className="flex items-center gap-2 text-[14px] font-semibold">
          <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            account_circle
          </span>
          <span className="hidden lg:inline">
            {user.full_name} — {getRoleLabel(user.role, lang)}
          </span>
        </div>

        {/* Selector de idioma eliminado — se configura en Preferencias (Mi Cuenta) */}

        <button
          onClick={onLogout}
          title={t('nav.logout')}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <span className="material-symbols-outlined text-[22px]">logout</span>
        </button>
      </div>
    </header>
  );
}
