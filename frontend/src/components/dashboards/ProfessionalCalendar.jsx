import { useEffect, useState } from 'react';
import { useLang } from '../../contexts/LangContext';
import Spinner from '../common/Spinner';
import CalendarSchedule from '../common/CalendarSchedule';
import AppointmentAccompanimentPanel from './AppointmentAccompanimentPanel';

const STATUS = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-[#dae2ff] text-[#0040a1]',
  completed: 'bg-emerald-100 text-emerald-700',
};

const hour = value => `${String(value).padStart(2, '0')}:00`;

export default function ProfessionalCalendar({ token }) {
  const { t, lang } = useLang();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/bookings/incoming', { headers: { Authorization: `Bearer ${token}` } });
        const data = res.ok ? await res.json() : [];
        setBookings(data.filter(booking => ['pending', 'approved', 'completed'].includes(booking.status)));
      } catch {
        setBookings([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  return <section className="h-full overflow-y-auto bg-[#f3f3f6]/50 p-6 md:p-8">
    <div className="max-w-6xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#006a61]">{t('calendar.professionalServices')}</p>
          <h1 className="text-[24px] font-bold text-[#1a1c1e] mt-1">{t('calendar.professionalTitle')}</h1>
          <p className="text-[14px] text-[#737785] mt-1">{t('calendar.professionalSubtitle')}</p>
        </div>
      </header>

      <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-4 mb-5 flex flex-wrap gap-2 text-[11px]">
        {Object.entries(STATUS).map(([status, color]) => <span key={status} className={`px-2 py-1 rounded-full font-semibold ${color}`}>{t(`bookingStatus.${status}`)}</span>)}
      </div>

      {loading ? <div className="py-20 flex flex-col items-center gap-3"><Spinner /><p className="text-[14px] text-[#737785]">{t('common.loading')}</p></div> : <div className="grid xl:grid-cols-[minmax(0,1fr)_300px] gap-5">
        <CalendarSchedule bookings={bookings} statusClasses={STATUS} renderLabel={booking => booking.patient_name || booking.family_name || '—'} onSelect={setSelected} />
        <aside className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-5 h-fit">
          {selected ? <div className="space-y-4">
            <div className="flex justify-between gap-2"><div><p className="text-[11px] font-bold uppercase text-[#737785]">{selected.family_name || t('calendar.family')}</p><h2 className="font-bold text-[17px] mt-1">{selected.patient_name || t('calendar.patientNotSpecified')}</h2></div><span className={`h-fit px-2 py-1 rounded-full text-[11px] font-bold ${STATUS[selected.status] || STATUS.pending}`}>{t(`bookingStatus.${selected.status}`)}</span></div>
            <div className="rounded-xl bg-[#f9f9fc] border border-[#c3c6d6]/30 p-3 text-[13px] text-[#424654] space-y-2"><p>{new Date(`${selected.date}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p><p>{hour(selected.start_hour)} — {hour(selected.end_hour)}</p></div>
            {selected.notes && <div><p className="text-[11px] font-bold uppercase text-[#737785] mb-1">{t('calendar.notes')}</p><p className="text-[13px] text-[#424654]">{selected.notes}</p></div>}
          </div> : <div className="py-8 text-center"><span className="material-symbols-outlined text-[40px] text-[#c3c6d6]">touch_app</span><p className="mt-3 text-[13px] font-semibold text-[#424654]">{bookings.length ? t('calendar.selectService') : t('calendar.noProfessionalServices')}</p></div>}
        </aside>
      </div>}
      <AppointmentAccompanimentPanel token={token} />
    </div>
  </section>;
}