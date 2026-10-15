"""Pruebas de validación de disponibilidad y cruces de servicios."""
import unittest

from app.models import Availability, Booking, BookingStatus, DayOfWeek
from app.routers.bookings_router import (
    is_schedule_covered_by_availability,
    schedules_overlap,
    validate_availability_schedule,
)


class ProfessionalAvailabilityTests(unittest.TestCase):
    def setUp(self):
        self.monday_daytime = Availability(
            professional_user_id=2, day_of_week=DayOfWeek.monday,
            start_hour=8, end_hour=17, is_active=True,
        )
        self.monday_night = Availability(
            professional_user_id=2, day_of_week=DayOfWeek.monday,
            start_hour=22, end_hour=6, is_active=True,
        )

    def test_normal_schedule_is_covered(self):
        self.assertTrue(is_schedule_covered_by_availability(
            "2099-01-05", 9, 12, [self.monday_daytime],
        ))

    def test_overnight_schedule_is_covered(self):
        self.assertTrue(is_schedule_covered_by_availability(
            "2099-01-05", 22, 5, [self.monday_night],
        ))

    def test_early_morning_is_covered_by_previous_night(self):
        self.assertTrue(is_schedule_covered_by_availability(
            "2099-01-06", 1, 5, [self.monday_night],
        ))

    def test_schedule_outside_availability_is_rejected(self):
        self.assertFalse(is_schedule_covered_by_availability(
            "2099-01-05", 17, 20, [self.monday_daytime],
        ))

    def test_approved_service_overlap_is_detected(self):
        approved = Booking(
            id=7, family_user_id=1, professional_user_id=2, professional_role="caregiver",
            date="2099-01-05", start_hour=22, end_hour=6, status=BookingStatus.approved,
        )
        self.assertTrue(schedules_overlap("2099-01-06", 1, 4, approved.date, approved.start_hour, approved.end_hour))
        self.assertFalse(schedules_overlap("2099-01-06", 6, 8, approved.date, approved.start_hour, approved.end_hour))

    def test_availability_rejects_zero_length_schedule(self):
        with self.assertRaisesRegex(ValueError, "distinta"):
            validate_availability_schedule(8, 8)


if __name__ == "__main__":
    unittest.main()