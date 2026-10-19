import { useEffect, useState } from 'react';
import { useLang } from '../../contexts/LangContext';
import Spinner from '../common/Spinner';
import CalendarSchedule from '../common/CalendarSchedule';

const SERVICE_STATUS = {
  pending: ['bg-amber-100 text-amber-700', 'schedule'],
  approved: ['bg-[#dae2ff] text-[#0040a1]', 'check_circle'],
  completed: ['bg-emerald-100 text-emerald-700', 'task_alt'],
  rejected: ['bg-red-100 text-red-700', 'cancel'],
  cancelled: ['bg-[#f3f3f6] text-[#737785]', 'event_busy'],
};
const APPOINTMENT_STATUS = {
  scheduled: 'bg-violet-100 text-violet-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-[#f3f3f6] text-[#737785]',
};
const appointmentLabel = status => ({ scheduled: 'Programada', completed: 'Realizada', cancelled: 'Cancelada' }[status] || status);
const hour = value => {
  const text = String(value ?? '');
  return text.includes(':') ? text.slice(0, 5) : `${text.padStart(2, '0')}:00`;
};

export default function FamilyCalendar({ token, onOpenAppointments }) {
  const { t, lang } = useLang();
  const [records, setRecords] = useState([]);
  const [recordId, setRecordId] = useState('');
  const [bookings, setBookings] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/clinical-records/', { headers });
        const data = response.ok ? await response.json() : [];
        setRecords(data);
        if (data[0]) setRecordId(String(data[0].id));
      } catch { setRecords([]); }
      finally { setLoading(false); }
    };
    load();
  }, [token]);

  useEffect(() => {
    if (!recordId) return;
    const load = async () => {
      setLoading(true); setSelected(null);
      try {
        const [bookingResponse, appointmentResponse] = await Promise.all([
          fetch(`/api/bookings/family-calendar?clinical_record_id=${recordId}`, { headers }),
          fetch('/api/appointments/family', { headers }),
        ]);
        const services = bookingResponse.ok ? await bookingResponse.json() : [];
        const medicalAppointments = appointmentResponse.ok ? await appointmentResponse.json() : [];
        setBookings(services);
        setAppointments(medicalAppointments
          .filter(item => String(item.clinical_record_id) === recordId)
          .map(item => ({ ...item, id: `appointment-${item.id}`, source: 'appointment', start_hour: item.time, end_hour: item.time })));
      } catch { setBookings([]); setAppointments([]); }
      finally { setLoading(false); }
    };
    load();
  }, [recordId, token]);

  const patient = records.find(record => String(record.id) === recordId);
  const calendarItems = [...bookings, ...appointments];
  const statusClasses = {
    ...Object.fromEntries(Object.entries(SERVICE_STATUS).map(([key, [color]]) => [key, color])),
    ...APPOINTMENT_STATUS,
  };

  if (loading && !records.length) return <div className="h-full flex flex-col items-center justify-center gap-3"><Spinner /><p className="text-[14px] text-[#737785]">{t('common.loading')}</p></div>;

  return <section className="h-full overflow-y-auto bg-[#f3f3f6]/50 p-4 sm:p-6 md:p-8"><div className="max-w-6xl mx-auto">
    <header className="mb-6"><p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#006a61]">{t('calendar.familyServices')}</p><h1 className="text-[24px] font-bold text-[#1a1c1e] mt-1">{t('calendar.title')}</h1><p className="text-[14px] text-[#737785] mt-1">{t('calendar.subtitle')}</p></header>
    {!records.length ? <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm py-16 text-center"><span className="material-symbols-outlined text-[52px] text-[#c3c6d6]">calendar_month</span><p className="mt-3 font-bold text-[#1a1c1e]">{t('calendar.noPatients')}</p><p className="mt-1 text-[13px] text-[#737785]">{t('calendar.noPatientsHint')}</p></div> : <>
      <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-4 mb-5 flex flex-col md:flex-row md:items-end gap-4"><label className="w-full md:max-w-sm"><span className="block text-[12px] font-semibold text-[#424654] mb-1.5">{t('calendar.selectPatient')}</span><select value={recordId} onChange={event => setRecordId(event.target.value)} className="w-full h-[42px] px-3 rounded-xl border border-[#c3c6d6] bg-white text-[14px] font-semibold">{records.map(record => <option key={record.id} value={record.id}>{record.patient_name}</option>)}</select></label><div className="flex flex-wrap gap-2 text-[11px]">{Object.entries(SERVICE_STATUS).map(([status, [color]]) => <span key={status} className={`px-2 py-1 rounded-full font-semibold ${color}`}>{t(`bookingStatus.${status}`)}</span>)}<span className="px-2 py-1 rounded-full font-semibold bg-violet-100 text-violet-700">Cita médica</span></div></div>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_300px] gap-5"><CalendarSchedule bookings={calendarItems} statusClasses={statusClasses} renderLabel={item => item.source === 'appointment' ? item.appointment_type : (item.professional_name || '—')} onSelect={setSelected} />
      <aside className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-5 h-fit">{selected ? selected.source === 'appointment' ? <div className="space-y-4"><div className="flex justify-between gap-2"><div><p className="text-[11px] font-bold uppercase text-[#737785]">{patient?.patient_name}</p><h2 className="font-bold text-[17px] mt-1">{selected.appointment_type}</h2></div><span className={`h-fit px-2 py-1 rounded-full text-[11px] font-bold ${APPOINTMENT_STATUS[selected.status]}`}>{appointmentLabel(selected.status)}</span></div><div className="rounded-xl bg-[#f9f9fc] border border-[#c3c6d6]/30 p-3 text-[13px] text-[#424654] space-y-2"><p>{new Date(`${selected.date}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p><p>{selected.time}</p></div><button onClick={onOpenAppointments} className="w-full h-10 rounded-xl bg-[#0040a1] text-[13px] font-semibold text-white">Abrir detalle de la cita</button></div> : <div className="space-y-4"><div className="flex justify-between gap-2"><div><p className="text-[11px] font-bold uppercase text-[#737785]">{patient?.patient_name}</p><h2 className="font-bold text-[17px] mt-1">{selected.professional_name || '—'}</h2></div><span className={`h-fit px-2 py-1 rounded-full text-[11px] font-bold ${(SERVICE_STATUS[selected.status] || SERVICE_STATUS.pending)[0]}`}>{t(`bookingStatus.${selected.status}`)}</span></div><div className="rounded-xl bg-[#f9f9fc] border border-[#c3c6d6]/30 p-3 text-[13px] text-[#424654] space-y-2"><p>{new Date(`${selected.date}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p><p>{hour(selected.start_hour)} — {hour(selected.end_hour)}</p><p>{selected.professional_role === 'caregiver' ? t('calendar.caregiver') : t('calendar.nurse')}</p></div></div> : <div className="py-8 text-center"><span className="material-symbols-outlined text-[40px] text-[#c3c6d6]">touch_app</span><p className="mt-3 text-[13px] font-semibold text-[#424654]">{loading ? t('common.loading') : t('calendar.selectService')}</p></div>}</aside></div>
    </>}</div></section>;
}
