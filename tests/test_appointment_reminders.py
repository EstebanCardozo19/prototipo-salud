"""Pruebas para los recordatorios internos de citas médicas."""
import os
import unittest
from datetime import datetime
from unittest.mock import patch

from cryptography.fernet import Fernet

os.environ.setdefault("DATA_ENCRYPTION_KEY", Fernet.generate_key().decode())
os.environ.setdefault("EMAIL_LOOKUP_KEY", "test-email-lookup-key-with-at-least-32-characters")

from app.models import AppointmentReminderDelivery, AppointmentStatus, MedicalAppointment  # noqa: E402
from app.services.appointment_reminders import dispatch_due_appointment_reminders  # noqa: E402
from app.services.service_lifecycle import SERVICE_TIMEZONE  # noqa: E402


class Result:
    def __init__(self, value):
        self.value = value

    def all(self):
        return self.value

    def first(self):
        return self.value


class ReminderSession:
    def __init__(self, appointment):
        self.appointment = appointment
        self.deliveries = []
        self.committed = False

    def exec(self, query):
        query_text = str(query)
        if "appointment_reminder_deliveries" in query_text:
            return Result(next(iter(self.deliveries), None))
        return Result([self.appointment])

    def add(self, value):
        if isinstance(value, AppointmentReminderDelivery):
            self.deliveries.append(value)

    def commit(self):
        self.committed = True


class AppointmentReminderTests(unittest.TestCase):
    def setUp(self):
        self.appointment = MedicalAppointment(
            id=5, family_user_id=10, clinical_record_id=20, appointment_type="Cardiología",
            date="2026-10-18", time="10:00", status=AppointmentStatus.scheduled,
        )

    @patch("app.services.appointment_reminders.create_notification")
    def test_sends_document_preparation_reminder_once(self, notification):
        session = ReminderSession(self.appointment)
        now = datetime(2026, 10, 17, 10, 30, tzinfo=SERVICE_TIMEZONE)

        self.assertEqual(dispatch_due_appointment_reminders(session, now), 1)
        self.assertEqual(dispatch_due_appointment_reminders(session, now), 0)
        self.assertTrue(session.committed)
        notification.assert_called_once()
        self.assertEqual(notification.call_args.args[1], self.appointment.family_user_id)

    @patch("app.services.appointment_reminders.create_notification")
    def test_does_not_remind_cancelled_appointment(self, notification):
        self.appointment.status = AppointmentStatus.cancelled
        session = ReminderSession(self.appointment)
        now = datetime(2026, 10, 17, 10, 30, tzinfo=SERVICE_TIMEZONE)

        self.assertEqual(dispatch_due_appointment_reminders(session, now), 0)
        notification.assert_not_called()


if __name__ == "__main__":
    unittest.main()