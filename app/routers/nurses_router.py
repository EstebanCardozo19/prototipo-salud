"""
Router de enfermeros: CRUD de perfiles.
"""
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlmodel import Session, select
from typing import Optional, List
import math

from app.database import engine, get_session
from app.models import User, UserRole, NurseProfile, NurseSpecialty, ProfileStatus
from app.auth import get_current_user, require_role
from app.services.bogota_locations import validate_bogota_professional_location
from app.services.embedding_service import generar_embedding

router = APIRouter(prefix="/api/nurses", tags=["Enfermeros"])
logger = logging.getLogger(__name__)

SPECIALTY_LABELS = {
    "general": "Enfermería General", "geriatrics": "Geriatría", "neurology": "Neurología",
    "cardiology": "Cardiología", "pulmonology": "Neumología", "psychiatry": "Psiquiatría",
    "physiatry": "Rehabilitación", "palliative": "Cuidados Paliativos",
    "internal_medicine": "Medicina Interna", "endocrinology": "Endocrinología",
    "nephrology": "Nefrología", "orthopedics": "Ortopedia",
}


def regenerate_nurse_embedding(profile_id: int, text: str) -> None:
    """Actualiza el índice semántico sin retrasar la respuesta de edición."""
    try:
        embedding = generar_embedding(text)
        with Session(engine) as session:
            profile = session.get(NurseProfile, profile_id)
            if not profile:
                return
            profile.embedding = embedding
            session.add(profile)
            session.commit()
    except Exception:
        logger.exception("No fue posible regenerar el embedding del perfil de enfermería %s", profile_id)

class NurseUpdateRequest(BaseModel):
    specialty: Optional[str] = None
    license_number: Optional[str] = None
    institution: Optional[str] = None
    experience_years: Optional[int] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    hourly_rate: Optional[float] = None

    @field_validator("experience_years", mode="before")
    @classmethod
    def experience_years_must_be_a_non_negative_integer(cls, value):
        if value is None:
            return value
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError("Los años de experiencia deben ser un número entero igual o mayor que cero")
        if value < 0:
            raise ValueError("Los años de experiencia no pueden ser negativos")
        return value

    @field_validator("hourly_rate", mode="before")
    @classmethod
    def hourly_rate_must_be_positive(cls, value):
        if value is None:
            raise ValueError("La tarifa por hora es obligatoria y debe ser mayor que cero")
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("La tarifa por hora debe ser un número mayor que cero")
        if not math.isfinite(value) or value <= 0:
            raise ValueError("La tarifa por hora debe ser mayor que cero")
        return value

    @field_validator("specialty", "license_number")
    @classmethod
    def required_professional_text_must_not_be_blank(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not value.strip():
            raise ValueError("Este dato profesional obligatorio no puede estar vacío")
        return value.strip() if value is not None else value

    @field_validator("institution")
    @classmethod
    def normalize_optional_institution(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() or None if value is not None else None

    @field_validator("location")
    @classmethod
    def location_must_be_bogota(cls, value: Optional[str]) -> Optional[str]:
        return validate_bogota_professional_location(value)

class NurseResponse(BaseModel):
    id: int
    user_id: int
    full_name: str
    email: str
    photo_url: Optional[str] = None
    specialty: str
    license_number: str
    institution: Optional[str]
    experience_years: int
    bio: Optional[str]
    location: str
    hourly_rate: float
    status: str
    rating_avg: Optional[float] = None
    rating_count: int = 0

@router.get("/", response_model=List[NurseResponse])
def list_nurses(
    skip: int = 0, limit: int = 50,
    specialty: Optional[str] = None,
    location: Optional[str] = None,
    search: Optional[str] = None,
    session: Session = Depends(get_session),
):
    statement = (
        select(NurseProfile, User)
        .join(User, User.id == NurseProfile.user_id)
        .where(NurseProfile.status == ProfileStatus.approved)
        .where(User.is_active == True)
    )
    if specialty:
        statement = statement.where(NurseProfile.specialty == NurseSpecialty(specialty))
    if location:
        statement = statement.where(NurseProfile.location.ilike(f"%{location}%"))

    results = session.exec(statement.offset(skip).limit(limit)).all()
    responses = [
        NurseResponse(
            id=p.id, user_id=p.user_id, full_name=u.full_name, email=u.email, photo_url=u.photo_url,
            specialty=p.specialty.value, license_number=p.license_number,
            institution=p.institution, experience_years=p.experience_years,
            bio=p.bio, location=p.location, hourly_rate=p.hourly_rate,
            status=p.status.value,
            rating_avg=p.rating_avg, rating_count=p.rating_count,
        )
        for p, u in results
    ]

    # Filtro texto por nombre, bio o especialidad
    if search:
        term = search.lower()
        responses = [
            r for r in responses
            if term in r.full_name.lower()
            or term in (r.bio or "").lower()
            or term in SPECIALTY_LABELS.get(r.specialty, r.specialty).lower()
            or term in r.specialty.lower()
        ]

    return responses

@router.get("/specialties")
def list_specialties():
    return [{"value": s.value, "label": SPECIALTY_LABELS.get(s.value, s.value)} for s in NurseSpecialty]

@router.get("/me", response_model=NurseResponse)
def get_my_profile(current_user: User = Depends(require_role(UserRole.nurse)), session: Session = Depends(get_session)):
    p = session.exec(select(NurseProfile).where(NurseProfile.user_id == current_user.id)).first()
    if not p: raise HTTPException(404, "Perfil no encontrado")
    return NurseResponse(id=p.id, user_id=p.user_id, full_name=current_user.full_name, email=current_user.email, photo_url=current_user.photo_url, specialty=p.specialty.value, license_number=p.license_number, institution=p.institution, experience_years=p.experience_years, bio=p.bio, location=p.location, hourly_rate=p.hourly_rate, status=p.status.value, rating_avg=p.rating_avg, rating_count=p.rating_count)

@router.get("/{nurse_id}", response_model=NurseResponse)
def get_nurse(nurse_id: int, session: Session = Depends(get_session)):
    p = session.get(NurseProfile, nurse_id)
    if not p or p.status != ProfileStatus.approved:
        raise HTTPException(status_code=404, detail="Enfermero no encontrado")
    u = session.get(User, p.user_id)
    if not u or not u.is_active:
        raise HTTPException(status_code=404, detail="Enfermero no encontrado")
    return NurseResponse(id=p.id, user_id=p.user_id, full_name=u.full_name, email=u.email, photo_url=u.photo_url, specialty=p.specialty.value, license_number=p.license_number, institution=p.institution, experience_years=p.experience_years, bio=p.bio, location=p.location, hourly_rate=p.hourly_rate, status=p.status.value, rating_avg=p.rating_avg, rating_count=p.rating_count)

@router.put("/me", response_model=NurseResponse)
def update_my_profile(
    request: NurseUpdateRequest,
    current_user: User = Depends(require_role(UserRole.nurse)),
    session: Session = Depends(get_session),
    background_tasks: BackgroundTasks = None,
):
    p = session.exec(select(NurseProfile).where(NurseProfile.user_id == current_user.id)).first()
    if not p: raise HTTPException(status_code=404, detail="Perfil no encontrado")
    update_data = request.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        if k == "specialty" and v: setattr(p, k, NurseSpecialty(v))
        else: setattr(p, k, v)
    session.add(p); session.commit(); session.refresh(p)
    if any(key in update_data for key in ("specialty", "bio", "location")) and p.bio:
        embedding_text = f"{p.bio} Especialidad: {p.specialty.value}. Localidad: {p.location}."
        if background_tasks:
            background_tasks.add_task(regenerate_nurse_embedding, p.id, embedding_text)
        else:
            # Mantiene la función utilizable directamente fuera de una petición FastAPI.
            regenerate_nurse_embedding(p.id, embedding_text)
    return NurseResponse(id=p.id, user_id=p.user_id, full_name=current_user.full_name, email=current_user.email, photo_url=current_user.photo_url, specialty=p.specialty.value, license_number=p.license_number, institution=p.institution, experience_years=p.experience_years, bio=p.bio, location=p.location, hourly_rate=p.hourly_rate, status=p.status.value, rating_avg=p.rating_avg, rating_count=p.rating_count)
