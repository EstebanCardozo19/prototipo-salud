"""Pruebas del consentimiento de ubicación en solicitudes de servicio."""
import unittest

from pydantic import ValidationError

from app.models import Booking
from app.routers.bookings_router import BookingCreate


class BookingLocationSharingTests(unittest.TestCase):
    def test_defaults_to_general_location(self):
        request = BookingCreate(
            professional_user_id=2, professional_role="caregiver", clinical_record_id=3,
            date="2026-10-10", start_hour=8, end_hour=12,
        )
        booking = Booking(
            family_user_id=1, clinical_record_id=3, professional_user_id=2,
            professional_role="caregiver", date="2026-10-10", start_hour=8, end_hour=12,
        )
        self.assertEqual(request.location_sharing_preference, "locality_neighborhood")
        self.assertEqual(booking.location_sharing_preference, "locality_neighborhood")

    def test_accepts_exact_address_with_explicit_consent(self):
        request = BookingCreate(
            professional_user_id=2, professional_role="nurse", clinical_record_id=3,
            date="2026-10-10", start_hour=8, end_hour=12,
            location_sharing_preference="exact_address",
        )
        self.assertEqual(request.location_sharing_preference, "exact_address")

    def test_accepts_general_location_with_explicit_selection(self):
        request = BookingCreate(
            professional_user_id=2, professional_role="caregiver", clinical_record_id=3,
            date="2026-10-10", start_hour=8, end_hour=12,
            location_sharing_preference="locality_neighborhood",
        )
        self.assertEqual(request.location_sharing_preference, "locality_neighborhood")

    def test_rejects_unknown_location_sharing_option(self):
        with self.assertRaises(ValidationError):
            BookingCreate(
                professional_user_id=2, professional_role="nurse", clinical_record_id=3,
                date="2026-10-10", start_hour=8, end_hour=12,
                location_sharing_preference="all_location_data",
            )


if __name__ == "__main__":
    unittest.main()