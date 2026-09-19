"""
Router de médicos: CRUD de perfiles médicos.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select
from typing import Optional, List

from app.database import get_session
from app.models import User, UserRole, DoctorProfile, MedicalSpecialty, ProfileStatus
from app.auth import get_current_user, require_role

router = APIRouter(prefix="/api/doctors", tags=["Médicos"])


# --- Schemas ---

class DoctorUpdateRequest(BaseModel):
    specialty: Optional[str] = None
    license_number: Optional[str] = None
    institution: Optional[str] = None
    experience_years: Optional[int] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    consultation_fee: Optional[float] = None
    accepts_home_visits: Optional[bool] = None


class DoctorResponse(BaseModel):
    id: int
    user_id: int
    full_name: str
    email: str
    specialty: str
    license_number: str
    institution: Optional[str]
    experience_years: int
    bio: Optional[str]
    location: str
    consultation_fee: float
    accepts_home_visits: bool
    status: str


# --- Endpoints públicos ---

@router.get("/", response_model=List[DoctorResponse])
def list_doctors(
    skip: int = 0,
    limit: int = 20,
    specialty: Optional[str] = None,
    location: Optional[str] = None,
    home_visits: Optional[bool] = None,
    session: Session = Depends(get_session),
):
    """Lista médicos aprobados. Filtra por especialidad, localidad o visitas domiciliarias."""
    statement = (
        select(DoctorProfile, User)
        .join(User, User.id == DoctorProfile.user_id)
        .where(DoctorProfile.status == ProfileStatus.approved)
        .where(User.is_active == True)
    )
    if specialty:
        statement = statement.where(DoctorProfile.specialty == MedicalSpecialty(specialty))
    if location:
        statement = statement.where(DoctorProfile.location.ilike(f"%{location}%"))
    if home_visits is not None:
        statement = statement.where(DoctorProfile.accepts_home_visits == home_visits)
    statement = statement.offset(skip).limit(limit)

    results = session.exec(statement).all()

    return [
        DoctorResponse(
            id=profile.id,
            user_id=profile.user_id,
            full_name=user.full_name,
            email=user.email,
            specialty=profile.specialty.value,
            license_number=profile.license_number,
            institution=profile.institution,
            experience_years=profile.experience_years,
            bio=profile.bio,
            location=profile.location,
            consultation_fee=profile.consultation_fee,
            accepts_home_visits=profile.accepts_home_visits,
            status=profile.status.value,
        )
        for profile, user in results
    ]


@router.get("/specialties")
def list_specialties():
    """Lista todas las especialidades médicas disponibles."""
    return [
        {"value": s.value, "label": SPECIALTY_LABELS.get(s.value, s.value)}
        for s in MedicalSpecialty
    ]


@router.get("/{doctor_id}", response_model=DoctorResponse)
def get_doctor(doctor_id: int, session: Session = Depends(get_session)):
    """Obtiene un médico por ID."""
    profile = session.get(DoctorProfile, doctor_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Médico no encontrado")
    user = session.get(User, profile.user_id)
    return DoctorResponse(
        id=profile.id,
        user_id=profile.user_id,
        full_name=user.full_name,
        email=user.email,
        specialty=profile.specialty.value,
        license_number=profile.license_number,
        institution=profile.institution,
        experience_years=profile.experience_years,
        bio=profile.bio,
        location=profile.location,
        consultation_fee=profile.consultation_fee,
        accepts_home_visits=profile.accepts_home_visits,
        status=profile.status.value,
    )


# --- Endpoints protegidos (médico actualiza su perfil) ---

@router.put("/me", response_model=DoctorResponse)
def update_my_profile(
    request: DoctorUpdateRequest,
    current_user: User = Depends(require_role(UserRole.doctor)),
    session: Session = Depends(get_session),
):
    """El médico actualiza su propio perfil."""
    profile = session.exec(
        select(DoctorProfile).where(DoctorProfile.user_id == current_user.id)
    ).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Perfil de médico no encontrado")

    update_data = request.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "specialty" and value:
            setattr(profile, key, MedicalSpecialty(value))
        else:
            setattr(profile, key, value)

    session.add(profile)
    session.commit()
    session.refresh(profile)

    return DoctorResponse(
        id=profile.id,
        user_id=profile.user_id,
        full_name=current_user.full_name,
        email=current_user.email,
        specialty=profile.specialty.value,
        license_number=profile.license_number,
        institution=profile.institution,
        experience_years=profile.experience_years,
        bio=profile.bio,
        location=profile.location,
        consultation_fee=profile.consultation_fee,
        accepts_home_visits=profile.accepts_home_visits,
        status=profile.status.value,
    )


# --- Labels para especialidades ---
SPECIALTY_LABELS = {
    "general": "Medicina General",
    "geriatrics": "Geriatría",
    "neurology": "Neurología",
    "cardiology": "Cardiología",
    "pulmonology": "Neumología",
    "psychiatry": "Psiquiatría",
    "physiatry": "Medicina Física y Rehabilitación",
    "palliative": "Cuidados Paliativos",
    "internal_medicine": "Medicina Interna",
    "endocrinology": "Endocrinología",
    "nephrology": "Nefrología",
    "orthopedics": "Ortopedia",
}
