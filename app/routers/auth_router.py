"""
Router de autenticación: registro y login.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.models import User, UserRole, CaregiverProfile, ProfileStatus
from app.auth import (
    RegisterRequest,
    LoginRequest,
    Token,
    UserResponse,
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)

router = APIRouter(prefix="/api/auth", tags=["Autenticación"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest, session: Session = Depends(get_session)):
    """Registra un nuevo usuario (familiar, cuidador o enfermero)."""
    if request.role not in ("family", "caregiver", "nurse"):
        raise HTTPException(status_code=400, detail="Rol debe ser 'family', 'caregiver' o 'nurse'")

    existing = session.exec(select(User).where(User.email == request.email)).first()
    if existing:
        raise HTTPException(status_code=409, detail="El email ya está registrado")

    user = User(
        email=request.email,
        password_hash=hash_password(request.password),
        full_name=request.full_name,
        role=UserRole(request.role),
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    if user.role == UserRole.caregiver:
        profile = CaregiverProfile(
            user_id=user.id,
            location="",
            status=ProfileStatus.pending,
        )
        session.add(profile)
        session.commit()

    if user.role == UserRole.nurse:
        from app.models import NurseProfile, NurseSpecialty
        nurse_profile = NurseProfile(
            user_id=user.id,
            specialty=NurseSpecialty.general,
            license_number="",
            location="",
            status=ProfileStatus.pending,
        )
        session.add(nurse_profile)
        session.commit()

    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        is_active=user.is_active,
        photo_url=user.photo_url,
    )


@router.post("/login", response_model=Token)
def login(request: LoginRequest, session: Session = Depends(get_session)):
    """Inicia sesión y retorna un token JWT."""
    user = session.exec(select(User).where(User.email == request.email)).first()
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos",
        )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Cuenta desactivada")

    token = create_access_token(data={
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value,
    })

    return Token(access_token=token, token_type="bearer")


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Retorna la información del usuario autenticado."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role.value,
        is_active=current_user.is_active,
        photo_url=current_user.photo_url,
    )
