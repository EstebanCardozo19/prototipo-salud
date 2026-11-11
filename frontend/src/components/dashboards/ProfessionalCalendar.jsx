import { useEffect, useState } from 'react';
import { useLang } from '../../contexts/LangContext';
import Spinner from '../common/Spinner';
import CalendarSchedule from '../common/CalendarSchedule';
import AppointmentAccompanimentPanel from './AppointmentAccompanimentPanel';

const STATUS = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-[#dae2ff] text-[#0040a1]',
  completed: 'bg-emerald-100 text-emerald-700',
  scheduled: 'bg-violet-100 text-violet-700',
};
const hour = value => {
  const text = String(value ?? '');
  return text.includes(':') ? text.slice(0, 5) : `${text.padStart(2, '0')}:00`;
};

export default function ProfessionalCalendar({ token }) {
  const { t, lang } = useLang();
  const [bookings, setBookings] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [bookingResponse, appointmentResponse] = await Promise.all([
          fetch('/api/bookings/incoming', { headers }),
          fetch('/api/appointments/professional', { headers }),
        ]);
        const services = bookingResponse.ok ? await bookingResponse.json() : [];
        const medicalAppointments = appointmentResponse.ok ? await appointmentResponse.json() : [];
        setBookings(services.filter(booking => ['pending', 'approved', 'completed'].includes(booking.status)));
        setAppointments(medicalAppointments
          .filter(item => item.accompaniment_status === 'accepted' && ['scheduled', 'completed'].includes(item.status))
          .map(item => ({ ...item, id: `appointment-${item.id}`, source: 'appointment', start_hour: item.time, end_hour: item.time })));
      } catch { setBookings([]); setAppointments([]); }
      finally { setLoading(false); }
    };
    load();
  }, [token]);

  const calendarItems = [...bookings, ...appointments];
  return <section className="h-full overflow-y-auto bg-[#f3f3f6]/50 p-4 sm:p-6 md:p-8">
    <div className="max-w-6xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#006a61]">{t('calendar.professionalServices')}</p>
          <h1 className="text-[20px] sm:text-[24px] font-bold text-[#1a1c1e] mt-1">{t('calendar.professionalTitle')}</h1>
          <p className="text-[13px] text-[#737785] mt-1">{t('calendar.professionalSubtitle')}</p>
        </div>
      </header>
      <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-3 mb-5 flex flex-wrap gap-2 text-[11px]">
        {Object.entries(STATUS).map(([status, color]) => (
          <span key={status} className={`px-2 py-1 rounded-full font-semibold ${color}`}>
            {status === 'scheduled' ? 'Cita médica' : t(`bookingStatus.${status}`)}
          </span>
        ))}
      </div>
      {loading
        ? <div className="py-20 flex flex-col items-center gap-3"><Spinner /><p className="text-[14px] text-[#737785]">{t('common.loading')}</p></div>
        : <div className="grid xl:grid-cols-[minmax(0,1fr)_300px] gap-5">
            <CalendarSchedule bookings={calendarItems} statusClasses={STATUS}
              renderLabel={item => item.source === 'appointment' ? item.appointment_type : (item.patient_name || item.family_name || '—')}
              onSelect={setSelected} />
            <aside className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-4 sm:p-5 h-fit">
              {selected
                ? <div className="space-y-4">
                    <div className="flex justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-bold uppercase text-[#737785]">{selected.family_name || t('calendar.family')}</p>
                        <h2 className="font-bold text-[16px] mt-1">{selected.source === 'appointment' ? `${selected.patient_name} · ${selected.appointment_type}` : (selected.patient_name || t('calendar.patientNotSpecified'))}</h2>
                      </div>
                      <span className={`h-fit px-2 py-1 rounded-full text-[11px] font-bold ${STATUS[selected.status] || STATUS.pending}`}>
                        {selected.source === 'appointment' ? (selected.status === 'scheduled' ? 'Programada' : 'Realizada') : t(`bookingStatus.${selected.status}`)}
                      </span>
                    </div>
                    <div className="rounded-xl bg-[#f9f9fc] border border-[#c3c6d6]/30 p-3 text-[13px] text-[#424654] space-y-2">
                      <p>{new Date(`${selected.date}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                      <p>{hour(selected.start_hour)}{selected.source === 'appointment' ? '' : ` → ${hour(selected.end_hour)}`}</p>
                    </div>
                  </div>
                : <div className="py-8 text-center">
                    <span className="material-symbols-outlined text-[40px] text-[#c3c6d6]">touch_app</span>
                    <p className="mt-3 text-[13px] font-semibold text-[#424654]">{calendarItems.length ? t('calendar.selectService') : t('calendar.noProfessionalServices')}</p>
                  </div>
              }
            </aside>
          </div>
      }
      <AppointmentAccompanimentPanel token={token} />
    </div>
  </section>;
}
