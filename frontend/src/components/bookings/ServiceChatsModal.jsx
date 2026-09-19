import { useEffect, useState } from 'react';
import ServiceChatModal from './ServiceChatModal';
import ServiceCarePlanModal from './ServiceCarePlanModal';
import Spinner from '../common/Spinner';

export default function ServiceChatsModal({ user, token, initialBookingId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [carePlanBooking, setCarePlanBooking] = useState(null);

  useEffect(() => {
    const loadChats = async () => {
      setLoading(true);
      setError('');
      try {
        const endpoint = user.role === 'family' ? '/api/bookings/my-requests' : '/api/bookings/incoming';
        const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('No fue posible cargar tus chats.');
        const approvedBookings = (await response.json()).filter(booking => booking.status === 'approved');
        const initialBooking = approvedBookings.find(booking => booking.id === initialBookingId);
        setSelectedBooking(initialBooking || approvedBookings[0] || null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadChats();
  }, [initialBookingId, token, user.role]);

  if (selectedBooking) {
    if (carePlanBooking) return <ServiceCarePlanModal booking={carePlanBooking} user={user} token={token} onClose={() => setCarePlanBooking(null)} />;
    return <ServiceChatModal booking={selectedBooking} user={user} token={token} onClose={onClose} onOpenCarePlan={() => setCarePlanBooking(selectedBooking)} />;
  }

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-[#10233d]/45 p-4" role="dialog" aria-modal="true" aria-labelledby="service-chats-title">
      <section className="flex max-h-[min(650px,calc(100vh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-[#d9e5ef] bg-gradient-to-r from-[#eef6fc] to-[#f8fbfe] px-5 py-4">
          <div>
            <h2 id="service-chats-title" className="text-[17px] font-bold text-[#17324d]">Mensajes</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[#456078] hover:bg-[#dcebf7]" aria-label="Cerrar chats">
            <span className="material-symbols-outlined text-[21px]">close</span>
          </button>
        </header>

        <div className="min-h-[220px] overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : error ? (
            <p className="m-2 rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{error}</p>
          ) : (
            <div className="px-6 py-14 text-center text-[#577087]">
              <span className="material-symbols-outlined text-[42px] text-[#a5bfd4]">forum</span>
              <h3 className="mt-3 text-[15px] font-semibold text-[#17324d]">No tienes chats activos</h3>
              <p className="mt-1 text-[13px]">Los chats estarán disponibles cuando tengas un servicio aprobado.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}