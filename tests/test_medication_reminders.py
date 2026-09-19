"""Pruebas del despacho de recordatorios de medicación."""
import unittest
from datetime import datetime
from unittest.mock import patch

from app.models import Booking, BookingStatus, MedicationReminderDelivery, ServiceCarePlan
from app.services.medication_reminders import dispatch_due_medication_reminders, parse_medication_time
from app.services.service_lifecycle import SERVICE_TIMEZONE


class Result:
    def __init__(self, value):
        self.value = value

    def all(self):
        return self.value

    def first(self):
        return self.value


class ReminderSession:
    def __init__(self, booking, plan):
        self.booking = booking
        self.plan = plan
        self.deliveries = []
        self.added = []
        self.committed = False

    def exec(self, _query):
        # El despachador consulta, en orden: servicios, plan y entrega previa.
        if not hasattr(self, "calls"):
            self.calls = 0
        self.calls += 1
        phase = (self.calls - 1) % 3
        if phase == 0:
            return Result([self.booking])
        if phase == 1:
            return Result(self.plan)
        return Result(self.deliveries[0] if self.deliveries else None)

    def add(self, value):
        self.added.append(value)
        if isinstance(value, MedicationReminderDelivery):
            self.deliveries.append(value)

    def commit(self):
        self.committed = True


class MedicationReminderTests(unittest.TestCase):
    def setUp(self):
        self.booking = Booking(
            id=10, family_user_id=20, clinical_record_id=30, professional_user_id=40,
            professional_role="nurse", date="2026-09-18", start_hour=8, end_hour=18,
            status=BookingStatus.approved,
        )
        self.plan = ServiceCarePlan(
            booking_id=10, professional_user_id=40,
            medication_schedule=[{"medication": "Medicamento A", "dosage": "10 mg", "time": "09:30", "instructions": "Con alimentos"}],
        )

    def test_parses_24_hour_and_am_pm_schedule_times(self):
        self.assertEqual(str(parse_medication_time("09:30")), "09:30:00")
        self.assertEqual(str(parse_medication_time("9:30 PM")), "21:30:00")
        self.assertIsNone(parse_medication_time("25:00"))

    @patch("app.services.medication_reminders._send_web_push")
    @patch("app.services.medication_reminders.create_notification")
    def test_dispatches_only_once_for_active_assigned_professional(self, notification, _push):
        session = ReminderSession(self.booking, self.plan)
        now = datetime(2026, 9, 18, 9, 30, tzinfo=SERVICE_TIMEZONE)

        self.assertEqual(dispatch_due_medication_reminders(session, now), 1)
        self.assertEqual(dispatch_due_medication_reminders(session, now), 0)
        notification.assert_called_once()
        self.assertEqual(notification.call_args.args[1], 40)
        self.assertTrue(session.committed)

    @patch("app.services.medication_reminders._send_web_push")
    @patch("app.services.medication_reminders.create_notification")
    def test_does_not_dispatch_outside_active_service_window(self, notification, _push):
        session = ReminderSession(self.booking, self.plan)
        now = datetime(2026, 9, 18, 7, 30, tzinfo=SERVICE_TIMEZONE)

        self.assertEqual(dispatch_due_medication_reminders(session, now), 0)
        notification.assert_not_called()


if __name__ == "__main__":
    unittest.main()