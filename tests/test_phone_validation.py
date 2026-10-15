"""Regresiones de celulares colombianos en los perfiles de cuenta."""
import os
import unittest

from cryptography.fernet import Fernet

os.environ.setdefault("DATA_ENCRYPTION_KEY", Fernet.generate_key().decode())
os.environ.setdefault("EMAIL_LOOKUP_KEY", "test-email-lookup-key-with-at-least-32-characters")

from pydantic import ValidationError  # noqa: E402

from app.auth import UpdateMyAccountRequest, hash_password  # noqa: E402
from app.models import User, UserRole  # noqa: E402
from app.routers.auth_router import update_me  # noqa: E402


class FakeSession:
    def __init__(self):
        self.added = []
        self.committed = False

    def add(self, value):
        self.added.append(value)

    def commit(self):
        self.committed = True

    def refresh(self, _value):
        pass


class ColombianMobilePhoneValidationTests(unittest.TestCase):
    def make_user(self, role=UserRole.family):
        return User(
            id=1,
            email="profile@example.com",
            password_hash=hash_password("password123"),
            full_name="Perfil de Prueba",
            role=role,
            phone="3001234567",
        )

    def test_accepts_valid_numbers_for_all_account_roles(self):
        for role in (UserRole.family, UserRole.caregiver, UserRole.nurse):
            with self.subTest(role=role):
                request = UpdateMyAccountRequest(phone="3123456789")
                session = FakeSession()
                user = self.make_user(role)

                response = update_me(request, user, session)

                self.assertEqual(response.phone, "3123456789")
                self.assertEqual(user.phone, "3123456789")
                self.assertTrue(session.committed)

    def test_accepts_an_empty_optional_phone(self):
        self.assertIsNone(UpdateMyAccountRequest(phone="   ").phone)
        self.assertIsNone(UpdateMyAccountRequest().phone)

    def test_rejects_invalid_phones_and_does_not_replace_saved_value(self):
        user = self.make_user()
        session = FakeSession()
        invalid_phones = ("12345", "2123456789", "300123456", "30012345678", "30012abc67", "300-123-4567")

        for phone in invalid_phones:
            with self.subTest(phone=phone):
                with self.assertRaisesRegex(ValidationError, "Ingresa un número celular válido de 10 dígitos"):
                    UpdateMyAccountRequest(phone=phone)
                self.assertEqual(user.phone, "3001234567")
                self.assertFalse(session.committed)


if __name__ == "__main__":
    unittest.main()