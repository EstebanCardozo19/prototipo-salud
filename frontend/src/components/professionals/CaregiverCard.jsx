import { useLang } from '../../contexts/LangContext';
import ProfessionalCard from './ProfessionalCard';
import { getSpecialtyLabel } from '../../utils/helpers';

export default function CaregiverCard({ caregiver, reviews = [], ratingAvg, ratingCount, token, index = 0 }) {
  const { t, lang } = useLang();
  const specialty =
    (caregiver.specialties || [])
      .map(s => getSpecialtyLabel(s, lang))
      .slice(0, 2)
      .join(', ') || t('roles.caregiver');

  const computedRating = ratingAvg != null
    ? ratingAvg
    : reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 5.0;
  const computedCount = ratingCount != null ? ratingCount : reviews.length;

  return (
    <ProfessionalCard
      index={index}
      name={caregiver.full_name || t('roles.caregiver')}
      photoUrl={caregiver.photo_url}
      specialty={specialty}
      rating={computedRating}
      ratingCount={computedCount}
      price={caregiver.hourly_rate}
      priceUnit={t('professional.perHour')}
      location={caregiver.location}
      experienceYears={caregiver.experience_years}
      bio={caregiver.bio}
      reviews={reviews}
      professionalUserId={caregiver.user_id}
      professionalRole="caregiver"
      professionalData={{
        ...caregiver,
        role: 'caregiver',
        full_name: caregiver.full_name,
        rating_avg: computedRating,
        rating_count: computedCount,
      }}
      token={token}
    />
  );
}
