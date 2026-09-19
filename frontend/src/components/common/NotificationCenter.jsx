import { useEffect, useRef, useState } from 'react';

const TYPE_ICON = {
  booking: 'calendar_add_on',
  booking_status: 'event_available',
  message: 'forum',
  verification: 'verified_user',
  medication_reminder: 'medication',
  appointment_accompaniment: 'medical_services',
};

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export default function NotificationCenter({ token, role, onNavigate, onOpenMessages }) {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const containerRef = useRef(null);

  const loadNotifications = async () => {
    try {
      const response = await fetch('/api/notifications/', { headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) setNotifications(await response.json());
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 15000);
    return () => window.clearInterval(interval);
  }, [token]);

  useEffect(() => {
    const closeOnOutsideClick = event => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const markRead = async notification => {
    if (!notification.is_read) {
      try {
        const response = await fetch(`/api/notifications/${notification.id}/read`, {
          method: 'PUT', headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) setNotifications(items => items.map(item => item.id === notification.id ? { ...item, is_read: true } : item));
      } catch (error) { console.error(error); }
    }
    if (notification.type === 'message' && notification.booking_id && onOpenMessages) onOpenMessages(notification.booking_id);
    else if (notification.type === 'appointment_accompaniment') onNavigate('calendar');
    else if (notification.booking_id) onNavigate('my-requests');
    setIsOpen(false);
  };

  const markAllRead = async () => {
    try {
      const response = await fetch('/api/notifications/read-all', { method: 'PUT', headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) setNotifications(items => items.map(item => ({ ...item, is_read: true })));
    } catch (error) { console.error(error); }
  };

  const enablePush = async () => {
    setPushMessage('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Este navegador no admite notificaciones push.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Debes permitir las notificaciones para activarlas.');
      const keyResponse = await fetch('/api/notifications/push/public-key', { headers: { Authorization: `Bearer ${token}` } });
      if (!keyResponse.ok) throw new Error((await keyResponse.json().catch(() => ({}))).detail || 'Las notificaciones push no están configuradas.');
      const { public_key } = await keyResponse.json();
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      const padded = `${public_key}${'='.repeat((4 - public_key.length % 4) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
      const applicationServerKey = Uint8Array.from(atob(padded), character => character.charCodeAt(0));
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      const response = await fetch('/api/notifications/push/subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(subscription) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || 'No fue posible guardar la suscripción.');
      setPushMessage('Recordatorios push activados en este dispositivo.');
    } catch (error) {
      setPushMessage(error.message);
    }
  };

  const unreadCount = notifications.filter(item => !item.is_read).length;
  const unreadMessages = notifications.filter(item => item.type === 'message' && !item.is_read).length;
  return <div ref={containerRef} className="relative">
    <button type="button" onClick={() => setIsOpen(open => !open)} title="Notificaciones" aria-label="Notificaciones" aria-expanded={isOpen} className="relative p-2 hover:bg-white/10 rounded-full transition-colors">
      <span className="material-symbols-outlined text-[23px]">notifications</span>
      {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 h-4 px-1 flex items-center justify-center rounded-full bg-[#ffcf4d] text-[10px] leading-none font-bold text-[#1a1c1e]">{unreadCount > 9 ? '9+' : unreadCount}</span>}
    </button>
    <button type="button" onClick={() => onOpenMessages?.()} title="Mensajes" aria-label="Mensajes" className="relative ml-1 rounded-full p-2 transition-colors hover:bg-white/10">
      <span className="material-symbols-outlined text-[23px]">forum</span>
      {unreadMessages > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#8df1e3] px-1 text-[10px] font-bold leading-none text-[#003070]">{unreadMessages > 9 ? '9+' : unreadMessages}</span>}
    </button>
    {isOpen && <section className="absolute right-0 top-[calc(100%+12px)] z-[100] w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#dae2ff] bg-white text-[#1a1c1e] shadow-2xl">
      <header className="flex items-center justify-between border-b border-[#e7eaf3] px-4 py-3"><div><h2 className="text-[15px] font-bold">Notificaciones</h2><p className="text-[11px] text-[#737785]">{unreadCount ? `${unreadCount} sin leer` : 'Estás al día'}</p></div>{unreadCount > 0 && <button type="button" onClick={markAllRead} className="text-[12px] font-semibold text-[#0040a1] hover:underline">Marcar todo leído</button>}</header>
      {['caregiver', 'nurse'].includes(role) && <div className="border-b border-[#e7eaf3] px-4 py-2"><button type="button" onClick={enablePush} className="text-[12px] font-semibold text-[#0040a1] hover:underline">Activar recordatorios push</button>{pushMessage && <p className="mt-1 text-[11px] text-[#5d6170]">{pushMessage}</p>}</div>}
      <div className="max-h-[420px] overflow-y-auto">
        {!notifications.length ? <div className="px-6 py-10 text-center text-[#737785]"><span className="material-symbols-outlined text-[34px] text-[#c3c6d6]">notifications_off</span><p className="mt-2 text-[13px]">No tienes notificaciones.</p></div> : notifications.map(notification => <button type="button" key={notification.id} onClick={() => markRead(notification)} className={`flex w-full gap-3 border-b border-[#f0f1f6] px-4 py-3 text-left transition-colors hover:bg-[#f7f9ff] ${notification.is_read ? '' : 'bg-[#eef4ff]'}`}><span className={`material-symbols-outlined mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[17px] ${notification.is_read ? 'bg-[#f1f2f6] text-[#737785]' : 'bg-[#dae2ff] text-[#0040a1]'}`}>{TYPE_ICON[notification.type] || 'notifications'}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="truncate text-[13px]">{notification.title}</strong>{!notification.is_read && <i className="h-2 w-2 shrink-0 rounded-full bg-[#0040a1]" />}</span><span className="mt-0.5 block text-[12px] leading-4 text-[#5d6170]">{notification.body}</span><time className="mt-1 block text-[10px] text-[#8a8e9d]">{formatDate(notification.created_at)}</time></span></button>)}</div>
    </section>}
  </div>;
}