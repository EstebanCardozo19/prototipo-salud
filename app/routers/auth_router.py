"""
Router de autenticación: registro y login.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.models import User, UserRole, CaregiverProfile, FamilyVerification, ProfileStatus
from app.auth import (
    RegisterRequest,
    LoginRequest,
    ChangePasswordRequest,
    SecurityQuestionsRequest,
    PasswordRecoveryQuestionsRequest,
    PasswordRecoveryQuestionsResponse,
    ResetPasswordWithSecurityQuestionsRequest,
    UpdateMyAccountRequest,
    Token,
    UserResponse,
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    normalize_security_answer,
)
from app.security.encryption import email_lookup, encrypt_text, normalized_email, user_email, user_full_name

router = APIRouter(prefix="/api/auth", tags=["Autenticación"])

SECURITY_QUESTION_IDS = {
    "first_pet": "¿Cuál fue el nombre de tu primera mascota?",
    "birth_city": "¿En qué ciudad naciste?",
    "favorite_teacher": "¿Cuál es el nombre de tu profesor(a) favorito(a)?",
    "childhood_friend": "¿Cuál es el nombre de tu mejor amigo(a) de infancia?",
    "favorite_book": "¿Cuál es tu libro favorito?",
    "mother_middle_name": "¿Cuál es el segundo nombre de tu madre?",
}


def _validate_security_questions(question_1: str, answer_1: str, question_2: str, answer_2: str) -> None:
    if question_1 not in SECURITY_QUESTION_IDS or question_2 not in SECURITY_QUESTION_IDS:
        raise HTTPException(status_code=422, detail="Selecciona preguntas de seguridad válidas")
    if question_1 == question_2:
        raise HTTPException(status_code=422, detail="Las preguntas de seguridad deben ser diferentes")
    if len(normalize_security_answer(answer_1)) < 2 or len(normalize_security_answer(answer_2)) < 2:
        raise HTTPException(status_code=422, detail="Cada respuesta de seguridad debe tener al menos 2 caracteres")


def _find_user_by_email(session: Session, email: str):
    lookup = email_lookup(email)
    user = session.exec(select(User).where(User.email_lookup == lookup)).first()
    if not user:
        user = session.exec(select(User).where(User.email == normalized_email(email))).first()
    return user


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest, session: Session = Depends(get_session)):
    """Registra un nuevo usuario (familiar, cuidador o enfermero).

    Las cuentas familiares quedan inactivas hasta que el administrador valide
    la cédula. Los profesionales quedan activos pero con perfil pendiente de
    verificación documental.
    """
    if request.role not in ("family", "caregiver", "nurse"):
        raise HTTPException(status_code=400, detail="Rol debe ser 'family', 'caregiver' o 'nurse'")

    # Cédula obligatoria y con formato válido para cuentas familiares
    if request.role == "family":
        raw_id = (request.national_id or "").strip()
        if not raw_id:
            raise HTTPException(status_code=422, detail="La cédula es obligatoria para cuentas familiares")
        if not raw_id.isdigit() or not (7 <= len(raw_id) <= 10):
            raise HTTPException(status_code=422, detail="La cédula debe contener entre 7 y 10 dígitos numéricos")

    _validate_security_questions(
        request.security_question_1, request.security_answer_1,
        request.security_question_2, request.security_answer_2,
    )
    lookup = email_lookup(request.email)
    existing = _find_user_by_email(session, request.email)
    if existing:
        raise HTTPException(status_code=409, detail="El email ya está registrado")

    is_family = request.role == "family"
    user = User(
        email=encrypt_text(normalized_email(request.email)) if is_family else normalized_email(request.email),
        email_lookup=lookup,
        password_hash=hash_password(request.password),
        security_question_1=request.security_question_1,
        security_answer_1_hash=hash_password(normalize_security_answer(request.security_answer_1)),
        security_question_2=request.security_question_2,
        security_answer_2_hash=hash_password(normalize_security_answer(request.security_answer_2)),
        full_name=encrypt_text(request.full_name.strip()) if is_family else request.full_name.strip(),
        role=UserRole(request.role),
        # Las cuentas familiares permanecen inactivas hasta aprobación de cédula.
        is_active=not is_family,
        national_id=request.national_id.strip() if is_family else None,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    if user.role == UserRole.family:
        fv = FamilyVerification(
            user_id=user.id,
            status=ProfileStatus.pending,
            submitted_at=user.created_at,
        )
        session.add(fv)
        session.commit()

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
        email=user_email(user),
        full_name=user_full_name(user),
        role=user.role.value,
        is_active=user.is_active,
        photo_url=user.photo_url,
        phone=user.phone,
        national_id_verified=user.national_id_verified,
    )


@router.post("/login", response_model=Token)
def login(request: LoginRequest, session: Session = Depends(get_session)):
    """Inicia sesión y retorna un token JWT."""
    user = _find_user_by_email(session, request.email)
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos",
        )

    if not user.is_active:
        # Diferenciar cuenta familiar pendiente de verificación de cuenta desactivada por admin
        if user.role == UserRole.family:
            raise HTTPException(
                status_code=403,
                detail="Tu cuenta está pendiente de verificación. El administrador revisará tu cédula y te notificará cuando esté activa.",
            )
        raise HTTPException(status_code=403, detail="Cuenta desactivada")

    token = create_access_token(data={
        "sub": str(user.id),
        "email": normalized_email(request.email),
        "role": user.role.value,
    })

    return Token(access_token=token, token_type="bearer")


@router.post("/password-recovery/questions", response_model=PasswordRecoveryQuestionsResponse)
def get_password_recovery_questions(
    request: PasswordRecoveryQuestionsRequest,
    session: Session = Depends(get_session),
):
    """Obtiene las preguntas configuradas antes de permitir restablecer la clave."""
    user = _find_user_by_email(session, request.email)
    if not user or not user.is_active or not user.security_question_1 or not user.security_question_2:
        raise HTTPException(status_code=404, detail="No hay preguntas de seguridad configuradas para esta cuenta")
    return PasswordRecoveryQuestionsResponse(
        security_question_1=user.security_question_1,
        security_question_2=user.security_question_2,
    )


@router.post("/password-recovery/reset")
def reset_password_with_security_questions(
    request: ResetPasswordWithSecurityQuestionsRequest,
    session: Session = Depends(get_session),
):
    """Restablece una contraseña tras validar las dos respuestas configuradas."""
    if len(request.new_password) < 6:
        raise HTTPException(status_code=422, detail="La nueva contraseña debe tener al menos 6 caracteres")

    user = _find_user_by_email(session, request.email)
    answers_are_valid = bool(
        user and user.is_active and user.security_answer_1_hash and user.security_answer_2_hash
        and verify_password(normalize_security_answer(request.security_answer_1), user.security_answer_1_hash)
        and verify_password(normalize_security_answer(request.security_answer_2), user.security_answer_2_hash)
    )
    if not answers_are_valid:
        raise HTTPException(status_code=400, detail="Las respuestas de seguridad no son correctas")

    user.password_hash = hash_password(request.new_password)
    session.add(user)
    session.commit()
    return {"message": "Contraseña restablecida correctamente"}


@router.put("/change-password")
def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Verifica la contraseña actual y guarda de forma segura la nueva."""
    if not verify_password(request.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual es incorrecta",
        )

    if len(request.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La nueva contraseña debe tener al menos 6 caracteres",
        )

    current_user.password_hash = hash_password(request.new_password)
    session.add(current_user)
    session.commit()

    return {"message": "Contraseña actualizada correctamente"}


@router.get("/security-questions")
def get_security_questions(current_user: User = Depends(get_current_user)):
    """Indica si la cuenta tiene preguntas y devuelve sus identificadores seguros."""
    return {
        "configured": bool(current_user.security_question_1 and current_user.security_question_2),
        "security_question_1": current_user.security_question_1,
        "security_question_2": current_user.security_question_2,
    }


@router.put("/security-questions")
def save_security_questions(
    request: SecurityQuestionsRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Configura o actualiza preguntas, exigiendo la contraseña de la sesión."""
    if not verify_password(request.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="La contraseña actual es incorrecta")
    _validate_security_questions(
        request.security_question_1, request.security_answer_1,
        request.security_question_2, request.security_answer_2,
    )
    current_user.security_question_1 = request.security_question_1
    current_user.security_answer_1_hash = hash_password(normalize_security_answer(request.security_answer_1))
    current_user.security_question_2 = request.security_question_2
    current_user.security_answer_2_hash = hash_password(normalize_security_answer(request.security_answer_2))
    session.add(current_user)
    session.commit()
    return {"message": "Preguntas de seguridad guardadas correctamente"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Retorna la información del usuario autenticado."""
    return UserResponse(
        id=current_user.id,
        email=user_email(current_user),
        full_name=user_full_name(current_user),
        role=current_user.role.value,
        is_active=current_user.is_active,
        photo_url=current_user.photo_url,
        phone=current_user.phone,
        national_id_verified=current_user.national_id_verified,
    )


@router.put("/me", response_model=UserResponse)
def update_me(
    request: UpdateMyAccountRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Actualiza el teléfono de la cuenta autenticada."""
    # UpdateMyAccountRequest ya normaliza el campo opcional y valida que el
    # celular colombiano tenga diez dígitos y empiece por 3.
    current_user.phone = request.phone
    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    return UserResponse(
        id=current_user.id,
        email=user_email(current_user),
        full_name=user_full_name(current_user),
        role=current_user.role.value,
        is_active=current_user.is_active,
        photo_url=current_user.photo_url,
        phone=current_user.phone,
    )
