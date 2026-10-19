import { useState } from 'react';
import Spinner from '../common/Spinner';

/** Confirmación explícita de la cancelación de un servicio aceptado. */
export default function CancelServiceModal({ booking, token, onClose, onSuccess }) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async event => {
    event.preventDefault();
    const trimmedReason = reason.trim();
    if (!trimmedReason) { setError('Indica el motivo de la cancelación.'); return; }
    if (!confirmed) { setError('Debes confirmar que deseas cancelar el servicio.'); return; }

    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/bookings/${booking.id}/cancel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: trimmedReason }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || 'No fue posible cancelar el servicio.');
      onSuccess(body);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(10,15,30,0.65)', backdropFilter: 'blur(8px)' }}>
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-100">
          <span className="material-symbols-outlined text-[24px] text-red-600">event_busy</span>
        </div>
        <div>
          <h2 className="text-[18px] font-bold text-[#1a1c1e]">Cancelar servicio</h2>
          <p className="mt-1 text-[13px] text-[#424654]">Esta acción cancelará el servicio aprobado del {booking.date} y notificará a la otra parte.</p>
        </div>
      </div>
      <label className="mt-5 block text-[13px] font-semibold text-[#424654]">Motivo de cancelación <span className="text-red-600">*</span>
        <textarea required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} rows={4} placeholder="Describe el motivo de la cancelación" className="mt-1.5 w-full resize-none rounded-xl border border-[#c3c6d6] px-3 py-2 text-[14px] outline-none focus:border-[#0040a1] focus:ring-2 focus:ring-[#0040a1]/15" />
      </label>
      <label className="mt-4 flex cursor-pointer items-start gap-2 text-[13px] text-[#424654]">
        <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0040a1]" />
        <span>Confirmo que deseo cancelar este servicio.</span>
      </label>
      {error && <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}
      <div className="mt-5 flex gap-3">
        <button type="button" onClick={onClose} disabled={saving} className="h-[42px] flex-1 rounded-xl border border-[#c3c6d6] text-[14px] font-semibold text-[#424654] hover:bg-[#f3f3f6] disabled:opacity-60">Volver</button>
        <button type="submit" disabled={saving || !reason.trim() || !confirmed} className="flex h-[42px] flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 text-[14px] font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? <Spinner sm /> : 'Confirmar cancelación'}
        </button>
      </div>
    </form>
  </div>;
}