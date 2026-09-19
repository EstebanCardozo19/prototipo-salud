"""Reglas de persistencia del estado de medicamentos por ficha familiar."""
import os
import unittest

from cryptography.fernet import Fernet

os.environ.setdefault("DATA_ENCRYPTION_KEY", Fernet.generate_key().decode())
os.environ.setdefault("EMAIL_LOOKUP_KEY", "test-email-lookup-key-with-at-least-32-characters")

from app.routers.clinical_router import normalize_medications  # noqa: E402


class ClinicalRecordMedicationTests(unittest.TestCase):
    def test_clears_medication_list_when_patient_does_not_take_medication(self):
        payload = {"takes_medications": False, "medications": ["Losartán 50 mg"]}

        self.assertEqual(normalize_medications(payload), {"takes_medications": False, "medications": []})

    def test_preserves_medication_list_when_patient_takes_medication(self):
        payload = {"takes_medications": True, "medications": ["Losartán 50 mg"]}

        self.assertEqual(normalize_medications(payload), payload)

    def test_partial_update_without_medication_status_is_unchanged(self):
        payload = {"special_needs": "Control de presión"}

        self.assertEqual(normalize_medications(payload), payload)


if __name__ == "__main__":
    unittest.main()