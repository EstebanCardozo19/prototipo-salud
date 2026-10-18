"""
Router de cuidadores: CRUD de perfiles.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlmodel import Session, select
from typing import Optional, List

from app.database import get_session
from app.models import User, UserRole, CaregiverProfile, ProfileStatus
from app.auth import get_current_user, require_role
from app.services.embedding_service import generar_embedding
from app.services.bogota_locations import (
    profile_covers_locality,
    validate_bogota_coverage_localities,
    validate_bogota_professional_location,
)

router = APIRouter(prefix="/api/caregivers", tags=["Cuidadores"])


# --- Schemas ---

class CaregiverUpdateRequest(BaseModel):
    experience_years: Optional[int] = None
    specialties: Optional[List[str]] = None
    hourly_rate: Optional[float] = None
    location: Optional[str] = None
    coverage_localities: Optional[List[str]] = None
    covers_all_bogota: Optional[bool] = None
    bio: Optional[str] = None

    @field_validator("location")
    @classmethod
    def location_must_be_bogota(cls, value: Optional[str]) -> Optional[str]:
        return validate_bogota_professional_location(value)

    @field_validator("coverage_localities")
    @classmethod
    def coverage_must_be_bogota(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        return validate_bogota_coverage_localities(value)


class CaregiverResponse(BaseModel):
    id: int
    user_id: int
    full_name: str
    email: str
    photo_url: Optional[str] = None
    experience_years: int
    specialties: Optional[List[str]]
    hourly_rate: float
    location: str
    coverage_localities: List[str] = []
    covers_all_bogota: bool = False
    bio: Optional[str]
    status: str
    rating_avg: Optional[float] = None
    rating_count: int = 0


# --- Endpoints públicos ---

@router.get("/", response_model=List[CaregiverResponse])
def list_caregivers(
    skip: int = 0,
    limit: int = 50,
    location: Optional[str] = None,
    search: Optional[str] = None,
    session: Session = Depends(get_session),
):
    """Lista cuidadores aprobados. Filtra por localidad y/o término de búsqueda (nombre, bio, especialidad)."""
    statement = (
        select(CaregiverProfile, User)
        .join(User, User.id == CaregiverProfile.user_id)
        .where(CaregiverProfile.status == ProfileStatus.approved)
        .where(User.is_active == True)
    )
    results = session.exec(statement).all()
    if location:
        results = [(profile, user) for profile, user in results if profile_covers_locality(profile, location)]
    results = results[skip:skip + limit]

    responses = [
        CaregiverResponse(
            id=profile.id,
            user_id=profile.user_id,
            full_name=user.full_name,
            email=user.email,
            photo_url=user.photo_url,
            experience_years=profile.experience_years,
            specialties=profile.specialties,
            hourly_rate=profile.hourly_rate,
            location=profile.location,
            coverage_localities=profile.coverage_localities or [],
            covers_all_bogota=profile.covers_all_bogota,
            bio=profile.bio,
            status=profile.status.value,
            rating_avg=profile.rating_avg,
            rating_count=profile.rating_count,
        )
        for profile, user in results
    ]

    # Filtro por búsqueda de texto (nombre, bio, especialidades) — case-insensitive
    if search:
        term = search.lower()
        responses = [
            r for r in responses
            if term in r.full_name.lower()
            or term in (r.bio or "").lower()
            or any(term in (s or "").lower() for s in (r.specialties or []))
        ]

    return responses


@router.get("/me", response_model=CaregiverResponse)
def get_my_profile(current_user: User = Depends(require_role(UserRole.caregiver)), session: Session = Depends(get_session)):
    profile = session.exec(select(CaregiverProfile).where(CaregiverProfile.user_id == current_user.id)).first()
    if not profile: raise HTTPException(404, "Perfil de cuidador no encontrado")
    return CaregiverResponse(id=profile.id, user_id=profile.user_id, full_name=current_user.full_name, email=current_user.email, photo_url=current_user.photo_url, experience_years=profile.experience_years, specialties=profile.specialties, hourly_rate=profile.hourly_rate, location=profile.location, coverage_localities=profile.coverage_localities or [], covers_all_bogota=profile.covers_all_bogota, bio=profile.bio, status=profile.status.value, rating_avg=profile.rating_avg, rating_count=profile.rating_count)

@router.get("/{profile_id}", response_model=CaregiverResponse)
def get_caregiver(profile_id: int, session: Session = Depends(get_session)):
    """Obtiene un cuidador aprobado por ID."""
    profile = session.get(CaregiverProfile, profile_id)
    if not profile or profile.status != ProfileStatus.approved:
        raise HTTPException(status_code=404, detail="Cuidador no encontrado")
    user = session.get(User, profile.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="Cuidador no encontrado")
    return CaregiverResponse(
        id=profile.id,
        user_id=profile.user_id,
        full_name=user.full_name,
        email=user.email,
        photo_url=user.photo_url,
        experience_years=profile.experience_years,
        specialties=profile.specialties,
        hourly_rate=profile.hourly_rate,
        location=profile.location,
        coverage_localities=profile.coverage_localities or [],
        covers_all_bogota=profile.covers_all_bogota,
        bio=profile.bio,
        status=profile.status.value,
        rating_avg=profile.rating_avg,
        rating_count=profile.rating_count,
    )


# --- Endpoints protegidos ---

@router.put("/me", response_model=CaregiverResponse)
def update_my_profile(
    request: CaregiverUpdateRequest,
    current_user: User = Depends(require_role(UserRole.caregiver)),
    session: Session = Depends(get_session),
):
    """El cuidador actualiza su propio perfil. Regenera embedding si cambia bio/specialties."""
    profile = session.exec(
        select(CaregiverProfile).where(CaregiverProfile.user_id == current_user.id)
    ).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Perfil de cuidador no encontrado")

    update_data = request.model_dump(exclude_unset=True)
    regenerate_embedding = False

    for key, value in update_data.items():
        setattr(profile, key, value)
        if key in ("bio", "specialties", "location", "coverage_localities", "covers_all_bogota"):
            regenerate_embedding = True

    if regenerate_embedding and profile.bio:
        texto = (
            f"{profile.bio} "
            f"Especialidades: {', '.join(profile.specialties or [])}. "
            f"Localidad primaria: {profile.location}. "
            f"Cobertura: {'Toda Bogotá' if profile.covers_all_bogota else ', '.join(profile.coverage_localities or [])}."
        )
        profile.embedding = generar_embedding(texto)

    session.add(profile)
    session.commit()
    session.refresh(profile)

    return CaregiverResponse(
        id=profile.id,
        user_id=profile.user_id,
        full_name=current_user.full_name,
        email=current_user.email,
        photo_url=current_user.photo_url,
        experience_years=profile.experience_years,
        specialties=profile.specialties,
        hourly_rate=profile.hourly_rate,
        location=profile.location,
        coverage_localities=profile.coverage_localities or [],
        covers_all_bogota=profile.covers_all_bogota,
        bio=profile.bio,
        status=profile.status.value,
    )
