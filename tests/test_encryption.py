"""Pruebas de cifrado en reposo y del índice de autenticación por email."""
import os
import unittest
from types import SimpleNamespace

from cryptography.fernet import Fernet

os.environ.setdefault("DATA_ENCRYPTION_KEY", Fernet.generate_key().decode())
os.environ.setdefault("EMAIL_LOOKUP_KEY", "test-email-lookup-key-with-at-least-32-characters")

from app.security.encryption import (  # noqa: E402
    EncryptedJSON,
    EncryptedText,
    decrypt_bytes,
    decrypt_text,
    email_lookup,
    encrypt_bytes,
    encrypt_text,
    user_email,
    user_email_lookup,
    user_full_name,
)


class EncryptionTests(unittest.TestCase):
    def test_text_round_trip_is_confidential_and_authenticated(self):
        plaintext = "Diagnóstico sensible"
        encrypted = encrypt_text(plaintext)
        self.assertNotEqual(encrypted, plaintext)
        self.assertTrue(encrypted.startswith("enc:"))
        self.assertEqual(decrypt_text(encrypted), plaintext)

    def test_file_round_trip(self):
        plaintext = b"%PDF-1.7 contenido clinico privado"
        encrypted = encrypt_bytes(plaintext)
        self.assertNotEqual(encrypted, plaintext)
        self.assertEqual(decrypt_bytes(encrypted), plaintext)

    def test_email_lookup_is_normalized_and_non_reversible(self):
        lookup = email_lookup(" Familia@Ejemplo.com ")
        self.assertEqual(lookup, email_lookup("familia@ejemplo.com"))
        self.assertNotIn("familia@ejemplo.com", lookup)
        self.assertEqual(len(lookup), 64)

    def test_model_column_types_encrypt_and_restore_values(self):
        text_type = EncryptedText()
        json_type = EncryptedJSON()
        encrypted_text = text_type.process_bind_param("Dirección privada", None)
        encrypted_json = json_type.process_bind_param(["Diagnóstico privado"], None)
        self.assertNotIn("Dirección privada", encrypted_text)
        self.assertNotIn("Diagnóstico privado", encrypted_json)
        self.assertEqual(text_type.process_result_value(encrypted_text, None), "Dirección privada")
        self.assertEqual(json_type.process_result_value(encrypted_json, None), ["Diagnóstico privado"])

    def test_user_data_is_readable_for_encrypted_admin_and_legacy_professional(self):
        admin = SimpleNamespace(
            email=encrypt_text("admin@ejemplo.com"),
            full_name=encrypt_text("Administradora Principal"),
        )
        professional = SimpleNamespace(
            email="cuidador@ejemplo.com",
            full_name="Cuidador Histórico",
        )

        self.assertEqual(user_email(admin), "admin@ejemplo.com")
        self.assertEqual(user_full_name(admin), "Administradora Principal")
        self.assertEqual(user_email(professional), "cuidador@ejemplo.com")
        self.assertEqual(user_full_name(professional), "Cuidador Histórico")

    def test_encrypted_family_email_keeps_a_lookup_compatible_with_login(self):
        family = SimpleNamespace(email=encrypt_text("Familia@Ejemplo.com"))

        self.assertEqual(
            user_email_lookup(family),
            email_lookup("familia@ejemplo.com"),
        )

    def test_same_normalized_email_produces_the_same_unique_lookup(self):
        self.assertEqual(
            email_lookup("familia@ejemplo.com"),
            email_lookup(" FAMILIA@EJEMPLO.COM "),
        )


if __name__ == "__main__":
    unittest.main()