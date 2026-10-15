import { useState } from 'react';
import { useLang } from '../../contexts/LangContext';
import { useToast } from '../../contexts/ToastContext';
import StarRating from '../common/StarRating';
import BookingModal from '../bookings/BookingModal';
import ProfessionalDetailModal from './ProfessionalDetailModal';
import { getAssetUrl } from '../../utils/helpers';

// ─── ProfessionalCard ────────────────────────────────────────
// Click en la tarjeta → abre modal de detalle con mapa.
// Click en "Comentarios" → expande/colapsa SOLO en esta tarjeta,
//   con scroll interno para no mover la página.
export default function ProfessionalCard({
  name,
  photoUrl,
  specialty,
  rating,
  ratingCount,
  price,
  priceUnit = '/h',
  institution,
  location,
  experienceYears,
  bio,
  reviews = [],
  professionalUserId,
  professionalRole,
  professionalData,   // objeto completo del profesional para el modal de detalle
  token,
  index = 0,
}) {
  const { t } = useLang();
  const initials = (name || '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const [showReviews, setShowReviews]     = useState(false);
  const [showBooking, setShowBooking]     = useState(false);
  const [showDetail, setShowDetail]       = useState(false);
  const { success } = useToast();

  const handleSuccess = (count = 1) => {
    setShowBooking(false);
    setShowDetail(false);
    success(
      count > 1 ? `${count} ${t('booking.successMultiple')}` : t('booking.successSingle'),
      { title: t('booking.successTitle') }
    );
  };

  // Datos normalizados para pasar al modal de detalle
  const detailProfessional = professionalData
    ? {
        ...professionalData,
        full_name:  professionalData.full_name  || name,
        role:       professionalData.role        || professionalRole,
        hourly_rate: professionalData.hourly_rate ?? price,
        location:   professionalData.location    || location,
        user_id:    professionalData.user_id     || professionalUserId,
      }
    : {
        full_name:      name,
        role:           professionalRole,
        hourly_rate:    price,
        location,
        bio,
        experience_years: experienceYears,
        specialties:    specialty ? [specialty] : [],
        user_id:        professionalUserId,
        photo_url:      photoUrl,
        rating_avg:     rating,
        rating_count:   ratingCount,
      };

  return (
    <>
      {/* ── Tarjeta clickeable ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setShowDetail(true)}
        onKeyDown={e => e.key === 'Enter' && setShowDetail(true)}
        className="professional-card animate-fade-in-up bg-white border border-[#c3c6d6]/50
                   hover:border-[#0040a1]/50 hover:shadow-xl hover:scale-[1.02] rounded-2xl p-5
                   shadow-sm transition-all duration-300 flex flex-col gap-3 relative
                   overflow-hidden group cursor-pointer outline-none
                   focus-visible:ring-2 focus-visible:ring-[#0040a1]/40"
        style={{ animationDelay: `${index * 0.12}s` }}
      >
        {/* Barra superior animada */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#0040a1] to-[#8df1e3] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* ── Header: avatar + nombre + rating ── */}
        <div className="flex items-start gap-4">
          {photoUrl ? (
            <img src={getAssetUrl(photoUrl)} alt={name}
              className="w-16 h-16 rounded-2xl object-cover shrink-0 border border-[#c3c6d6]/30 shadow-sm" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-[#dae2ff] text-[#0040a1] flex items-center justify-center text-xl font-bold shrink-0 border border-[#c3c6d6]/30">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] leading-tight font-bold text-[#1a1c1e] group-hover:text-[#0040a1] transition-colors truncate">
              {name}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {specialty && (
                <span className="bg-[#0040a1]/10 text-[#0040a1] text-[11px] font-semibold px-2.5 py-0.5 rounded-lg">
                  {specialty}
                </span>
              )}
              <div className="flex items-center gap-1.5">
                {ratingCount > 0 && rating != null ? (
                  <>
                    <StarRating value={rating} readOnly size="sm" />
                    <span className="text-amber-700 text-[12px] font-bold">{Number(rating).toFixed(1)}</span>
                    <span className="text-[#737785] text-[11px]">({ratingCount})</span>
                  </>
                ) : (
                  <span className="text-[#737785] text-[12px] font-medium">Sin valoraciones</span>
                )}
              </div>
            </div>
          </div>
          {/* Indicador "ver más" */}
          <span className="material-symbols-outlined text-[#c3c6d6] group-hover:text-[#0040a1] text-[20px] shrink-0 mt-1 transition-colors">
            open_in_new
          </span>
        </div>

        {/* ── Precio ── */}
        <div className="text-[22px] font-bold text-[#0040a1] flex items-baseline gap-1">
          ${Number(price || 0).toLocaleString('es-CO')}
          <span className="text-[13px] font-normal text-[#424654]">{priceUnit}</span>
        </div>

        {/* ── Info: institución, ubicación, experiencia ── */}
        <div className="flex flex-col gap-1.5 text-[#424654] text-[13px] bg-[#f9f9fc] px-3.5 py-3 rounded-xl border border-[#c3c6d6]/30 group-hover:bg-white transition-colors">
          {institution && (
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-[#0040a1]/60">local_hospital</span>
              {institution}
            </span>
          )}
          {location && (
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-[#0040a1]/60">location_on</span>
              {location}
            </span>
          )}
          {experienceYears != null && (
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-[#0040a1]/60">schedule</span>
              {experienceYears} {t('search.yearsExp')}
            </span>
          )}
        </div>

        {/* ── Bio (2 líneas) ── */}
        {bio && (
          <p className="text-[12px] text-[#424654] leading-relaxed line-clamp-2">{bio}</p>
        )}

        {/* ── Comentarios expandibles — AISLADOS de la página ── */}
        <div
          onClick={e => e.stopPropagation()} // evita abrir el modal al hacer click aquí
          onKeyDown={e => e.stopPropagation()}
          className="border-t border-[#c3c6d6]/30 pt-2"
        >
          <button
            type="button"
            onClick={() => setShowReviews(v => !v)}
            className="flex items-center justify-between w-full text-[12px] font-semibold text-[#0040a1] py-1"
          >
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px]">chat_bubble</span>
              {t('professional.comments')}
              {reviews.length > 0 && (
                <span className="bg-[#0040a1]/10 text-[#0040a1] text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {reviews.length}
                </span>
              )}
            </span>
            <span className="material-symbols-outlined text-[17px] transition-transform duration-200"
              style={{ transform: showReviews ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              expand_more
            </span>
          </button>

          {/* Contenedor con altura máxima fija + scroll interno */}
          {showReviews && (
            <div className="mt-2 max-h-[180px] overflow-y-auto pr-1 flex flex-col gap-2
                            scrollbar-thin scrollbar-thumb-[#c3c6d6] scrollbar-track-transparent">
              {reviews.length === 0 ? (
                <p className="text-[11px] text-[#737785] italic py-1">
                  {t('professional.noComments')}
                </p>
              ) : (
                reviews.map((r, i) => (
                  <div key={i} className="bg-[#f9f9fc] rounded-xl p-2.5 border border-[#c3c6d6]/30 shrink-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-[#1a1c1e] truncate max-w-[60%]">
                        {r.family_name || t('roles.family')}
                      </span>
                      <StarRating value={r.rating} readOnly size="sm" />
                    </div>
                    {r.comment && (
                      <p className="text-[11px] text-[#424654] leading-relaxed">{r.comment}</p>
                    )}
                    {r.created_at && (
                      <p className="text-[10px] text-[#737785] mt-1">
                        {new Date(r.created_at).toLocaleDateString('es-CO')}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ── Botones de acción ── */}
        <div
          className="flex gap-2 mt-auto"
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setShowDetail(true)}
            className="flex-1 h-[40px] border border-[#0040a1] text-[#0040a1] rounded-xl font-semibold text-[13px] hover:bg-[#dae2ff] transition-all flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">info</span>
            Ver perfil
          </button>
          <button
            type="button"
            onClick={() => token ? setShowBooking(true) : null}
            className="flex-1 h-[40px] bg-[#0040a1] text-white rounded-xl font-bold text-[13px] hover:bg-[#003080] transition-all flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
            disabled={!token}
            title={token ? t('professional.requestService') : t('professional.loginToRequest')}
          >
            <span className="material-symbols-outlined text-[16px]">calendar_add_on</span>
            {t('professional.requestService')}
          </button>
        </div>
      </div>

      {/* ── Modal de detalle con mapa ── */}
      {showDetail && (
        <ProfessionalDetailModal
          professional={detailProfessional}
          token={token}
          reviews={reviews}
          onClose={() => setShowDetail(false)}
        />
      )}

      {/* ── Modal de reserva directo ── */}
      {showBooking && (
        <BookingModal
          professional={{
            user_id: professionalUserId,
            role: professionalRole,
            name,
            specialty,
            price,
            priceUnit,
            location,
          }}
          token={token}
          onClose={() => setShowBooking(false)}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
}
