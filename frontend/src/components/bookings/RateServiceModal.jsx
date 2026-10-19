/**
 * RateServiceModal — Modal para que un familiar califique a un profesional
 * tras un servicio completado, y/o para que un profesional califique al familiar.
 *
 * Props:
 *   booking        {object}  Booking completado
 *   token          {string}
 *   role           {string}  'family' | 'caregiver' | 'nurse'
 *   onClose        {fn}
 *   onSuccess      {fn}      Se llama tras guardar la calificación
 */
import { useState } from 'react';
import StarRating from '../common/StarRating';
import Spinner from '../common/Spinner';

export default function RateServiceModal({ booking, token, role, onClose, onSuccess }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isFamily = role === 'family';
  const targetName = isFamily ? booking.professional_name : booking.family_name;
  const targetRole = isFamily ? 'al profesional' : 'al familiar';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = isFamily ? '/api/bookings/reviews' : '/api/bookings/family-reviews';
      const body = isFamily
        ? {
            professional_user_id: booking.professional_user_id,
            booking_id: booking.id,
            rating,
            comment: comment.trim() || null,
          }
        : {
            family_user_id: booking.family_user_id,
            booking_id: booking.id,
            rating,
            comment: comment.trim() || null,
          };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || 'Error al guardar la calificación');
      }

      onSuccess && onSuccess(rating);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ background: 'rgba(10,15,30,0.70)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-fade-in-up">

        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-400 px-6 py-5 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[22px]"
                style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
            </div>
            <div>
              <h2 className="text-white font-bold text-[17px] leading-tight">Calificar servicio</h2>
              <p className="text-white/75 text-[12px]">Califica {targetRole}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25 transition-all"
          >
            <span className="material-symbols-outlined text-white text-[19px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">

          {/* Info del servicio */}
          <div className="bg-[#f9f9fc] rounded-xl px-4 py-3 border border-[#c3c6d6]/40">
            <p className="text-[11px] font-bold text-[#737785] uppercase tracking-wide mb-0.5">Servicio completado</p>
            <p className="text-[14px] font-bold text-[#1a1c1e]">{targetName}</p>
            <p className="text-[12px] text-[#424654]">{booking.date} · {booking.start_hour}:00 – {booking.end_hour}:00 h</p>
          </div>

          {/* Selección de estrellas */}
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="text-[13px] font-semibold text-[#424654]">¿Cómo fue tu experiencia?</p>
            <StarRating value={rating} onChange={setRating} size="lg" />
            <p className="text-[13px] font-bold text-amber-600 mt-1">
              {rating === 1 && 'Muy malo'}
              {rating === 2 && 'Malo'}
              {rating === 3 && 'Regular'}
              {rating === 4 && 'Bueno'}
              {rating === 5 && '¡Excelente!'}
            </p>
          </div>

          {/* Comentario */}
          <div>
            <label className="block text-[12px] font-semibold text-[#424654] mb-1.5">
              Comentario <span className="text-[#737785] font-normal">(opcional)</span>
            </label>
            <textarea
              className="w-full px-4 py-3 rounded-xl border border-[#c3c6d6] bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 focus:outline-none text-[14px] resize-none"
              rows={3}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={isFamily
                ? 'Cuéntanos sobre el profesional, su puntualidad, trato…'
                : 'Cuéntanos sobre la familia, su comunicación, el entorno…'}
              maxLength={500}
            />
            {comment && (
              <p className="text-[11px] text-[#737785] text-right mt-0.5">{comment.length}/500</p>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-red-600 text-[13px]">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-[44px] border border-[#c3c6d6] text-[#424654] rounded-xl font-semibold text-[14px] hover:bg-[#f3f3f6] transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 h-[44px] bg-amber-500 text-white rounded-xl font-bold text-[14px] hover:bg-amber-600 transition-all flex items-center justify-center gap-2 disabled:opacity-60 shadow-md"
            >
              {saving ? <Spinner sm /> : (
                <>
                  <span className="material-symbols-outlined text-[18px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  Enviar calificación
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
