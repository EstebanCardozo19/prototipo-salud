export function getRatingSummary(ratingAvg, ratingCount) {
  const count = Number(ratingCount) || 0;
  const average = Number(ratingAvg);

  return {
    count,
    average: count > 0 && Number.isFinite(average) ? average : null,
  };
}
