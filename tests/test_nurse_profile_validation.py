"""Regresiones de validación del perfil profesional de enfermería (HU-016/CA-02)."""
import os
import unittest

from cryptography.fernet import Fernet

os.environ.setdefault("DATA_ENCRYPTION_KEY", Fernet.generate_key().decode())
os.environ.setdefault("EMAIL_LOOKUP_KEY", "test-email-lookup-key-with-at-least-32-characters")

from pydantic import ValidationError  # noqa: E402

from app.auth import hash_password  # noqa: E402
from app.models import NurseProfile, NurseSpecialty, ProfileStatus, User, UserRole  # noqa: E402
from app.routers.nurses_router import NurseUpdateRequest, update_my_profile  # noqa: E402


class _QueryResult:
    def __init__(self, profile):
        self.profile = profile

    def first(self):
        return self.profile


class FakeSession:
    def __init__(self, profile):
        self.profile = profile
        self.added = []
        self.committed = False

    def exec(self, _statement):
        return _QueryResult(self.profile)

    def add(self, value):
        self.added.append(value)

    def commit(self):
        self.committed = True

    def refresh(self, _value):
        pass


class NurseProfileValidationTests(unittest.TestCase):
    def setUp(self):
        self.user = User(
            id=10, email="nurse@example.com", password_hash=hash_password("password123"),
            full_name="Enfermera de Prueba", role=UserRole.nurse,
        )
        self.profile = NurseProfile(
            id=5, user_id=self.user.id, specialty=NurseSpecialty.general,
            license_number="ENF-123", institution="Hospital de Prueba",
            experience_years=4, location="Chapinero", hourly_rate=45000,
            status=ProfileStatus.pending,
        )
        self.session = FakeSession(self.profile)

    def test_accepts_valid_positive_rate_and_non_negative_experience_and_persists_them(self):
        request = NurseUpdateRequest(hourly_rate=55000, experience_years=0, institution=" Clínica de Prueba ")

        response = update_my_profile(request, self.user, self.session)

        self.assertEqual(response.hourly_rate, 55000)
        self.assertEqual(self.profile.hourly_rate, 55000)
        self.assertEqual(self.profile.experience_years, 0)
        self.assertEqual(self.profile.institution, "Clínica de Prueba")
        self.assertTrue(self.session.committed)

    def test_rejects_invalid_numeric_values_before_they_can_replace_saved_data(self):
        invalid_updates = (
            {"hourly_rate": None}, {"hourly_rate": 0}, {"hourly_rate": -1},
            {"hourly_rate": "45000"}, {"hourly_rate": float("nan")},
            {"experience_years": -1}, {"experience_years": "cuatro"}, {"experience_years": 2.5},
        )

        for data in invalid_updates:
            with self.subTest(data=data):
                with self.assertRaises(ValidationError):
                    NurseUpdateRequest(**data)
                self.assertEqual(self.profile.hourly_rate, 45000)
                self.assertEqual(self.profile.experience_years, 4)
                self.assertFalse(self.session.committed)

    def test_preserves_optional_fields_and_rejects_blank_required_professional_values_when_sent(self):
        request = NurseUpdateRequest(institution="   ")
        self.assertIsNone(request.institution)
        self.assertIsNone(request.experience_years)

        for field in ("specialty", "license_number"):
            with self.subTest(field=field):
                with self.assertRaisesRegex(ValidationError, "dato profesional obligatorio"):
                    NurseUpdateRequest(**{field: "   "})


if __name__ == "__main__":
    unittest.main()