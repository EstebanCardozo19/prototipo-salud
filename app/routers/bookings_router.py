"""
Router de solicitudes de contratación, disponibilidad y reseñas.
Sistema de rating bidireccional: familiar → profesional y profesional → familiar.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from datetime import date as calendar_date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from pydantic import BaseModel, field_validator, model_validator
from sqlmodel import Session, select
from typing import Optional, List

from app.database import get_session
from app.models import (
    User, UserRole, Booking, BookingStatus,
    Availability, DayOfWeek, Review, FamilyReview,
    CaregiverProfile, NurseProfile,
    ClinicalRecord,
)
from app.auth import get_current_user, require_role
from app.routers.notifications_router import create_notification
from app.security.encryption import user_full_name
from app.services.ratings import calculate_rating_summary

router = APIRouter(prefix="/api/bookings", tags=["Solicitudes y Calendario"])

BOOKING_TIMEZONE = ZoneInfo("America/Bogota")


# ── Helpers ──────────────────────────────────────────────────

def validate_booking_schedule(
    service_date: str,
    start_hour: int,
    end_hour: int,
    now: datetime | None = None,
) -> None:
    """Valida un horario de solicitud en la zona horaria de Bogotá.

    Un fin menor al inicio representa un turno nocturno que termina al día
    siguiente. Un fin igual al inicio no define una duración válida.
    """
    try:
        parsed_date = calendar_date.fromisoformat(service_date)
    except (TypeError, ValueError) as error:
        raise ValueError("La fecha del servicio debe tener el formato AAAA-MM-DD") from error

    if not 0 <= start_hour <= 23 or not 0 <= end_hour <= 23:
        raise ValueError("Las horas de inicio y fin deben estar entre 00:00 y 23:00")
    if end_hour == start_hour:
        raise ValueError("La hora de finalización debe ser distinta de la hora de inicio")

    current_time = now or datetime.now(BOOKING_TIMEZONE)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=BOOKING_TIMEZONE)
    else:
        current_time = current_time.astimezone(BOOKING_TIMEZONE)

    start = datetime.combine(parsed_date, time(hour=start_hour), BOOKING_TIMEZONE)
    if start < current_time:
        raise ValueError("La fecha y hora de inicio deben ser futuras en Bogotá")

def _recalc_professional_rating(professional_user_id: int, session: Session):
    """Recalcula rating_avg y rating_count en el perfil del profesional."""
    reviews = session.exec(
        select(Review).where(Review.professional_user_id == professional_user_id)
    ).all()
    avg, count = calculate_rating_summary(review.rating for review in reviews)

    prof_user = session.get(User, professional_user_id)
    if not prof_user:
        return
    if prof_user.role == UserRole.caregiver:
        profile = session.exec(
            select(CaregiverProfile).where(CaregiverProfile.user_id == professional_user_id)
        ).first()
    else:
        profile = session.exec(
            select(NurseProfile).where(NurseProfile.user_id == professional_user_id)
        ).first()
    if profile:
        profile.rating_avg = avg
        profile.rating_count = count
        session.add(profile)
        session.commit()


# --- Schemas ---

class BookingCreate(BaseModel):
    professional_user_id: int
    professional_role: str          # "caregiver" o "nurse"
    clinical_record_id: int
    date: str                        # YYYY-MM-DD
    start_hour: int
    end_hour: int
    notes: Optional[str] = None
    location_sharing_preference: str = "locality_neighborhood"

    @model_validator(mode="after")
    def validate_schedule(self):
        validate_booking_schedule(self.date, self.start_hour, self.end_hour)
        return self

    @field_validator("location_sharing_preference")
    @classmethod
    def validate_location_sharing_preference(cls, value: str) -> str:
        if value not in {"exact_address", "locality_neighborhood"}:
            raise ValueError("La preferencia de ubicación no es válida")
        return value


class BookingResponse(BaseModel):
    id: int
    family_user_id: int
    clinical_record_id: Optional[int] = None
    patient_name: Optional[str] = None
    professional_user_id: int
    professional_role: str
    date: str
    start_hour: int
    end_hour: int
    notes: Optional[str]
    location_sharing_preference: str = "locality_neighborhood"
    status: str
    rejection_reason: Optional[str]
    family_name: Optional[str] = None
    professional_name: Optional[str] = None
    # Para saber si ya se calificó
    reviewed_by_family: bool = False
    reviewed_by_professional: bool = False
    # Información pública del profesional para mostrarla en solicitudes familiares
    professional_photo_url: Optional[str] = None
    professional_experience_years: Optional[int] = None
    professional_specialties: Optional[List[str]] = None
    professional_specialty: Optional[str] = None
    professional_institution: Optional[str] = None
    professional_hourly_rate: Optional[float] = None
    professional_location: Optional[str] = None
    professional_bio: Optional[str] = None
    professional_rating_avg: Optional[float] = None
    professional_rating_count: Optional[int] = None
    # Información limitada de la familia/paciente para que el profesional decida la solicitud.
    # La dirección exacta solo se devuelve si la familia la autorizó para este servicio.
    family_photo_url: Optional[str] = None
    patient_age: Optional[int] = None
    patient_mobility_level: Optional[str] = None
    patient_sector: Optional[str] = None
    patient_neighborhood: Optional[str] = None
    patient_city: Optional[str] = None
    patient_address: Optional[str] = None
    patient_is_apartment: Optional[bool] = None
    patient_floor_number: Optional[int] = None
    patient_has_elevator: Optional[bool] = None
    family_rating_avg: Optional[float] = None
    family_rating_count: Optional[int] = None
    family_recent_reviews: List["FamilyReviewResponse"] = []


class BookingDecision(BaseModel):
    status: str             # "approved" o "rejected"
    rejection_reason: Optional[str] = None


class AvailabilityCreate(BaseModel):
    day_of_week: str
    start_hour: int
    end_hour: int
    is_active: bool = True


class AvailabilityResponse(BaseModel):
    id: int
    day_of_week: str
    start_hour: int
    end_hour: int
    is_active: bool


class ReviewCreate(BaseModel):
    professional_user_id: int
    booking_id: int          # Obligatorio: solo se puede calificar tras completar
    rating: int              # 1-5
    comment: Optional[str] = None


class ReviewResponse(BaseModel):
    id: int
    family_user_id: int
    professional_user_id: int
    booking_id: Optional[int]
    rating: int
    comment: Optional[str]
    family_name: Optional[str] = None
    created_at: Optional[str] = None


class FamilyReviewCreate(BaseModel):
    family_user_id: int
    booking_id: int          # Obligatorio
    rating: int              # 1-5
    comment: Optional[str] = None


class FamilyReviewResponse(BaseModel):
    id: int
    professional_user_id: int
    family_user_id: int
    booking_id: int
    rating: int
    comment: Optional[str]
    professional_name: Optional[str] = None
    created_at: Optional[str] = None


def _family_review_summary(family_user_id: int, session: Session):
    """Retorna métricas y reseñas recientes para decisiones de contratación."""
    reviews = session.exec(
        select(FamilyReview)
        .where(FamilyReview.family_user_id == family_user_id)
        .order_by(FamilyReview.created_at.desc())
    ).all()
    count = len(reviews)
    return {
        "family_rating_avg": round(sum(review.rating for review in reviews) / count, 2) if count else None,
        "family_rating_count": count,
        "family_recent_reviews": [
            FamilyReviewResponse(
                id=review.id,
                professional_user_id=review.professional_user_id,
                family_user_id=review.family_user_id,
                booking_id=review.booking_id,
                rating=review.rating,
                comment=review.comment,
                professional_name=(session.get(User, review.professional_user_id).full_name if session.get(User, review.professional_user_id) else None),
                created_at=review.created_at.isoformat() if review.created_at else None,
            )
            for review in reviews[:3]
        ],
    }


# ============================================================
# SOLICITUDES DE CONTRATACIÓN
# ============================================================

@router.post("/", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
def create_booking(
    request: BookingCreate,
    current_user: User = Depends(require_role(UserRole.family)),
    session: Session = Depends(get_session),
):
    """Familiar crea una solicitud de contratación a un profesional."""
    professional = session.get(User, request.professional_user_id)
    if not professional:
        raise HTTPException(status_code=404, detail="Profesional no encontrado")
    if professional.role.value != request.professional_role:
        raise HTTPException(status_code=400, detail="El rol no coincide con el profesional")
    clinical_record = session.get(ClinicalRecord, request.clinical_record_id)
    if not clinical_record or clinical_record.family_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="La ficha clínica no pertenece a tu cuenta")

    booking = Booking(
        family_user_id=current_user.id,
        clinical_record_id=request.clinical_record_id,
        professional_user_id=request.professional_user_id,
        professional_role=request.professional_role,
        date=request.date,
        start_hour=request.start_hour,
        end_hour=request.end_hour,
        notes=request.notes,
        location_sharing_preference=request.location_sharing_preference,
        status=BookingStatus.pending,
    )
    session.add(booking)
    session.flush()
    create_notification(
        session,
        professional.id,
        "booking",
        "Nueva solicitud de servicio",
        f"{user_full_name(current_user)} te envió una solicitud para el {booking.date}.",
        booking.id,
    )
    session.commit()
    session.refresh(booking)

    return BookingResponse(
        id=booking.id,
        family_user_id=booking.family_user_id,
        clinical_record_id=booking.clinical_record_id,
        patient_name=clinical_record.patient_name,
        professional_user_id=booking.professional_user_id,
        professional_role=booking.professional_role,
        date=booking.date, start_hour=booking.start_hour, end_hour=booking.end_hour,
        notes=booking.notes, status=booking.status.value,
        location_sharing_preference=booking.location_sharing_preference,
        rejection_reason=booking.rejection_reason,
        family_name=user_full_name(current_user),
        professional_name=professional.full_name,
    )


@router.get("/my-requests", response_model=List[BookingResponse])
def list_my_requests(
    current_user: User = Depends(require_role(UserRole.family)),
    session: Session = Depends(get_session),
):
    """Familiar ve sus solicitudes enviadas."""
    bookings = session.exec(
        select(Booking)
        .where(Booking.family_user_id == current_user.id)
        .order_by(Booking.date.desc())
    ).all()

    # IDs de bookings ya reseñados por este familiar
    reviewed_ids = {
        r.booking_id for r in session.exec(
            select(Review).where(Review.family_user_id == current_user.id)
        ).all() if r.booking_id
    }

    results = []
    for b in bookings:
        prof = session.get(User, b.professional_user_id)
        caregiver_profile = None
        nurse_profile = None
        if b.professional_role == UserRole.caregiver.value:
            caregiver_profile = session.exec(
                select(CaregiverProfile).where(CaregiverProfile.user_id == b.professional_user_id)
            ).first()
        elif b.professional_role == UserRole.nurse.value:
            nurse_profile = session.exec(
                select(NurseProfile).where(NurseProfile.user_id == b.professional_user_id)
            ).first()

        profile = caregiver_profile or nurse_profile
        results.append(BookingResponse(
            id=b.id, family_user_id=b.family_user_id,
            clinical_record_id=b.clinical_record_id,
            patient_name=(session.get(ClinicalRecord, b.clinical_record_id).patient_name if b.clinical_record_id and session.get(ClinicalRecord, b.clinical_record_id) else None),
            professional_user_id=b.professional_user_id,
            professional_role=b.professional_role,
            date=b.date, start_hour=b.start_hour, end_hour=b.end_hour,
            notes=b.notes, status=b.status.value,
            location_sharing_preference=b.location_sharing_preference,
            rejection_reason=b.rejection_reason,
            family_name=user_full_name(current_user),
            professional_name=prof.full_name if prof else None,
            reviewed_by_family=b.id in reviewed_ids,
            professional_photo_url=prof.photo_url if prof else None,
            professional_experience_years=profile.experience_years if profile else None,
            professional_specialties=caregiver_profile.specialties if caregiver_profile else None,
            professional_specialty=nurse_profile.specialty.value if nurse_profile else None,
            professional_institution=nurse_profile.institution if nurse_profile else None,
            professional_hourly_rate=profile.hourly_rate if profile else None,
            professional_location=profile.location if profile else None,
            professional_bio=profile.bio if profile else None,
            professional_rating_avg=profile.rating_avg if profile else None,
            professional_rating_count=profile.rating_count if profile else None,
        ))
    return results


@router.get("/family-calendar", response_model=List[BookingResponse])
def get_family_calendar(
    clinical_record_id: int,
    current_user: User = Depends(require_role(UserRole.family)),
    session: Session = Depends(get_session),
):
    """Calendario de servicios de una ficha clínica perteneciente a la familia autenticada."""
    clinical_record = session.get(ClinicalRecord, clinical_record_id)
    if not clinical_record or clinical_record.family_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="La ficha clínica no pertenece a tu cuenta")

    bookings = session.exec(
        select(Booking)
        .where(Booking.family_user_id == current_user.id)
        .where(Booking.clinical_record_id == clinical_record_id)
        .order_by(Booking.date, Booking.start_hour)
    ).all()
    results = []
    for b in bookings:
        professional = session.get(User, b.professional_user_id)
        results.append(BookingResponse(
            id=b.id, family_user_id=b.family_user_id,
            clinical_record_id=b.clinical_record_id, patient_name=clinical_record.patient_name,
            professional_user_id=b.professional_user_id, professional_role=b.professional_role,
            date=b.date, start_hour=b.start_hour, end_hour=b.end_hour, notes=b.notes,
            status=b.status.value, rejection_reason=b.rejection_reason,
            family_name=user_full_name(current_user),
            professional_name=professional.full_name if professional else None,
        ))
    return results


@router.get("/incoming", response_model=List[BookingResponse])
def list_incoming_requests(
    current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse)),
    session: Session = Depends(get_session),
):
    """Profesional ve las solicitudes que le han enviado."""
    bookings = session.exec(
        select(Booking)
        .where(Booking.professional_user_id == current_user.id)
        .order_by(Booking.date.desc())
    ).all()

    # IDs de bookings donde el profesional ya calificó al familiar
    prof_reviewed_ids = {
        r.booking_id for r in session.exec(
            select(FamilyReview).where(FamilyReview.professional_user_id == current_user.id)
        ).all()
    }

    results = []
    for b in bookings:
        family = session.get(User, b.family_user_id)
        clinical_record = session.get(ClinicalRecord, b.clinical_record_id) if b.clinical_record_id else None
        review_summary = _family_review_summary(b.family_user_id, session)
        results.append(BookingResponse(
            id=b.id, family_user_id=b.family_user_id,
            clinical_record_id=b.clinical_record_id,
            patient_name=clinical_record.patient_name if clinical_record else None,
            professional_user_id=b.professional_user_id,
            professional_role=b.professional_role,
            date=b.date, start_hour=b.start_hour, end_hour=b.end_hour,
            notes=b.notes, status=b.status.value,
            location_sharing_preference=b.location_sharing_preference,
            rejection_reason=b.rejection_reason,
            family_name=user_full_name(family) if family else None,
            family_photo_url=family.photo_url if family else None,
            professional_name=current_user.full_name,
            reviewed_by_professional=b.id in prof_reviewed_ids,
            patient_age=clinical_record.patient_age if clinical_record else None,
            patient_mobility_level=clinical_record.mobility_level if clinical_record else None,
            patient_sector=clinical_record.sector if clinical_record else None,
            patient_neighborhood=clinical_record.neighborhood if clinical_record else None,
            patient_city=clinical_record.city if clinical_record else None,
            patient_address=(clinical_record.address if clinical_record and b.location_sharing_preference == "exact_address" else None),
            patient_is_apartment=clinical_record.is_apartment if clinical_record else None,
            patient_floor_number=clinical_record.floor_number if clinical_record else None,
            patient_has_elevator=clinical_record.has_elevator if clinical_record else None,
            **review_summary,
        ))
    return results


@router.put("/{booking_id}/decide", response_model=BookingResponse)
def decide_booking(
    booking_id: int,
    decision: BookingDecision,
    current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse)),
    session: Session = Depends(get_session),
):
    """Profesional aprueba o rechaza una solicitud."""
    booking = session.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if booking.professional_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")
    if booking.status != BookingStatus.pending:
        raise HTTPException(status_code=400, detail="La solicitud ya fue procesada")
    if decision.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Status debe ser 'approved' o 'rejected'")

    booking.status = BookingStatus(decision.status)
    if decision.status == "rejected":
        booking.rejection_reason = decision.rejection_reason

    session.add(booking)
    decision_label = "aprobada" if decision.status == "approved" else "rechazada"
    create_notification(
        session,
        booking.family_user_id,
        "booking_status",
        f"Solicitud {decision_label}",
        f"{current_user.full_name} ha {decision_label} tu solicitud para el {booking.date}.",
        booking.id,
    )
    session.commit()
    session.refresh(booking)

    family = session.get(User, booking.family_user_id)
    return BookingResponse(
        id=booking.id, family_user_id=booking.family_user_id,
        professional_user_id=booking.professional_user_id,
        professional_role=booking.professional_role,
        date=booking.date, start_hour=booking.start_hour, end_hour=booking.end_hour,
        notes=booking.notes, status=booking.status.value,
        rejection_reason=booking.rejection_reason,
        family_name=user_full_name(family) if family else None,
        professional_name=current_user.full_name,
    )


@router.put("/{booking_id}/complete", response_model=BookingResponse)
def complete_booking(
    booking_id: int,
    current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse)),
    session: Session = Depends(get_session),
):
    """Profesional marca el servicio como completado. Habilita calificación mutua."""
    booking = session.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if booking.professional_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")
    if booking.status != BookingStatus.approved:
        raise HTTPException(status_code=400, detail="Solo se pueden completar solicitudes aprobadas")

    booking.status = BookingStatus.completed
    session.add(booking)
    create_notification(
        session,
        booking.family_user_id,
        "booking_status",
        "Servicio completado",
        f"{current_user.full_name} marcó como completado el servicio del {booking.date}.",
        booking.id,
    )
    session.commit()
    session.refresh(booking)

    family = session.get(User, booking.family_user_id)
    return BookingResponse(
        id=booking.id, family_user_id=booking.family_user_id,
        professional_user_id=booking.professional_user_id,
        professional_role=booking.professional_role,
        date=booking.date, start_hour=booking.start_hour, end_hour=booking.end_hour,
        notes=booking.notes, status=booking.status.value,
        rejection_reason=booking.rejection_reason,
        family_name=user_full_name(family) if family else None,
        professional_name=current_user.full_name,
    )


@router.get("/calendar/{professional_user_id}", response_model=List[BookingResponse])
def get_professional_calendar(
    professional_user_id: int,
    session: Session = Depends(get_session),
):
    """Ve el calendario (bookings aprobados/completados) de un profesional."""
    bookings = session.exec(
        select(Booking)
        .where(Booking.professional_user_id == professional_user_id)
        .where(Booking.status.in_([BookingStatus.approved, BookingStatus.completed]))
        .order_by(Booking.date)
    ).all()

    results = []
    for b in bookings:
        family = session.get(User, b.family_user_id)
        prof = session.get(User, b.professional_user_id)
        results.append(BookingResponse(
            id=b.id, family_user_id=b.family_user_id,
            professional_user_id=b.professional_user_id,
            professional_role=b.professional_role,
            date=b.date, start_hour=b.start_hour, end_hour=b.end_hour,
            notes=b.notes, status=b.status.value, rejection_reason=None,
            family_name=user_full_name(family) if family else None,
            professional_name=prof.full_name if prof else None,
        ))
    return results


# ============================================================
# DISPONIBILIDAD HORARIA
# ============================================================

@router.get("/availability/me", response_model=List[AvailabilityResponse])
def get_my_availability(
    current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse)),
    session: Session = Depends(get_session),
):
    avails = session.exec(
        select(Availability).where(Availability.professional_user_id == current_user.id)
    ).all()
    return [AvailabilityResponse(id=a.id, day_of_week=a.day_of_week.value,
            start_hour=a.start_hour, end_hour=a.end_hour, is_active=a.is_active) for a in avails]


@router.post("/availability", response_model=AvailabilityResponse, status_code=status.HTTP_201_CREATED)
def set_availability(
    request: AvailabilityCreate,
    current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse)),
    session: Session = Depends(get_session),
):
    existing = session.exec(
        select(Availability)
        .where(Availability.professional_user_id == current_user.id)
        .where(Availability.day_of_week == DayOfWeek(request.day_of_week))
    ).first()

    if existing:
        existing.start_hour = request.start_hour
        existing.end_hour = request.end_hour
        existing.is_active = request.is_active
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return AvailabilityResponse(id=existing.id, day_of_week=existing.day_of_week.value,
                start_hour=existing.start_hour, end_hour=existing.end_hour, is_active=existing.is_active)

    avail = Availability(
        professional_user_id=current_user.id,
        day_of_week=DayOfWeek(request.day_of_week),
        start_hour=request.start_hour, end_hour=request.end_hour, is_active=request.is_active,
    )
    session.add(avail)
    session.commit()
    session.refresh(avail)
    return AvailabilityResponse(id=avail.id, day_of_week=avail.day_of_week.value,
            start_hour=avail.start_hour, end_hour=avail.end_hour, is_active=avail.is_active)


@router.delete("/availability/{avail_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_availability(
    avail_id: int,
    current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse)),
    session: Session = Depends(get_session),
):
    avail = session.get(Availability, avail_id)
    if not avail or avail.professional_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="No encontrado")
    session.delete(avail)
    session.commit()


@router.get("/availability/{professional_user_id}", response_model=List[AvailabilityResponse])
def get_professional_availability(
    professional_user_id: int,
    session: Session = Depends(get_session),
):
    avails = session.exec(
        select(Availability)
        .where(Availability.professional_user_id == professional_user_id)
        .where(Availability.is_active == True)
    ).all()
    return [AvailabilityResponse(id=a.id, day_of_week=a.day_of_week.value,
            start_hour=a.start_hour, end_hour=a.end_hour, is_active=a.is_active) for a in avails]


# ============================================================
# RESEÑAS: Familiar → Profesional
# ============================================================

@router.post("/reviews", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
def create_review(
    request: ReviewCreate,
    current_user: User = Depends(require_role(UserRole.family)),
    session: Session = Depends(get_session),
):
    """Familiar deja una reseña a un profesional. Solo tras booking completado."""
    if request.rating < 1 or request.rating > 5:
        raise HTTPException(status_code=400, detail="Rating debe ser entre 1 y 5")

    # Validar que el booking existe, está completado y pertenece a este familiar
    booking = session.get(Booking, request.booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if booking.family_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")
    if booking.status != BookingStatus.completed:
        raise HTTPException(status_code=400, detail="Solo puedes calificar servicios completados")
    if booking.professional_user_id != request.professional_user_id:
        raise HTTPException(status_code=400, detail="El profesional no coincide con la solicitud")

    # Verificar que no haya calificado ya este booking
    existing = session.exec(
        select(Review)
        .where(Review.family_user_id == current_user.id)
        .where(Review.booking_id == request.booking_id)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya calificaste este servicio")

    review = Review(
        family_user_id=current_user.id,
        professional_user_id=request.professional_user_id,
        booking_id=request.booking_id,
        rating=request.rating,
        comment=request.comment,
    )
    session.add(review)
    session.commit()
    session.refresh(review)

    # Recalcular rating del profesional
    _recalc_professional_rating(request.professional_user_id, session)

    return ReviewResponse(
        id=review.id, family_user_id=review.family_user_id,
        professional_user_id=review.professional_user_id,
        booking_id=review.booking_id,
        rating=review.rating, comment=review.comment,
        family_name=user_full_name(current_user),
        created_at=review.created_at.isoformat() if review.created_at else None,
    )


@router.get("/reviews/{professional_user_id}", response_model=List[ReviewResponse])
def get_professional_reviews(
    professional_user_id: int,
    session: Session = Depends(get_session),
):
    """Ve las reseñas de un profesional (público)."""
    reviews = session.exec(
        select(Review)
        .where(Review.professional_user_id == professional_user_id)
        .order_by(Review.created_at.desc())
    ).all()

    results = []
    for r in reviews:
        family = session.get(User, r.family_user_id)
        results.append(ReviewResponse(
            id=r.id, family_user_id=r.family_user_id,
            professional_user_id=r.professional_user_id,
            booking_id=r.booking_id,
            rating=r.rating, comment=r.comment,
            family_name=user_full_name(family) if family else None,
            created_at=r.created_at.isoformat() if r.created_at else None,
        ))
    return results


# ============================================================
# RESEÑAS: Profesional → Familiar
# ============================================================

@router.post("/family-reviews", response_model=FamilyReviewResponse, status_code=status.HTTP_201_CREATED)
def create_family_review(
    request: FamilyReviewCreate,
    current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse)),
    session: Session = Depends(get_session),
):
    """Profesional deja una reseña sobre una familia. Solo tras booking completado."""
    if request.rating < 1 or request.rating > 5:
        raise HTTPException(status_code=400, detail="Rating debe ser entre 1 y 5")

    # Validar que el booking existe, está completado y corresponde a este profesional
    booking = session.get(Booking, request.booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if booking.professional_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")
    if booking.status != BookingStatus.completed:
        raise HTTPException(status_code=400, detail="Solo puedes calificar servicios completados")
    if booking.family_user_id != request.family_user_id:
        raise HTTPException(status_code=400, detail="El familiar no coincide con la solicitud")

    # Verificar que no haya calificado ya este booking
    existing = session.exec(
        select(FamilyReview)
        .where(FamilyReview.professional_user_id == current_user.id)
        .where(FamilyReview.booking_id == request.booking_id)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya calificaste a esta familia en este servicio")

    fr = FamilyReview(
        professional_user_id=current_user.id,
        family_user_id=request.family_user_id,
        booking_id=request.booking_id,
        rating=request.rating,
        comment=request.comment,
    )
    session.add(fr)
    session.commit()
    session.refresh(fr)

    return FamilyReviewResponse(
        id=fr.id,
        professional_user_id=fr.professional_user_id,
        family_user_id=fr.family_user_id,
        booking_id=fr.booking_id,
        rating=fr.rating, comment=fr.comment,
        professional_name=current_user.full_name,
        created_at=fr.created_at.isoformat() if fr.created_at else None,
    )


@router.get("/family-reviews/{family_user_id}", response_model=List[FamilyReviewResponse])
def get_family_reviews(
    family_user_id: int,
    session: Session = Depends(get_session),
):
    """Ve las reseñas recibidas por un familiar (público)."""
    reviews = session.exec(
        select(FamilyReview)
        .where(FamilyReview.family_user_id == family_user_id)
        .order_by(FamilyReview.created_at.desc())
    ).all()

    results = []
    for r in reviews:
        prof = session.get(User, r.professional_user_id)
        results.append(FamilyReviewResponse(
            id=r.id,
            professional_user_id=r.professional_user_id,
            family_user_id=r.family_user_id,
            booking_id=r.booking_id,
            rating=r.rating, comment=r.comment,
            professional_name=prof.full_name if prof else None,
            created_at=r.created_at.isoformat() if r.created_at else None,
        ))
    return results


# ============================================================
# Asignaciones del profesional (para módulo de medicamentos)
# ============================================================

class AssignmentRecord(BaseModel):
    booking_id: int
    clinical_record_id: Optional[int]
    patient_name: Optional[str]
    patient_age: Optional[int]
    status: str
    date: str


@router.get("/my-assignments", response_model=List[AssignmentRecord])
def list_my_assignments(
    current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse)),
    session: Session = Depends(get_session),
):
    """Devuelve los servicios aprobados vigentes del profesional con la ficha del paciente."""
    bookings = session.exec(
        select(Booking)
        .where(Booking.professional_user_id == current_user.id)
        .where(Booking.status == BookingStatus.approved)
        .where(Booking.clinical_record_id.isnot(None))
        .order_by(Booking.date.desc())
    ).all()

    seen: set[int] = set()
    results = []
    for b in bookings:
        if b.clinical_record_id in seen:
            continue
        seen.add(b.clinical_record_id)
        record = session.get(ClinicalRecord, b.clinical_record_id)
        results.append(AssignmentRecord(
            booking_id=b.id,
            clinical_record_id=b.clinical_record_id,
            patient_name=record.patient_name if record else None,
            patient_age=record.patient_age if record else None,
            status=b.status.value,
            date=b.date,
        ))
    return results
