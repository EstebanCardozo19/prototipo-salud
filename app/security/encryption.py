"""Cifrado autenticado de datos sensibles en reposo.

Las claves de datos son independientes de la clave de firma JWT. Fernet aporta
confidencialidad e integridad; nunca se debe intentar descifrar hashes de clave.
"""
import hashlib
import hmac
import json
import os
from typing import Any, Optional

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.types import Text, TypeDecorator


class EncryptionConfigurationError(RuntimeError):
    """La configuración criptográfica requerida no es válida."""


def _required_key(name: str) -> bytes:
    value = os.getenv(name)
    if not value:
        raise EncryptionConfigurationError(f"Debe configurar {name}.")
    return value.encode("ascii")


def _fernet() -> Fernet:
    try:
        return Fernet(_required_key("DATA_ENCRYPTION_KEY"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise EncryptionConfigurationError("DATA_ENCRYPTION_KEY debe ser una clave Fernet válida.") from exc


def validate_encryption_configuration() -> None:
    """Valida claves requeridas antes de aceptar tráfico de la aplicación."""
    _fernet()
    if len(_required_key("EMAIL_LOOKUP_KEY")) < 32:
        raise EncryptionConfigurationError("EMAIL_LOOKUP_KEY debe tener al menos 32 caracteres aleatorios.")


def encrypt_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    if is_encrypted(value):
        return value
    return "enc:" + _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_text(value: Optional[str], *, allow_legacy_plaintext: bool = False) -> Optional[str]:
    if value is None:
        return None
    if not is_encrypted(value):
        if allow_legacy_plaintext:
            return value
        raise ValueError("El valor no está cifrado.")
    try:
        return _fernet().decrypt(value[4:].encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeDecodeError) as exc:
        raise ValueError("No fue posible descifrar el valor protegido.") from exc


def encrypt_bytes(value: bytes) -> bytes:
    return _fernet().encrypt(value)


def decrypt_bytes(value: bytes, *, allow_legacy_plaintext: bool = False) -> bytes:
    try:
        return _fernet().decrypt(value)
    except InvalidToken:
        if allow_legacy_plaintext:
            return value
        raise ValueError("No fue posible descifrar el archivo protegido.")


def is_encrypted(value: object) -> bool:
    return isinstance(value, str) and value.startswith("enc:")


def normalized_email(email: str) -> str:
    return email.strip().casefold()


def email_lookup(email: str) -> str:
    return hmac.new(
        _required_key("EMAIL_LOOKUP_KEY"), normalized_email(email).encode("utf-8"), hashlib.sha256
    ).hexdigest()


def user_email(user) -> str:
    """Devuelve el email en claro de un usuario para una respuesta autorizada."""
    return decrypt_text(user.email, allow_legacy_plaintext=True) if user.role.value == "family" else user.email


def user_full_name(user) -> str:
    """Devuelve el nombre en claro de un usuario para una respuesta autorizada."""
    return decrypt_text(user.full_name, allow_legacy_plaintext=True) if user.role.value == "family" else user.full_name


class EncryptedText(TypeDecorator):
    """Columna TEXT que cifra al persistir y descifra únicamente al leer."""
    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Optional[str], _dialect):
        return encrypt_text(value)

    def process_result_value(self, value: Optional[str], _dialect):
        return decrypt_text(value, allow_legacy_plaintext=True)


class EncryptedJSON(TypeDecorator):
    """Serializa JSON y lo protege como texto cifrado autenticado."""
    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Any, _dialect):
        if value is None:
            return None
        return encrypt_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")))

    def process_result_value(self, value: Optional[str], _dialect):
        if value is None:
            return None
        plaintext = decrypt_text(value, allow_legacy_plaintext=True)
        try:
            return json.loads(plaintext)
        except (TypeError, json.JSONDecodeError):
            # Las instalaciones heredadas pueden contener JSONB convertido a texto.
            return plaintext