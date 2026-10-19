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
    <header className="bg-[#0040a1] text-white flex items-center justify-between px-8 h-[64px] shrink-0 shadow-md z-50">
      <div className="flex items-center gap-2 font-bold text-[20px]">
        <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
          favorite
        </span>
        {t('nav.appName')}
      </div>

      <nav className="hidden md:flex items-center gap-1">
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
              paddingLeft: '16px',
              paddingRight: '16px',
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

      <div className="flex items-center gap-3">
        <NotificationCenter token={token} role={user.role} onNavigate={onNav} onOpenMessages={onOpenMessages} />
        <div className="flex items-center gap-2 text-[14px] font-semibold">
          <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            account_circle
          </span>
          <span className="hidden md:inline">
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
