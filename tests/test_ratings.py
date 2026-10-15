"""Pruebas unitarias de las reglas de reputación (BUG-001)."""
import unittest
from pathlib import Path

from app.services.ratings import calculate_rating_summary


class RatingSummaryTests(unittest.TestCase):
    def test_professional_without_reviews_has_no_average(self):
        self.assertEqual(calculate_rating_summary([]), (None, 0))

    def test_professional_with_reviews_has_real_average_and_count(self):
        self.assertEqual(calculate_rating_summary([5, 4, 2]), (3.67, 3))

    def test_startup_migration_allows_null_average_for_profiles_without_reviews(self):
        main_source = Path("app/main.py").read_text(encoding="utf-8")

        self.assertIn(
            "ALTER TABLE caregiver_profiles ALTER COLUMN rating_avg DROP NOT NULL",
            main_source,
        )
        self.assertIn(
            "ALTER TABLE nurse_profiles ALTER COLUMN rating_avg DROP NOT NULL",
            main_source,
        )
        self.assertNotIn("COALESCE(ROUND(AVG(review.rating)", main_source)


if __name__ == "__main__":
    unittest.main()