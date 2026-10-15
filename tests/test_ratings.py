"""Pruebas unitarias de las reglas de reputación (BUG-001)."""
import unittest

from app.services.ratings import calculate_rating_summary


class RatingSummaryTests(unittest.TestCase):
    def test_professional_without_reviews_has_no_average(self):
        self.assertEqual(calculate_rating_summary([]), (None, 0))

    def test_professional_with_reviews_has_real_average_and_count(self):
        self.assertEqual(calculate_rating_summary([5, 4, 2]), (3.67, 3))


if __name__ == "__main__":
    unittest.main()