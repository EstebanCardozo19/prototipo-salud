"""Pruebas del flujo de preguntas de seguridad y recuperación de contraseña."""
import os
import unittest

from cryptography.fernet import Fernet

os.environ.setdefault("DATA_ENCRYPTION_KEY", Fernet.generate_key().decode())
os.environ.setdefault("EMAIL_LOOKUP_KEY", "test-email-lookup-key-with-at-least-32-characters")

from fastapi import HTTPException  # noqa: E402

from app.auth import (  # noqa: E402
    PasswordRecoveryQuestionsRequest,
    ResetPasswordWithSecurityQuestionsRequest,
    hash_password,
    normalize_security_answer,
    verify_password,
)
from app.models import User, UserRole  # noqa: E402
from app.routers import auth_router  # noqa: E402


class FakeSession:
    def __init__(self, user):
        self.user = user
        self.added = []
        self.committed = False

    def add(self, value):
        self.added.append(value)

    def commit(self):
        self.committed = True


class SecurityQuestionsTests(unittest.TestCase):
    def setUp(self):
        self.user = User(
            id=1,
            email="family@example.com",
            password_hash=hash_password("anterior123"),
            full_name="Familia Prueba",
            role=UserRole.family,
            security_question_1="first_pet",
            security_answer_1_hash=hash_password(normalize_security_answer("Luna")),
            security_question_2="birth_city",
            security_answer_2_hash=hash_password(normalize_security_answer("Bogotá")),
        )
        self.session = FakeSession(self.user)
        self.original_find_user = auth_router._find_user_by_email
        auth_router._find_user_by_email = lambda _session, _email: self.user

    def tearDown(self):
        auth_router._find_user_by_email = self.original_find_user

    def test_normalizes_answers_without_case_or_accents(self):
        self.assertEqual(normalize_security_answer("  BOGOTÁ "), "bogota")

    def test_returns_configured_questions(self):
        response = auth_router.get_password_recovery_questions(
            PasswordRecoveryQuestionsRequest(email="family@example.com"), self.session,
        )
        self.assertEqual(response.security_question_1, "first_pet")
        self.assertEqual(response.security_question_2, "birth_city")

    def test_resets_password_when_both_answers_are_correct(self):
        response = auth_router.reset_password_with_security_questions(
            ResetPasswordWithSecurityQuestionsRequest(
                email="family@example.com", security_answer_1="luna", security_answer_2="BOGOTA", new_password="nueva123",
            ), self.session,
        )
        self.assertEqual(response["message"], "Contraseña restablecida correctamente")
        self.assertTrue(self.session.committed)
        self.assertTrue(verify_password("nueva123", self.user.password_hash))

    def test_does_not_reset_password_with_an_incorrect_answer(self):
        with self.assertRaises(HTTPException) as raised:
            auth_router.reset_password_with_security_questions(
                ResetPasswordWithSecurityQuestionsRequest(
                    email="family@example.com", security_answer_1="incorrecta", security_answer_2="Bogotá", new_password="nueva123",
                ), self.session,
            )
        self.assertEqual(raised.exception.status_code, 400)
        self.assertTrue(verify_password("anterior123", self.user.password_hash))

    def test_rejects_repeated_or_unknown_questions(self):
        with self.assertRaises(HTTPException) as raised:
            auth_router._validate_security_questions("first_pet", "Luna", "first_pet", "Milo")
        self.assertEqual(raised.exception.status_code, 422)

        with self.assertRaises(HTTPException) as raised:
            auth_router._validate_security_questions("unknown", "Uno", "birth_city", "Bogotá")
        self.assertEqual(raised.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()