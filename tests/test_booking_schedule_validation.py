"""Regresiones de fechas, horarios y turnos nocturnos de solicitudes."""
import unittest
from datetime import datetime

from pydantic import ValidationError

from app.models import Booking
from app.routers.bookings_router import BOOKING_TIMEZONE, BookingCreate, validate_booking_schedule
from app.services.service_lifecycle import service_schedule


class BookingScheduleValidationTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 15, 10, 30, tzinfo=BOOKING_TIMEZONE)

    def test_rejects_a_past_service_date(self):
        with self.assertRaisesRegex(ValueError, "fecha y hora de inicio deben ser futuras"):
            validate_booking_schedule("2026-10-14", 12, 14, now=self.now)

    def test_api_schema_rejects_a_past_schedule(self):
        with self.assertRaises(ValidationError):
            BookingCreate(
                professional_user_id=2, professional_role="caregiver", clinical_record_id=3,
                date="2000-01-01", start_hour=8, end_hour=12,
            )

    def test_rejects_a_start_hour_that_has_already_passed_today(self):
        with self.assertRaisesRegex(ValueError, "fecha y hora de inicio deben ser futuras"):
            validate_booking_schedule("2026-10-15", 10, 12, now=self.now)

    def test_accepts_a_future_start_hour_today(self):
        validate_booking_schedule("2026-10-15", 11, 13, now=self.now)

    def test_rejects_a_zero_duration_schedule(self):
        with self.assertRaisesRegex(ValueError, "distinta"):
            validate_booking_schedule("2026-10-16", 8, 8, now=self.now)

    def test_accepts_an_overnight_shift(self):
        validate_booking_schedule("2026-10-16", 22, 6, now=self.now)

    def test_overnight_shift_ends_the_next_day(self):
        booking = Booking(
            family_user_id=1, professional_user_id=2, professional_role="caregiver",
            date="2026-10-16", start_hour=22, end_hour=6,
        )
        start, end = service_schedule(booking)
        self.assertEqual(start, datetime(2026, 10, 16, 22, tzinfo=BOOKING_TIMEZONE))
        self.assertEqual(end, datetime(2026, 10, 17, 6, tzinfo=BOOKING_TIMEZONE))

    def test_multiday_requests_can_include_today_and_future_days(self):
        for service_date, start_hour, end_hour in (
            ("2026-10-15", 11, 16),
            ("2026-10-16", 8, 16),
            ("2026-10-17", 22, 6),
        ):
            with self.subTest(service_date=service_date):
                validate_booking_schedule(service_date, start_hour, end_hour, now=self.now)


if __name__ == "__main__":
    unittest.main()