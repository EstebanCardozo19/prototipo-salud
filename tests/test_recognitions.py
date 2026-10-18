"""Regresiones de reglas objetivas para HU-035."""
import unittest

from app.models import RecognitionType
from app.services.recognitions import RecognitionMetrics, eligible_recognition_types


class RecognitionRulesTests(unittest.TestCase):
    def test_assigns_first_service_after_one_completed_service(self):
        awarded = eligible_recognition_types(RecognitionMetrics(1, 0, None, 0))
        self.assertEqual(awarded, {RecognitionType.first_service})

    def test_excellent_care_requires_five_verified_high_ratings(self):
        self.assertNotIn(RecognitionType.excellent_care, eligible_recognition_types(RecognitionMetrics(9, 4, 5.0, 4)))
        self.assertIn(RecognitionType.excellent_care, eligible_recognition_types(RecognitionMetrics(9, 5, 4.2, 5)))

    def test_featured_professional_requires_both_service_and_average_thresholds(self):
        self.assertNotIn(RecognitionType.featured_professional, eligible_recognition_types(RecognitionMetrics(10, 5, 4.49, 10)))
        self.assertNotIn(RecognitionType.featured_professional, eligible_recognition_types(RecognitionMetrics(9, 5, 5.0, 9)))
        self.assertIn(RecognitionType.featured_professional, eligible_recognition_types(RecognitionMetrics(10, 5, 4.5, 10)))


if __name__ == "__main__":
    unittest.main()