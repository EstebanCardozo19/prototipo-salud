import { useEffect, useState } from 'react';
import Spinner from '../common/Spinner';

const STATUS = {
  none: ['Sin acompañamiento', 'bg-slate-100 text-slate-600'],
  pending: ['Acompañamiento pendiente', 'bg-amber-100 text-amber-700'],
  accepted: ['Acompañamiento aceptado', 'bg-emerald-100 text-emerald-700'],
  rejected: ['Acompañamiento rechazado', 'bg-red-100 text-red-700'],
};

const initialForm = recordId => ({
  clinical_record_id: recordId || '', appointment_type: '', date: '', time: '', location: '', treating_professional: '', notes: '',
  recurrence_frequency: '', recurrence_until: '', accompaniment_professional_user_id: '',
});

export default function MedicalAppointments({ token, records }) {
  const [appointments, setAppointments] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [form, setForm] = useState(() => initialForm(records[0]?.id));
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const headers = { Authorization: `Bearer ${token}` };
  const loadAppointments = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/appointments/family', { headers });
      setAppointments(response.ok ? await response.json() : []);
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAppointments(); }, [token]);

  useEffect(() => {
    if (!form.clinical_record_id) { setProfessionals([]); return; }
    fetch(`/api/appointments/eligible-professionals?clinical_record_id=${form.clinical_record_id}`, { headers })
      .then(response => response.ok ? response.json() : [])
      .then(setProfessionals)
      .catch(() => setProfessionals([]));
  }, [form.clinical_record_id, token]);

  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const create = async event => {
    event.preventDefault(); setSaving(true); setError('');
    const payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ''));
    payload.clinical_record_id = Number(payload.clinical_record_id);
    if (payload.accompaniment_professional_user_id) payload.accompaniment_professional_user_id = Number(payload.accompaniment_professional_user_id);
    try {
      const response = await fetch('/api/appointments/', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) { const body = await response.json(); throw new Error(body.detail || 'No fue posible registrar la cita'); }
      setOpen(false); setForm(initialForm(records[0]?.id)); await loadAppointments();
    } catch (requestError) { setError(requestError.message); } finally { setSaving(false); }
  };

  return <section className="mt-6 rounded-2xl border border-[#c3c6d6]/40 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[12px] font-bold uppercase tracking-[.12em] text-[#006a61]">Salud del paciente</p><h2 className="mt-1 text-[19px] font-bold text-[#1a1c1e]">Citas médicas</h2><p className="mt-1 text-[13px] text-[#737785]">Gestiona citas y solicita acompañamiento a un profesional con servicio activo.</p></div><button onClick={() => { setOpen(value => !value); setError(''); }} className="h-10 rounded-xl bg-[#0040a1] px-4 text-[13px] font-semibold text-white"><span className="material-symbols-outlined mr-1 align-middle text-[17px]">add_circle</span>Registrar cita</button></div>
    {open && <form onSubmit={create} className="mt-5 grid gap-3 rounded-xl border border-[#dae2ff] bg-[#f7f9ff] p-4 md:grid-cols-2">
      <label className="text-[12px] font-semibold text-[#424654]">Paciente<select required name="clinical_record_id" value={form.clinical_record_id} onChange={update} className="mt-1 block h-10 w-full rounded-lg border border-[#c3c6d6] bg-white px-3">{records.map(record => <option key={record.id} value={record.id}>{record.patient_name}</option>)}</select></label>
      <label className="text-[12px] font-semibold text-[#424654]">Tipo o motivo<input required name="appointment_type" value={form.appointment_type} onChange={update} className="mt-1 block h-10 w-full rounded-lg border border-[#c3c6d6] px-3" placeholder="Control, odontología..." /></label>
      <label className="text-[12px] font-semibold text-[#424654]">Fecha<input required type="date" name="date" value={form.date} onChange={update} className="mt-1 block h-10 w-full rounded-lg border border-[#c3c6d6] px-3" /></label>
      <label className="text-[12px] font-semibold text-[#424654]">Hora<input required type="time" name="time" value={form.time} onChange={update} className="mt-1 block h-10 w-full rounded-lg border border-[#c3c6d6] px-3" /></label>
      <label className="text-[12px] font-semibold text-[#424654]">Lugar<input name="location" value={form.location} onChange={update} className="mt-1 block h-10 w-full rounded-lg border border-[#c3c6d6] px-3" /></label>
      <label className="text-[12px] font-semibold text-[#424654]">Médico o institución<input name="treating_professional" value={form.treating_professional} onChange={update} className="mt-1 block h-10 w-full rounded-lg border border-[#c3c6d6] px-3" /></label>
      <label className="text-[12px] font-semibold text-[#424654]">Repetir<select name="recurrence_frequency" value={form.recurrence_frequency} onChange={update} className="mt-1 block h-10 w-full rounded-lg border border-[#c3c6d6] bg-white px-3"><option value="">No se repite</option><option value="weekly">Semanal</option><option value="monthly">Mensual</option></select></label>
      {form.recurrence_frequency && <label className="text-[12px] font-semibold text-[#424654]">Repetir hasta<input required type="date" name="recurrence_until" value={form.recurrence_until} onChange={update} className="mt-1 block h-10 w-full rounded-lg border border-[#c3c6d6] px-3" /></label>}
      <label className="text-[12px] font-semibold text-[#424654]">Solicitar acompañamiento<select name="accompaniment_professional_user_id" value={form.accompaniment_professional_user_id} onChange={update} className="mt-1 block h-10 w-full rounded-lg border border-[#c3c6d6] bg-white px-3"><option value="">No solicitar</option>{professionals.map(professional => <option key={professional.id} value={professional.id}>{professional.name} ({professional.role === 'nurse' ? 'Enfermería' : 'Cuidador/a'})</option>)}</select></label>
      <label className="md:col-span-2 text-[12px] font-semibold text-[#424654]">Notas<textarea name="notes" value={form.notes} onChange={update} className="mt-1 block min-h-20 w-full rounded-lg border border-[#c3c6d6] p-3" /></label>
      {error && <p className="md:col-span-2 text-[12px] font-semibold text-red-700">{error}</p>}<div className="flex gap-2 md:col-span-2"><button disabled={saving} className="h-10 rounded-xl bg-[#0040a1] px-5 text-[13px] font-semibold text-white disabled:opacity-60">{saving ? 'Guardando...' : 'Guardar cita'}</button><button type="button" onClick={() => setOpen(false)} className="h-10 rounded-xl px-4 text-[13px] font-semibold text-[#424654]">Cancelar</button></div>
    </form>}
    {loading ? <div className="py-8 text-center"><Spinner sm /></div> : !appointments.length ? <p className="py-7 text-center text-[13px] text-[#737785]">Aún no hay citas médicas registradas.</p> : <div className="mt-5 space-y-3">{appointments.map(item => { const [status, color] = STATUS[item.accompaniment_status] || STATUS.none; return <article key={item.id} className="flex flex-col gap-3 rounded-xl border border-[#e5e7ef] p-4 md:flex-row md:items-center md:justify-between"><div><p className="font-bold text-[#1a1c1e]">{item.appointment_type} <span className="font-normal text-[#737785]">· {item.patient_name}</span></p><p className="mt-1 text-[13px] text-[#424654]">{item.date} · {item.time}{item.location ? ` · ${item.location}` : ''}</p>{item.treating_professional && <p className="text-[12px] text-[#737785]">{item.treating_professional}</p>}</div><div className="text-left md:text-right"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${color}`}>{status}</span>{item.accompaniment_professional_name && <p className="mt-2 text-[12px] text-[#424654]">{item.accompaniment_professional_name}</p>}</div></article>; })}</div>}
  </section>;
}