import { useEffect, useState } from 'react';
import Spinner from '../common/Spinner';

const STATUS = {
  none: ['Sin acompañamiento', 'bg-slate-100 text-slate-600'],
  pending: ['Acompañamiento pendiente', 'bg-amber-100 text-amber-700'],
  accepted: ['Acompañamiento aceptado', 'bg-emerald-100 text-emerald-700'],
  rejected: ['Acompañamiento rechazado', 'bg-red-100 text-red-700'],
};
const APPOINTMENT_STATUS = {
  scheduled: ['Programada', 'bg-blue-100 text-blue-700'],
  completed: ['Realizada', 'bg-emerald-100 text-emerald-700'],
  cancelled: ['Cancelada', 'bg-slate-100 text-slate-600'],
};

const initialForm = recordId => ({
  clinical_record_id: recordId || '', appointment_type: '', date: '', time: '', location: '', treating_professional: '', notes: '',
  recurrence_frequency: '', recurrence_until: '', accompaniment_professional_user_id: '', document_ids: [], pending_documents: [],
});

export default function MedicalAppointments({ token }) {
  const [records, setRecords] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [form, setForm] = useState(() => initialForm(records[0]?.id));
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingDocument, setPendingDocument] = useState('');
  const [editing, setEditing] = useState(null);
  const [outcome, setOutcome] = useState(null);

  const headers = { Authorization: `Bearer ${token}` };
  const loadAppointments = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/appointments/family', { headers });
      setAppointments(response.ok ? await response.json() : []);
    } finally { setLoading(false); }
  };
  useEffect(() => {
    const loadRecords = async () => {
      try {
        const response = await fetch('/api/clinical-records/', { headers });
        const data = response.ok ? await response.json() : [];
        setRecords(data);
        setForm(current => current.clinical_record_id || !data[0] ? current : { ...current, clinical_record_id: data[0].id });
      } catch { setRecords([]); }
    };
    loadRecords();
    loadAppointments();
  }, [token]);

  useEffect(() => {
    if (!form.clinical_record_id) { setProfessionals([]); return; }
    fetch(`/api/appointments/eligible-professionals?clinical_record_id=${form.clinical_record_id}`, { headers })
      .then(response => response.ok ? response.json() : [])
      .then(setProfessionals)
      .catch(() => setProfessionals([]));
  }, [form.clinical_record_id, token]);
  useEffect(() => {
    if (!form.clinical_record_id) { setDocuments([]); return; }
    fetch(`/api/clinical-records/${form.clinical_record_id}/documents`, { headers })
      .then(response => response.ok ? response.json() : [])
      .then(setDocuments)
      .catch(() => setDocuments([]));
  }, [form.clinical_record_id, token]);

  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const create = async event => {
    event.preventDefault(); setSaving(true); setError('');
    const payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ''));
    payload.clinical_record_id = Number(payload.clinical_record_id);
    if (editing) {
      delete payload.accompaniment_professional_user_id; delete payload.recurrence_frequency; delete payload.recurrence_until;
    } else if (payload.accompaniment_professional_user_id) payload.accompaniment_professional_user_id = Number(payload.accompaniment_professional_user_id);
    try {
      const response = await fetch(editing ? `/api/appointments/${editing.id}/details` : '/api/appointments/', { method: editing ? 'PUT' : 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) { const body = await response.json(); throw new Error(body.detail || 'No fue posible registrar la cita'); }
      setOpen(false); setEditing(null); setForm(initialForm(records[0]?.id)); await loadAppointments();
    } catch (requestError) { setError(requestError.message); } finally { setSaving(false); }
  };
  const toggleDocument = id => setForm(current => ({ ...current, document_ids: current.document_ids.includes(id) ? current.document_ids.filter(item => item !== id) : [...current.document_ids, id] }));
  const addPendingDocument = () => {
    const value = pendingDocument.trim();
    if (value && !form.pending_documents.includes(value)) setForm(current => ({ ...current, pending_documents: [...current.pending_documents, value] }));
    setPendingDocument('');
  };
  const startEdit = item => { setEditing(item); setForm({ ...initialForm(item.clinical_record_id), ...item, clinical_record_id: String(item.clinical_record_id), recurrence_frequency: '', recurrence_until: '', accompaniment_professional_user_id: '' }); setOpen(true); setError(''); };
  const cancelAppointment = async id => {
    if (!window.confirm('¿Cancelar esta cita médica?')) return;
    const response = await fetch(`/api/appointments/${id}/cancel`, { method: 'PUT', headers });
    if (response.ok) await loadAppointments(); else { const body = await response.json(); setError(body.detail || 'No fue posible cancelar la cita'); }
  };
  const saveOutcome = async event => {
    event.preventDefault(); setSaving(true); setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget)); data.follow_up_pending = data.follow_up_pending === 'on';
    try {
      const response = await fetch(`/api/appointments/${outcome.id}/outcome`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!response.ok) { const body = await response.json(); throw new Error(body.detail || 'No fue posible guardar el resultado'); }
      setOutcome(null); await loadAppointments();
    } catch (requestError) { setError(requestError.message); } finally { setSaving(false); }
  };

  return <section className="mt-6 rounded-2xl border border-[#c3c6d6]/40 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[12px] font-bold uppercase tracking-[.12em] text-[#006a61]">Salud del paciente</p><h2 className="mt-1 text-[19px] font-bold text-[#1a1c1e]">Citas médicas</h2><p className="mt-1 text-[13px] text-[#737785]">Gestiona citas, documentos y seguimiento sin requerir un servicio contratado.</p></div><button onClick={() => { setEditing(null); setForm(initialForm(records[0]?.id)); setOpen(value => !value); setError(''); }} className="h-10 rounded-xl bg-[#0040a1] px-4 text-[13px] font-semibold text-white"><span className="material-symbols-outlined mr-1 align-middle text-[17px]">add_circle</span>Registrar cita</button></div>
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
      <div className="md:col-span-2 rounded-lg border border-[#c3c6d6]/50 bg-white p-3"><p className="text-[12px] font-semibold text-[#424654]">Documentos privados para llevar</p><p className="mb-2 text-[11px] text-[#737785]">Puedes cargar fotos o PDF desde la ficha del paciente y seleccionarlos aquí.</p>{documents.length ? documents.map(document => <label key={document.id} className="mr-3 inline-flex items-center gap-1 text-[12px] text-[#424654]"><input type="checkbox" checked={form.document_ids.includes(document.id)} onChange={() => toggleDocument(document.id)} />{document.original_filename}</label>) : <p className="text-[12px] text-[#737785]">No hay documentos cargados para este paciente.</p>}</div>
      <div className="md:col-span-2"><p className="text-[12px] font-semibold text-[#424654]">Documentos pendientes</p><div className="mt-1 flex gap-2"><input value={pendingDocument} onChange={event => setPendingDocument(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addPendingDocument(); } }} placeholder="Ej. Orden médica" className="h-9 flex-1 rounded-lg border border-[#c3c6d6] px-3 text-[12px]" /><button type="button" onClick={addPendingDocument} className="rounded-lg border border-[#c3c6d6] px-3 text-[12px]">Añadir</button></div><div className="mt-2 flex flex-wrap gap-1">{form.pending_documents.map(item => <button type="button" key={item} onClick={() => setForm(current => ({ ...current, pending_documents: current.pending_documents.filter(value => value !== item) }))} className="rounded-full bg-amber-100 px-2 py-1 text-[11px] text-amber-800">{item} ×</button>)}</div></div>
      <label className="md:col-span-2 text-[12px] font-semibold text-[#424654]">Notas<textarea name="notes" value={form.notes} onChange={update} className="mt-1 block min-h-20 w-full rounded-lg border border-[#c3c6d6] p-3" /></label>
      {error && <p className="md:col-span-2 text-[12px] font-semibold text-red-700">{error}</p>}<div className="flex gap-2 md:col-span-2"><button disabled={saving} className="h-10 rounded-xl bg-[#0040a1] px-5 text-[13px] font-semibold text-white disabled:opacity-60">{saving ? 'Guardando...' : 'Guardar cita'}</button><button type="button" onClick={() => setOpen(false)} className="h-10 rounded-xl px-4 text-[13px] font-semibold text-[#424654]">Cancelar</button></div>
    </form>}
    {outcome && <form onSubmit={saveOutcome} className="mt-4 grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="font-bold text-[14px]">Resultado de: {outcome.appointment_type}</p><textarea name="outcome_notes" defaultValue={outcome.outcome_notes || ''} placeholder="¿Cómo le fue?" className="min-h-16 rounded-lg border border-[#c3c6d6] p-3 text-[13px]" /><textarea name="medical_recommendations" defaultValue={outcome.medical_recommendations || ''} placeholder="Recomendaciones del médico" className="min-h-16 rounded-lg border border-[#c3c6d6] p-3 text-[13px]" /><label className="text-[13px]"><input type="checkbox" name="follow_up_pending" defaultChecked={outcome.follow_up_pending} /> Tiene control pendiente</label><input name="follow_up_notes" defaultValue={outcome.follow_up_notes || ''} placeholder="Detalle del control pendiente" className="h-10 rounded-lg border border-[#c3c6d6] px-3 text-[13px]" /><div><button disabled={saving} className="rounded-xl bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white">Guardar resultado</button><button type="button" onClick={() => setOutcome(null)} className="ml-2 px-3 text-[13px]">Cancelar</button></div></form>}
    {loading ? <div className="py-8 text-center"><Spinner sm /></div> : !appointments.length ? <p className="py-7 text-center text-[13px] text-[#737785]">Aún no hay citas médicas registradas.</p> : <div className="mt-5 space-y-3">{appointments.map(item => { const [accompaniment, accompanimentColor] = STATUS[item.accompaniment_status] || STATUS.none; const [appointmentStatus, appointmentColor] = APPOINTMENT_STATUS[item.status] || APPOINTMENT_STATUS.scheduled; return <article key={item.id} className="flex flex-col gap-3 rounded-xl border border-[#e5e7ef] p-4 md:flex-row md:items-center md:justify-between"><div><p className="font-bold text-[#1a1c1e]">{item.appointment_type} <span className="font-normal text-[#737785]">· {item.patient_name}</span></p><p className="mt-1 text-[13px] text-[#424654]">{item.date} · {item.time}{item.location ? ` · ${item.location}` : ''}</p>{item.treating_professional && <p className="text-[12px] text-[#737785]">{item.treating_professional}</p>}{item.pending_documents?.length > 0 && <p className="mt-1 text-[12px] text-amber-700">Pendiente: {item.pending_documents.join(', ')}</p>}{item.document_ids?.length > 0 && <p className="text-[12px] text-[#006a61]">{item.document_ids.length} documento(s) privado(s) adjunto(s)</p>}{item.outcome_notes && <p className="mt-1 text-[12px] text-[#424654]"><b>Resultado:</b> {item.outcome_notes}</p>}{item.medical_recommendations && <p className="text-[12px] text-[#424654]"><b>Recomendaciones:</b> {item.medical_recommendations}</p>}{item.follow_up_pending && <p className="text-[12px] font-semibold text-amber-700">Control pendiente{item.follow_up_notes ? `: ${item.follow_up_notes}` : ''}</p>}</div><div className="flex flex-wrap items-center gap-2 text-left md:justify-end"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${appointmentColor}`}>{appointmentStatus}</span><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${accompanimentColor}`}>{accompaniment}</span>{item.accompaniment_professional_name && <p className="text-[12px] text-[#424654]">{item.accompaniment_professional_name}</p>}{item.status === 'scheduled' && <><button onClick={() => startEdit(item)} className="text-[12px] font-semibold text-[#0040a1]">Editar</button><button onClick={() => setOutcome(item)} className="text-[12px] font-semibold text-emerald-700">Registrar resultado</button><button onClick={() => cancelAppointment(item.id)} className="text-[12px] font-semibold text-red-600">Cancelar cita</button></>}</div></article>; })}</div>}
  </section>;
}