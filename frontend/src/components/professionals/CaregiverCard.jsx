import { useLang } from '../../contexts/LangContext';
import ProfessionalCard from './ProfessionalCard';
import { getSpecialtyLabel } from '../../utils/helpers';
import { getRatingSummary } from '../../utils/ratings';

export default function CaregiverCard({ caregiver, reviews = [], ratingAvg, ratingCount, token, index = 0 }) {
  const { t, lang } = useLang();
  const specialty =
    (caregiver.specialties || [])
      .map(s => getSpecialtyLabel(s, lang))
      .slice(0, 2)
      .join(', ') || t('roles.caregiver');

  const fallbackCount = reviews.length;
  const fallbackAverage = fallbackCount
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / fallbackCount
    : null;
  const { average: computedRating, count: computedCount } = getRatingSummary(
    ratingCount != null ? ratingAvg : fallbackAverage,
    ratingCount != null ? ratingCount : fallbackCount,
  );

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
      coverageLocalities={caregiver.coverage_localities || []}
      coversAllBogota={caregiver.covers_all_bogota || false}
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
