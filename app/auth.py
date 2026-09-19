"""
Módulo de autenticación con JWT (JSON Web Tokens).
Maneja registro, login, hash de contraseñas y protección de rutas.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlmodel import Session, select

from app.models import User, UserRole
from app.database import get_session

# --- Configuración ---
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 horas

# --- Password hashing ---
import bcrypt as _bcrypt


def _hash_password_impl(password: str) -> str:
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def _verify_password_impl(plain_password: str, hashed_password: str) -> bool:
    return _bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

# --- OAuth2 scheme ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# --- Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    user_id: int | None = None
    email: str | None = None
    role: str | None = None


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    role: str  # "family" o "caregiver"


class LoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    photo_url: Optional[str] = None


# --- Funciones de utilidad ---

def hash_password(password: str) -> str:
    return _hash_password_impl(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return _verify_password_impl(plain_password, hashed_password)


def validate_authentication_configuration() -> None:
    """Evita iniciar la API con una clave JWT ausente o débil."""
    if len(SECRET_KEY) < 32:
        raise RuntimeError("JWT_SECRET_KEY debe contener al menos 32 caracteres aleatorios.")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> TokenData:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_raw = payload.get("sub")
        email: str = payload.get("email")
        role: str = payload.get("role")
        if user_id_raw is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return TokenData(user_id=int(user_id_raw), email=email, role=role)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )


# --- Dependencias de FastAPI ---

def get_current_user(token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)) -> User:
    """Dependencia que extrae y valida el usuario actual del token JWT."""
    token_data = decode_token(token)
    user = session.get(User, token_data.user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado o desactivado",
        )
    return user


def require_role(*roles: UserRole):
    """Factory de dependencia que verifica que el usuario tenga uno de los roles indicados."""
    def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Se requiere rol: {', '.join(r.value for r in roles)}",
            )
        return current_user
    return role_checker
