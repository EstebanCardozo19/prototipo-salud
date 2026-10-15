import { useLang } from '../../contexts/LangContext';
import ProfessionalCard from './ProfessionalCard';
import { getSpecialtyLabel } from '../../utils/helpers';
import { getRatingSummary } from '../../utils/ratings';

export default function NurseCard({ doctor, reviews = [], ratingAvg, ratingCount, token, index = 0 }) {
  const { t, lang } = useLang();

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
      name={doctor.full_name}
      photoUrl={doctor.photo_url}
      specialty={getSpecialtyLabel(doctor.specialty, lang) || doctor.specialty}
      rating={computedRating}
      ratingCount={computedCount}
      price={doctor.hourly_rate}
      priceUnit={t('professional.perVisit')}
      institution={doctor.institution}
      location={doctor.location}
      experienceYears={doctor.experience_years}
      bio={doctor.bio}
      reviews={reviews}
      professionalUserId={doctor.user_id}
      professionalRole="nurse"
      professionalData={{
        ...doctor,
        role: 'nurse',
        full_name: doctor.full_name,
        specialty_display: getSpecialtyLabel(doctor.specialty, lang) || doctor.specialty,
        rating_avg: computedRating,
        rating_count: computedCount,
      }}
      token={token}
    />
  );
}
