import { useState } from 'react';
import StarRating from '../common/StarRating';
import { getAssetUrl } from '../../utils/helpers';
import { useLang } from '../../contexts/LangContext';
import FamilyDetailModal from './FamilyDetailModal';

/** Tarjeta compacta del familiar en la solicitud del profesional.
 *
 * Muestra solo foto, nombre y valoración. El resto (datos del paciente,
 * ubicación, reseñas) se abre en un modal con pestañas igual que el
 * "Ver perfil" de los profesionales en el panel de búsqueda.
 */
export default function BookingFamilyInfo({ booking }) {
  const { t } = useLang();
  const [showDetail, setShowDetail] = useState(false);

  return (
    <>
      <div className="mb-3 rounded-xl border border-[#c3c6d6]/40 bg-[#f9f9fc] px-3 py-2.5 flex items-center gap-3">
        {/* Avatar */}
        {booking.family_photo_url ? (
          <img
            src={getAssetUrl(booking.family_photo_url)}
            alt={booking.family_name || 'Familia'}
            className="h-11 w-11 rounded-xl object-cover shrink-0"
          />
        ) : (
          <div className="h-11 w-11 rounded-xl bg-[#0040a1] text-white flex items-center justify-center font-bold shrink-0">
            {(booking.family_name || 'F').charAt(0).toUpperCase()}
          </div>
        )}

        {/* Nombre + rating */}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#737785]">
            {t('booking.requestingFamily')}
          </p>
          <p className="truncate text-[14px] font-bold text-[#1a1c1e]">
            {booking.family_name || t('booking.familyFallback')}
          </p>
          {booking.family_rating_count > 0 ? (
            <StarRating
              value={booking.family_rating_avg}
              count={booking.family_rating_count}
              size="sm"
              showValue
              readOnly
            />
          ) : (
            <p className="text-[11px] text-[#737785]">{t('booking.noPreviousReviews')}</p>
          )}
        </div>

        {/* Botón Ver perfil */}
        <button
          type="button"
          onClick={() => setShowDetail(true)}
          className="shrink-0 flex items-center gap-1.5 h-[34px] px-3 border border-[#0040a1] text-[#0040a1] rounded-xl text-[12px] font-semibold hover:bg-[#dae2ff] transition-all"
        >
          <span className="material-symbols-outlined text-[15px]">info</span>
          Ver perfil
        </button>
      </div>

      {showDetail && (
        <FamilyDetailModal
          booking={booking}
          onClose={() => setShowDetail(false)}
        />
      )}
    </>
  );
}
