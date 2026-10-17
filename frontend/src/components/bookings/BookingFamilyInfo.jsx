import StarRating from '../common/StarRating';
import { getAssetUrl, getMobilityLabel } from '../../utils/helpers';
import { useLang } from '../../contexts/LangContext';

/** Información limitada de una solicitud para que el profesional pueda decidirla. */
export default function BookingFamilyInfo({ booking }) {
  const { lang, t } = useLang();
  const location = [booking.patient_sector, booking.patient_neighborhood, booking.patient_city].filter(Boolean).join(', ');
  const housing = [
    booking.patient_is_apartment === true ? 'Apartamento' : booking.patient_is_apartment === false ? 'Casa' : null,
    booking.patient_floor_number != null ? `Piso ${booking.patient_floor_number}` : null,
    booking.patient_has_elevator === true ? 'Con ascensor' : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="mb-3 rounded-xl border border-[#c3c6d6]/40 bg-[#f9f9fc] p-3 space-y-3">
      <div className="flex items-center gap-3">
        {booking.family_photo_url ? (
          <img src={getAssetUrl(booking.family_photo_url)} alt={booking.family_name || 'Familia'} className="h-11 w-11 rounded-xl object-cover" />
        ) : (
          <div className="h-11 w-11 rounded-xl bg-[#0040a1] text-white flex items-center justify-center font-bold">
            {(booking.family_name || 'F').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#737785]">{t('booking.requestingFamily')}</p>
          <p className="truncate text-[14px] font-bold text-[#1a1c1e]">{booking.family_name || t('booking.familyFallback')}</p>
          {booking.family_rating_count > 0 ? (
            <StarRating value={booking.family_rating_avg} count={booking.family_rating_count} size="sm" showValue readOnly />
          ) : <p className="text-[11px] text-[#737785]">{t('booking.noPreviousReviews')}</p>}
        </div>
      </div>

      <div className="grid gap-2 text-[12px] text-[#424654] sm:grid-cols-2">
        <p><span className="font-bold">{t('booking.patientLabel')}</span> {booking.patient_name || t('booking.patientNotSpecified')}{booking.patient_age != null ? ` · ${booking.patient_age} ${t('professional.years')}` : ''}</p>
        {booking.patient_mobility_level && <p><span className="font-bold">{t('booking.mobilityLabel')}</span> {getMobilityLabel(booking.patient_mobility_level, lang)}</p>}
        {location && <p className="flex items-center gap-1"><span className="material-symbols-outlined text-[15px]">location_on</span>{location}</p>}
        {booking.patient_address && <p className="flex items-center gap-1 sm:col-span-2"><span className="material-symbols-outlined text-[15px]">home_pin</span><span><span className="font-bold">{t('booking.authorizedAddress')}</span> {booking.patient_address}</span></p>}
        {housing && <p><span className="font-bold">{t('booking.housingLabel')}</span> {housing}</p>}
      </div>

      {booking.family_recent_reviews?.length > 0 && (
        <div className="border-t border-[#c3c6d6]/30 pt-2">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#737785]">{t('booking.professionalReviews')}</p>
          <div className="space-y-1.5">
            {booking.family_recent_reviews.map(review => (
              <div key={review.id} className="text-[12px] text-[#424654]">
                <span className="font-semibold">{review.professional_name || t('booking.professionalFallback')}:</span>{' '}
                <span className="text-amber-600">{'★'.repeat(review.rating)}</span>
                {review.comment && <span> — {review.comment}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {booking.family_recent_cancelled_comments?.length > 0 && (
        <div className="border-t border-[#c3c6d6]/30 pt-2">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#737785]">Comentarios de cancelaciones</p>
          <div className="space-y-1.5">
            {booking.family_recent_cancelled_comments.map(comment => (
              <div key={comment.id} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[12px] text-[#424654]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">Profesional</span>
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">Servicio cancelado</span>
                </div>
                <p className="mt-1">{comment.comment}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}