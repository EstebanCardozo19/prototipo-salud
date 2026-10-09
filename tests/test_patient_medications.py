"""Pruebas del alta y acceso a medicamentos permanentes."""
import os
import unittest

from cryptography.fernet import Fernet
from fastapi import HTTPException

os.environ.setdefault("DATA_ENCRYPTION_KEY", Fernet.generate_key().decode())
os.environ.setdefault("EMAIL_LOOKUP_KEY", "test-email-lookup-key-with-at-least-32-characters")

from app.models import (  # noqa: E402
    Booking,
    BookingStatus,
    ClinicalRecord,
    MedicationFrequency,
    MedicationStatus,
    User,
    UserRole,
)
from app.routers.medications_router import (  # noqa: E402
    MedicationCreate,
    _assert_professional_has_access,
    create_medication,
)


class Result:
    def __init__(self, value):
        self.value = value

    def first(self):
        return self.value


class MedicationSession:
    def __init__(self, record, booking=None):
        self.record = record
        self.booking = booking
        self.added = []
        self.committed = False

    def get(self, model, identifier):
        if model is ClinicalRecord and identifier == self.record.id:
            return self.record
        return None

    def exec(self, _query):
        booking = self.booking if self.booking and self.booking.status == BookingStatus.approved else None
        return Result(booking)

    def add(self, value):
        self.added.append(value)

    def commit(self):
        self.committed = True

    def refresh(self, _value):
        if getattr(_value, "id", None) is None:
            _value.id = 1


class PatientMedicationTests(unittest.TestCase):
    def setUp(self):
        self.family = User(id=10, email="family@example.test", password_hash="hash", full_name="Familia", role=UserRole.family)
        self.record = ClinicalRecord(id=20, family_user_id=10, patient_name="Paciente", patient_age=70, takes_medications=False)
        self.payload = MedicationCreate(
            name="Losartán",
            dose="50 mg",
            frequency=MedicationFrequency.every_24h,
            schedules=["08:00"],
        )

    def test_creating_medication_persists_active_medication_and_marks_record(self):
        session = MedicationSession(self.record)

        response = create_medication(20, self.payload, self.family, session)

        medication = next(item for item in session.added if item.__class__.__name__ == "PatientMedication")
        self.assertTrue(self.record.takes_medications)
        self.assertEqual(medication.status, MedicationStatus.active)
        self.assertEqual(medication.clinical_record_id, self.record.id)
        self.assertTrue(session.committed)
        self.assertEqual(response.name, "Losartán")

    def test_professional_cannot_access_medications_after_service_is_completed(self):
        professional = User(id=30, email="nurse@example.test", password_hash="hash", full_name="Enfermera", role=UserRole.nurse)
        completed_booking = Booking(
            id=40,
            family_user_id=self.family.id,
            clinical_record_id=self.record.id,
            professional_user_id=professional.id,
            professional_role="nurse",
            date="2026-01-01",
            start_hour=8,
            end_hour=17,
            status=BookingStatus.completed,
        )

        with self.assertRaises(HTTPException) as error:
            _assert_professional_has_access(self.record.id, professional, MedicationSession(self.record, completed_booking))

        self.assertEqual(error.exception.status_code, 403)

    def test_professional_can_access_medications_with_approved_service(self):
        professional = User(id=30, email="nurse@example.test", password_hash="hash", full_name="Enfermera", role=UserRole.nurse)
        approved_booking = Booking(
            id=40,
            family_user_id=self.family.id,
            clinical_record_id=self.record.id,
            professional_user_id=professional.id,
            professional_role="nurse",
            date="2026-10-08",
            start_hour=8,
            end_hour=17,
            status=BookingStatus.approved,
        )

        result = _assert_professional_has_access(self.record.id, professional, MedicationSession(self.record, approved_booking))

        self.assertIs(result, self.record)


if __name__ == "__main__":
    unittest.main()