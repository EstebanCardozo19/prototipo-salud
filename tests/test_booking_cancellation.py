"""Reglas de HU-034 para cancelar servicios aprobados."""
import unittest

from fastapi import HTTPException

from app.models import Booking, BookingStatus, User, UserRole
from app.routers.bookings_router import BookingCancellation, cancel_booking


class FakeSession:
    def __init__(self, booking, users):
        self.booking = booking
        self.users = users
        self.added = []
        self.committed = False

    def get(self, model, item_id):
        if model is Booking:
            return self.booking if self.booking and self.booking.id == item_id else None
        if model is User:
            return self.users.get(item_id)
        return None

    def add(self, item):
        self.added.append(item)

    def commit(self):
        self.committed = True

    def refresh(self, _item):
        pass


class BookingCancellationTests(unittest.TestCase):
    def setUp(self):
        self.family = User(id=1, email="family@example.test", password_hash="x", full_name="Familia", role=UserRole.family)
        self.professional = User(id=2, email="pro@example.test", password_hash="x", full_name="Profesional", role=UserRole.caregiver)
        self.outsider = User(id=3, email="other@example.test", password_hash="x", full_name="Ajeno", role=UserRole.family)

    def booking(self, status=BookingStatus.approved):
        return Booking(
            id=10, family_user_id=1, professional_user_id=2, professional_role="caregiver",
            date="2099-10-10", start_hour=8, end_hour=12, status=status,
        )

    def test_family_can_cancel_an_approved_service_with_a_reason(self):
        booking = self.booking()
        session = FakeSession(booking, {1: self.family, 2: self.professional})

        response = cancel_booking(10, BookingCancellation(reason="Cambio de planes"), self.family, session)

        self.assertEqual(booking.status, BookingStatus.cancelled)
        self.assertEqual(booking.cancellation_reason, "Cambio de planes")
        self.assertEqual(booking.cancelled_by_user_id, self.family.id)
        self.assertIsNotNone(booking.cancelled_at)
        self.assertTrue(session.committed)
        self.assertEqual(response.status, "cancelled")
        self.assertEqual(response.cancelled_by_name, "Familia")

    def test_cancellation_requires_a_non_blank_reason(self):
        with self.assertRaises(ValueError):
            BookingCancellation(reason="   ")

    def test_cannot_cancel_another_users_service(self):
        session = FakeSession(self.booking(), {1: self.family, 2: self.professional, 3: self.outsider})

        with self.assertRaises(HTTPException) as raised:
            cancel_booking(10, BookingCancellation(reason="No corresponde"), self.outsider, session)

        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(session.booking.status, BookingStatus.approved)

    def test_cannot_cancel_non_approved_services(self):
        for status in (BookingStatus.pending, BookingStatus.rejected, BookingStatus.completed, BookingStatus.cancelled):
            with self.subTest(status=status):
                session = FakeSession(self.booking(status), {1: self.family, 2: self.professional})
                with self.assertRaises(HTTPException) as raised:
                    cancel_booking(10, BookingCancellation(reason="Motivo válido"), self.family, session)
                self.assertEqual(raised.exception.status_code, 400)
                self.assertEqual(session.booking.status, status)


if __name__ == "__main__":
    unittest.main()