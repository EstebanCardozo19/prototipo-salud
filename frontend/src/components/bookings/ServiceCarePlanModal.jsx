import { useEffect, useState } from 'react';
import Spinner from '../common/Spinner';

const EMPTY_MEDICATION = { medication: '', dosage: '', time: '', instructions: '' };

export default function ServiceCarePlanModal({ booking, user, token, onClose }) {
  const canEdit = booking.professional_user_id === user.id;
  const [plan, setPlan] = useState({ medication_schedule: [], emergency_protocol: '', treating_physician_contact: '' });
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/service-care-plans/${booking.id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'No fue posible cargar el plan');
        const data = await res.json();
        if (data) setPlan({ medication_schedule: data.medication_schedule || [], emergency_protocol: data.emergency_protocol || '', treating_physician_contact: data.treating_physician_contact || '' });
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    };
    load();
  }, [booking.id, token]);

  const updateMedication = (index, field, value) => setPlan(current => ({ ...current, medication_schedule: current.medication_schedule.map((item, i) => i === index ? { ...item, [field]: value } : item) }));
  const save = async event => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const medication_schedule = plan.medication_schedule.filter(item => item.medication.trim() || item.dosage.trim() || item.time.trim());
      if (medication_schedule.some(item => !item.medication.trim() || !item.dosage.trim() || !item.time.trim())) throw new Error('Completa medicamento, dosis y horario en cada pauta agregada.');
      const res = await fetch(`/api/service-care-plans/${booking.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...plan, medication_schedule }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'No fue posible guardar el plan');
      const data = await res.json();
      setPlan({ medication_schedule: data.medication_schedule || [], emergency_protocol: data.emergency_protocol || '', treating_physician_contact: data.treating_physician_contact || '' });
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  const ask = async event => {
    event.preventDefault(); if (!question.trim() || asking) return; setAsking(true); setError('');
    try {
      const res = await fetch(`/api/service-care-plans/${booking.id}/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ message: question.trim() }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'No fue posible consultar el asistente');
      const data = await res.json(); setAnswer(data.response); setQuestion('');
    } catch (err) { setError(err.message); }
    finally { setAsking(false); }
  };

  return <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#071426]/60 p-4 backdrop-blur-sm">
    <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-start justify-between border-b border-[#dce3eb] px-6 py-4"><div><h2 className="flex items-center gap-2 text-[18px] font-bold text-[#17324d]"><span className="material-symbols-outlined text-[#0040a1]">health_and_safety</span>Plan documental del servicio</h2><p className="mt-1 text-[12px] text-[#5d6875]">{booking.patient_name || 'Paciente'} · Servicio del {booking.date}</p></div><button onClick={onClose} className="rounded-lg p-1 text-[#536779] hover:bg-[#edf2f6]" aria-label="Cerrar"><span className="material-symbols-outlined">close</span></button></header>
      {loading ? <div className="flex justify-center p-16"><Spinner /></div> : <div className="overflow-y-auto p-6">
        {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}
        {canEdit && <form onSubmit={save} className="mb-6 rounded-2xl border border-[#dce3eb] p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-bold text-[#17324d]">Pautas autorizadas por el profesional</h3><button type="button" onClick={() => setPlan(current => ({ ...current, medication_schedule: [...current.medication_schedule, { ...EMPTY_MEDICATION }] }))} className="text-[12px] font-bold text-[#0040a1]">+ Agregar medicamento</button></div><div className="space-y-3">{plan.medication_schedule.map((item, index) => <div key={index} className="grid gap-2 rounded-xl bg-[#f6f8fb] p-3 md:grid-cols-[1.2fr_1fr_.7fr_1.5fr_auto]"><input required value={item.medication} onChange={e => updateMedication(index, 'medication', e.target.value)} placeholder="Medicamento" className="rounded-lg border border-[#cbd5df] px-2 py-2 text-[12px]" /><input required value={item.dosage} onChange={e => updateMedication(index, 'dosage', e.target.value)} placeholder="Dosis autorizada" className="rounded-lg border border-[#cbd5df] px-2 py-2 text-[12px]" /><input required value={item.time} onChange={e => updateMedication(index, 'time', e.target.value)} placeholder="Horario" className="rounded-lg border border-[#cbd5df] px-2 py-2 text-[12px]" /><input value={item.instructions || ''} onChange={e => updateMedication(index, 'instructions', e.target.value)} placeholder="Indicaciones" className="rounded-lg border border-[#cbd5df] px-2 py-2 text-[12px]" /><button type="button" onClick={() => setPlan(current => ({ ...current, medication_schedule: current.medication_schedule.filter((_, i) => i !== index) }))} className="text-red-600" aria-label="Eliminar pauta"><span className="material-symbols-outlined text-[18px]">delete</span></button></div>)}</div><textarea value={plan.emergency_protocol} onChange={e => setPlan(current => ({ ...current, emergency_protocol: e.target.value }))} maxLength="3000" placeholder="Protocolo de emergencia autorizado: pasos y criterios de actuación." className="mt-3 min-h-24 w-full rounded-xl border border-[#cbd5df] p-3 text-[13px]" /><input value={plan.treating_physician_contact} onChange={e => setPlan(current => ({ ...current, treating_physician_contact: e.target.value }))} maxLength="500" placeholder="Contacto del médico tratante o canal de escalamiento" className="mt-3 w-full rounded-xl border border-[#cbd5df] p-3 text-[13px]" /><button disabled={saving} className="mt-4 rounded-xl bg-[#0040a1] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar pautas autorizadas'}</button></form>}
        <section className="rounded-2xl border border-[#b9d7ed] bg-[#f6fbff] p-4"><h3 className="flex items-center gap-2 font-bold text-[#17324d]"><span className="material-symbols-outlined text-[#0040a1]">smart_toy</span>Asistente de consulta y recordatorios</h3><p className="mt-1 text-[12px] leading-5 text-[#4d6274]">Consulta horarios registrados, contactos y protocolos. No entrega diagnósticos ni modifica dosis. Ante una alerta, prioriza urgencias y notifica preventivamente al profesional.</p><form onSubmit={ask} className="mt-3 flex gap-2"><input value={question} onChange={e => setQuestion(e.target.value)} disabled={asking} placeholder="Ej.: ¿Cuál es el horario de los medicamentos?" className="min-w-0 flex-1 rounded-xl border border-[#b9cbd9] bg-white px-3 py-2 text-[13px]" /><button disabled={asking || !question.trim()} className="rounded-xl bg-[#0040a1] px-4 text-[13px] font-bold text-white disabled:opacity-60">{asking ? <Spinner sm /> : 'Consultar'}</button></form>{answer && <div className="mt-3 whitespace-pre-wrap rounded-xl border border-[#c9e1f0] bg-white p-3 text-[13px] leading-5 text-[#29465d]">{answer}</div>}</section>
      </div>}
    </div>
  </div>;
}