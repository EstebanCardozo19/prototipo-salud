import { useState, useEffect } from 'react';
import { useLang } from '../../contexts/LangContext';
import Spinner from '../common/Spinner';

// ─── ProfessionalPanel (solicitudes, calendario, reseñas) ────
export default function ProfessionalPanel({ user, token }) {
  const { t } = useLang();
  const [bookings, setBookings] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [bRes, rRes] = await Promise.all([
        fetch('/api/bookings/incoming', { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/bookings/reviews/${user.id}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (bRes.ok) setBookings(await bRes.json());
      if (rRes.ok) setReviews(await rRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const decide = async (id, status) => {
    await fetch(`/api/bookings/${id}/decide`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });
    load();
  };

  const pendingItems = bookings.filter(b => b.status === 'pending');
  const approved = bookings.filter(b => b.status === 'approved');

  const tabs = [
    { key: 'pending', label: t('professional_panel.requests'), count: pendingItems.length, color: 'amber' },
    { key: 'calendar', label: t('professional_panel.calendar'), count: approved.length, color: 'green' },
    { key: 'reviews', label: t('professional_panel.reviews'), count: reviews.length, color: 'blue' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-[#c3c6d6]/30">
      <div className="px-6 pt-5 pb-0 border-b border-[#c3c6d6]/30">
        <div className="flex gap-1">
          {tabs.map(tTab => (
            <button
              key={tTab.key}
              onClick={() => setTab(tTab.key)}
              className={`px-4 py-2.5 text-[13px] font-semibold rounded-t-xl border-b-2 transition-all flex items-center gap-1.5 ${
                tab === tTab.key
                  ? 'border-[#0040a1] text-[#0040a1] bg-[#f3f3f6]'
                  : 'border-transparent text-[#424654] hover:text-[#0040a1]'
              }`}
            >
              {tTab.label}
              <span
                className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                  tTab.count > 0 ? 'bg-[#0040a1]/10 text-[#0040a1]' : 'bg-[#f3f3f6] text-[#737785]'
                }`}
              >
                {tTab.count}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 bg-[#f9f9fc]/60 flex flex-col gap-3">
        {tab === 'pending' && (
          pendingItems.length === 0 ? (
            <p className="text-center text-[#424654] text-[14px] py-10">{t('professional_panel.noPending')}</p>
          ) : (
            pendingItems.map(b => (
              <div key={b.id} className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-bold text-[14px]">{b.family_name}</p>
                    <p className="text-[#424654] text-[12px]">
                      {b.date} · {b.start_hour}:00 - {b.end_hour}:00
                    </p>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full">
                    {t('professional_panel.pending_badge')}
                  </span>
                </div>
                {b.notes && <p className="text-[13px] text-[#424654] mb-3">{b.notes}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => decide(b.id, 'approved')}
                    className="px-4 py-1.5 bg-green-500 text-white rounded-lg text-[13px] font-semibold hover:bg-green-600 transition-all"
                  >
                    {t('professional_panel.approve')}
                  </button>
                  <button
                    onClick={() => decide(b.id, 'rejected')}
                    className="px-4 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-[13px] font-semibold hover:bg-red-100 transition-all"
                  >
                    {t('professional_panel.reject')}
                  </button>
                </div>
              </div>
            ))
          )
        )}
        {tab === 'calendar' && (
          approved.length === 0 ? (
            <p className="text-center text-[#424654] text-[14px] py-10">{t('professional_panel.noScheduled')}</p>
          ) : (
            approved.map(b => (
              <div
                key={b.id}
                className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm px-4 py-3 flex justify-between items-center"
              >
                <div>
                  <p className="font-bold text-[14px]">{b.date}</p>
                  <p className="text-[#424654] text-[12px]">
                    {b.start_hour}:00 - {b.end_hour}:00
                  </p>
                </div>
                <span className="text-[12px] font-semibold px-3 py-1 bg-[#0040a1]/10 text-[#0040a1] rounded-full">
                  {b.family_name}
                </span>
              </div>
            ))
          )
        )}
        {tab === 'reviews' && (
          reviews.length === 0 ? (
            <p className="text-center text-[#424654] text-[14px] py-10">{t('professional_panel.noReviews')}</p>
          ) : (
            reviews.map(r => (
              <div
                key={r.id}
                className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm px-4 py-3"
              >
                <div className="flex justify-between items-center mb-1">
                  <p className="font-bold text-[14px]">{r.family_name}</p>
                  <span className="text-amber-500">
                    {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                  </span>
                </div>
                {r.comment && <p className="text-[13px] text-[#424654]">{r.comment}</p>}
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}
