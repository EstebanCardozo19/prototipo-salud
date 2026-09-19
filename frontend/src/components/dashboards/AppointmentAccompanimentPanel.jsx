import { useEffect, useState } from 'react';
import Spinner from '../common/Spinner';

const STATUS = {
  pending: ['Pendiente de respuesta', 'bg-amber-100 text-amber-700'],
  accepted: ['Acompañamiento aceptado', 'bg-emerald-100 text-emerald-700'],
  rejected: ['Acompañamiento rechazado', 'bg-red-100 text-red-700'],
};

export default function AppointmentAccompanimentPanel({ token }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const headers = { Authorization: `Bearer ${token}` };

  const load = async () => {
    setLoading(true);
    try { const response = await fetch('/api/appointments/professional', { headers }); setAppointments(response.ok ? await response.json() : []); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [token]);
  const decide = async (id, accepted) => {
    setProcessing(id);
    try {
      const response = await fetch(`/api/appointments/${id}/accompaniment`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ accepted }) });
      if (response.ok) { const updated = await response.json(); setAppointments(items => items.map(item => item.id === id ? updated : item)); }
    } finally { setProcessing(null); }
  };

  return <section className="mt-6 rounded-2xl border border-[#c3c6d6]/40 bg-white p-5 shadow-sm">
    <div><p className="text-[12px] font-bold uppercase tracking-[.12em] text-[#006a61]">Acompañamiento</p><h2 className="mt-1 text-[19px] font-bold text-[#1a1c1e]">Citas médicas asignadas</h2><p className="mt-1 text-[13px] text-[#737785]">Solo se muestran solicitudes de pacientes con un servicio aprobado contigo.</p></div>
    {loading ? <div className="py-8 text-center"><Spinner sm /></div> : !appointments.length ? <p className="py-7 text-center text-[13px] text-[#737785]">No tienes solicitudes de acompañamiento.</p> : <div className="mt-5 space-y-3">{appointments.map(item => { const [label, color] = STATUS[item.accompaniment_status] || STATUS.pending; return <article key={item.id} className="flex flex-col gap-3 rounded-xl border border-[#e5e7ef] p-4 md:flex-row md:items-center md:justify-between"><div><p className="font-bold text-[#1a1c1e]">{item.patient_name} · {item.appointment_type}</p><p className="mt-1 text-[13px] text-[#424654]">{item.date} · {item.time}{item.location ? ` · ${item.location}` : ''}</p>{item.treating_professional && <p className="text-[12px] text-[#737785]">{item.treating_professional}</p>}{item.notes && <p className="mt-1 text-[12px] text-[#737785]">{item.notes}</p>}</div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${color}`}>{label}</span>{item.accompaniment_status === 'pending' && <><button disabled={processing === item.id} onClick={() => decide(item.id, true)} className="h-9 rounded-lg bg-emerald-600 px-3 text-[12px] font-semibold text-white disabled:opacity-60">Aceptar</button><button disabled={processing === item.id} onClick={() => decide(item.id, false)} className="h-9 rounded-lg bg-red-600 px-3 text-[12px] font-semibold text-white disabled:opacity-60">Rechazar</button></>}</div></article>; })}</div>}
  </section>;
}