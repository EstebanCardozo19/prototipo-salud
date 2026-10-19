import { useState } from 'react';
import Spinner from '../common/Spinner';

const SENSITIVE_CONTENT = [
  /\b(?:\+?57\s*)?3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b/i,
  /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/i,
  /\b(?:calle|carrera|cra\.?|cl\.?|avenida|av\.?|diagonal|transversal)\s*\d+/i,
  /\b(?:diagnóstico|diagnostico|historia clínica|historia clinica|medicamento|eps|enfermedad|paciente)\b/i,
];
const OFFENSIVE_CONTENT = /\b(?:idiota|imb[eé]cil|est[úu]pido|est[uú]pida|malparid[oa]|hij[oa]\s+de\s+puta)\b/i;

/** Comentario sin estrellas para las dos partes de un servicio cancelado. */
export default function CancelledServiceCommentModal({ booking, token, onClose, onSuccess }) {
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async event => {
    event.preventDefault();
    const text = comment.trim();
    if (text.length < 3) { setError('Escribe al menos 3 caracteres.'); return; }
    if (SENSITIVE_CONTENT.some(pattern => pattern.test(text))) {
      setError('No publiques datos médicos, direcciones ni datos de contacto.'); return;
    }
    if (OFFENSIVE_CONTENT.test(text)) { setError('El comentario debe mantener un lenguaje respetuoso.'); return; }
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/bookings/${booking.id}/cancelled-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ comment: text }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || 'No fue posible guardar el comentario.');
      onSuccess?.(body);
    } catch (requestError) {
      setError(requestError.message);
    } finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-[10000] flex items-center justify-center p-2 sm:p-4" style={{ background: 'rgba(10,15,30,0.70)', backdropFilter: 'blur(8px)' }}>
    <form onSubmit={submit} className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 sm:p-6 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100">
          <span className="material-symbols-outlined text-[24px] text-[#0040a1]">forum</span>
        </div>
        <div className="min-w-0">
          <h2 className="text-[18px] font-bold text-[#1a1c1e]">Comentar experiencia</h2>
          <p className="mt-1 text-[13px] text-[#424654]">Servicio cancelado del {booking.date}. Este comentario no lleva estrellas ni afecta las calificaciones.</p>
        </div>
      </div>
      <label className="mt-5 block text-[13px] font-semibold text-[#424654]">Tu experiencia
        <textarea required minLength={3} maxLength={500} value={comment} onChange={event => setComment(event.target.value)} rows={5} placeholder="Describe hechos de forma respetuosa, sin datos personales o clínicos." className="mt-1.5 w-full resize-none rounded-xl border border-[#c3c6d6] px-3 py-2 text-[14px] outline-none focus:border-[#0040a1] focus:ring-2 focus:ring-[#0040a1]/15" />
      </label>
      <p className="mt-1 text-right text-[11px] text-[#737785]">{comment.length}/500</p>
      <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">No incluyas diagnósticos, tratamientos, direcciones, teléfonos, correos ni lenguaje ofensivo.</p>
      {error && <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={onClose} disabled={saving} className="h-[42px] flex-1 rounded-xl border border-[#c3c6d6] text-[14px] font-semibold text-[#424654] hover:bg-[#f3f3f6] disabled:opacity-60">Volver</button>
        <button type="submit" disabled={saving || comment.trim().length < 3} className="flex h-[42px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#0040a1] text-[14px] font-bold text-white hover:bg-[#003080] disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? <Spinner sm /> : 'Publicar comentario'}
        </button>
      </div>
    </form>
  </div>;
}