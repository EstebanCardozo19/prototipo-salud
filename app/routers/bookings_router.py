"""
Router de solicitudes de contratación, disponibilidad y reseñas.
Sistema de rating bidireccional: familiar → profesional y profesional → familiar.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from datetime import date as calendar_date, datetime, time, timedelta
from zoneinfo import ZoneInfo
import re

from pydantic import BaseModel, field_validator, model_validator
from sqlmodel import Session, select
from typing import Optional, List

from app.database import get_session
from app.models import (
    User, UserRole, Booking, BookingStatus,
    Availability, DayOfWeek, Review, FamilyReview,
    CaregiverProfile, NurseProfile,
    ClinicalRecord, ProfessionalVerification, ProfileStatus,
    CancelledServiceComment, CancelledServiceCommentReport,
)
from app.auth import get_current_user, require_role
from app.routers.notifications_router import create_notification
from app.security.encryption import user_full_name
from app.services.ratings import calculate_rating_summary
from app.services.recognitions import recognition_summary, sync_recognitions

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


def validate_availability_schedule(start_hour: int, end_hour: int) -> None:
    """Valida una franja semanal; un fin menor representa turno nocturno."""
    if not 0 <= start_hour <= 23 or not 0 <= end_hour <= 23:
        raise ValueError("Las horas de inicio y fin deben estar entre 00:00 y 23:00")
    if start_hour == end_hour:
        raise ValueError("La hora de finalización debe ser distinta de la hora de inicio")


def _interval_for_date(service_date: calendar_date, start_hour: int, end_hour: int):
    start = datetime.combine(service_date, time(hour=start_hour), BOOKING_TIMEZONE)
    end_date = service_date + timedelta(days=1) if end_hour < start_hour else service_date
    end = datetime.combine(end_date, time(hour=end_hour), BOOKING_TIMEZONE)
    return start, end


def schedules_overlap(
    first_date: str, first_start_hour: int, first_end_hour: int,
    second_date: str, second_start_hour: int, second_end_hour: int,
) -> bool:
    """Indica si dos servicios, incluidos los nocturnos, se solapan."""
    first_start, first_end = _interval_for_date(
        calendar_date.fromisoformat(first_date), first_start_hour, first_end_hour,
    )
    second_start, second_end = _interval_for_date(
        calendar_date.fromisoformat(second_date), second_start_hour, second_end_hour,
    )
    return first_start < second_end and second_start < first_end


def is_schedule_covered_by_availability(
    service_date: str, start_hour: int, end_hour: int, availabilities: List[Availability],
) -> bool:
    """Comprueba que una solicitud completa cabe en una franja semanal activa.

    También considera el bloque nocturno declarado el día anterior: por ejemplo,
    lunes 22:00–06:00 cubre una solicitud del martes de 01:00 a 05:00.
    """
    requested_start, requested_end = _interval_for_date(
        calendar_date.fromisoformat(service_date), start_hour, end_hour,
    )
    for availability in availabilities:
        if not availability.is_active:
            continue
        for candidate_date in (
            requested_start.date() - timedelta(days=1),
            requested_start.date(),
        ):
            if availability.day_of_week.value != candidate_date.strftime("%A").lower():
                continue
            available_start, available_end = _interval_for_date(
                candidate_date, availability.start_hour, availability.end_hour,
            )
            if available_start <= requested_start and requested_end <= available_end:
                return True
    return False


def has_approved_booking_conflict(
    professional_user_id: int, service_date: str, start_hour: int, end_hour: int, session: Session,
    exclude_booking_id: Optional[int] = None,
) -> bool:
    """Comprueba conflictos contra servicios ya aprobados del profesional."""
    bookings = session.exec(
        select(Booking)
        .where(Booking.professional_user_id == professional_user_id)
        .where(Booking.status == BookingStatus.approved)
    ).all()
    return any(
        booking.id != exclude_booking_id and schedules_overlap(
            service_date, start_hour, end_hour,
            booking.date, booking.start_hour, booking.end_hour,
        )
        for booking in bookings
    )


def validate_professional_schedule(
    professional_user_id: int, service_date: str, start_hour: int, end_hour: int, session: Session,
    exclude_booking_id: Optional[int] = None,
) -> None:
    availabilities = session.exec(
        select(Availability).where(Availability.professional_user_id == professional_user_id)
    ).all()
    if not is_schedule_covered_by_availability(service_date, start_hour, end_hour, availabilities):
        raise HTTPException(
            status_code=409,
            detail="El horario solicitado no coincide con la disponibilidad publicada del profesional",
        )
    if has_approved_booking_conflict(
        professional_user_id, service_date, start_hour, end_hour, session, exclude_booking_id,
    ):
        raise HTTPException(
            status_code=409,
            detail="El profesional ya tiene un servicio aprobado que se cruza con este horario",
        )

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
    cancelled_comment_by_current_user: bool = False
    cancelled_comments: List["CancelledCommentResponse"] = []
    cancellation_reason: Optional[str] = None
    cancelled_by_user_id: Optional[int] = None
    cancelled_by_name: Optional[str] = None
    cancelled_at: Optional[datetime] = None
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
    family_recent_cancelled_comments: List["CancelledCommentResponse"] = []


class BookingDecision(BaseModel):
    status: str             # "approved" o "rejected"
    rejection_reason: Optional[str] = None


class BookingCancellation(BaseModel):
    reason: str

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        reason = value.strip()
        if not reason:
            raise ValueError("El motivo de cancelación es obligatorio")
        if len(reason) > 500:
            raise ValueError("El motivo de cancelación no puede superar 500 caracteres")
        return reason


class CancelledCommentCreate(BaseModel):
    comment: str


class CancelledCommentReportCreate(BaseModel):
    reason: str


class CancelledCommentResponse(BaseModel):
    id: int
    booking_id: int
    author_role: str
    author_name: Optional[str] = None
    comment: str
    cancelled_by_role: Optional[str] = None
    created_at: Optional[datetime] = None


class ProfessionalTrustResponse(BaseModel):
    professional_user_id: int
    verification_status: str
    experience_years: int
    rating_avg: Optional[float] = None
    rating_count: int = 0
    completed_services: int = 0
    reviews: List["ReviewResponse"] = []
    cancelled_comments: List[CancelledCommentResponse] = []
    recognitions: List[dict] = []


_SENSITIVE_COMMENT_PATTERNS = (
    (r"\b(?:\+?57\s*)?3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b", "teléfonos"),
    (r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b", "correos electrónicos"),
    (r"\b(?:calle|carrera|cra\.?|cl\.?|avenida|av\.?|diagonal|transversal)\s*\d+", "direcciones"),
    (r"\b(?:diagnóstico|diagnostico|historia clínica|historia clinica|medicamento|eps|enfermedad|paciente)\b", "información clínica"),
)
_OFFENSIVE_COMMENT_PATTERN = re.compile(r"\b(?:idiota|imb[eé]cil|est[úu]pido|est[uú]pida|malparid[oa]|hij[oa]\s+de\s+puta)\b", re.IGNORECASE)


def validate_cancelled_comment_content(value: str) -> str:
    """Impide publicar datos sensibles o insultos en comentarios públicos."""
    comment = (value or "").strip()
    if len(comment) < 3:
        raise ValueError("El comentario debe tener al menos 3 caracteres")
    if len(comment) > 500:
        raise ValueError("El comentario no puede superar 500 caracteres")
    if _OFFENSIVE_COMMENT_PATTERN.search(comment):
        raise ValueError("El comentario contiene lenguaje ofensivo")
    for pattern, label in _SENSITIVE_COMMENT_PATTERNS:
        if re.search(pattern, comment, flags=re.IGNORECASE):
            raise ValueError(f"No publiques {label} ni datos personales o clínicos")
    return comment


def _cancelled_comment_response(comment: CancelledServiceComment, booking: Booking, session: Session) -> CancelledCommentResponse:
    author = session.get(User, comment.author_user_id)
    cancelled_by = session.get(User, booking.cancelled_by_user_id) if booking.cancelled_by_user_id else None
    return CancelledCommentResponse(
        id=comment.id,
        booking_id=comment.booking_id,
        author_role=author.role.value if author else "unknown",
        # El rol aporta el contexto requerido sin publicar la identidad de la
        # familia en la consulta pública del perfil profesional.
        author_name=None,
        comment=comment.comment,
        # Solo se publica el rol que realizó la acción, nunca el motivo privado.
        cancelled_by_role=cancelled_by.role.value if cancelled_by else None,
        created_at=comment.created_at,
    )


def _assert_cancelled_booking_participant(booking: Booking, current_user: User) -> None:
    if booking.status != BookingStatus.cancelled:
        raise HTTPException(status_code=400, detail="Los comentarios de experiencia solo están disponibles para servicios cancelados")
    if current_user.id not in (booking.family_user_id, booking.professional_user_id):
        raise HTTPException(status_code=403, detail="Solo las partes involucradas pueden comentar este servicio")


def _cancellation_metadata(booking: Booking, session: Session) -> dict:
    """Serializa la auditoría de cancelación sin exponer datos de terceros."""
    cancelled_by = session.get(User, booking.cancelled_by_user_id) if booking.cancelled_by_user_id else None
    return {
        "cancellation_reason": booking.cancellation_reason,
        "cancelled_by_user_id": booking.cancelled_by_user_id,
        "cancelled_by_name": user_full_name(cancelled_by) if cancelled_by else None,
        "cancelled_at": booking.cancelled_at,
    }


def _cancelled_comment_exists_for_user(booking_id: int, user_id: int, session: Session) -> bool:
    return session.exec(
        select(CancelledServiceComment).where(
            CancelledServiceComment.booking_id == booking_id,
            CancelledServiceComment.author_user_id == user_id,
        )
    ).first() is not None


def _cancelled_comments_for_booking(booking: Booking, session: Session) -> List["CancelledCommentResponse"]:
    if booking.status != BookingStatus.cancelled:
        return []
    comments = session.exec(
        select(CancelledServiceComment)
        .where(CancelledServiceComment.booking_id == booking.id)
        .where(CancelledServiceComment.is_hidden == False)
        .order_by(CancelledServiceComment.created_at.asc())
    ).all()
    return [_cancelled_comment_response(item, booking, session) for item in comments]


class AvailabilityCreate(BaseModel):
    day_of_week: str
    start_hour: int
    end_hour: int
    is_active: bool = True

    @field_validator("day_of_week")
    @classmethod
    def validate_day_of_week(cls, value):
        try:
            return DayOfWeek(value).value
        except ValueError as error:
            raise ValueError("El día de la semana no es válido") from error

    @model_validator(mode="after")
    def validate_schedule(self):
        validate_availability_schedule(self.start_hour, self.end_hour)
        return self


class AvailabilityUpdate(AvailabilityCreate):
    pass


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
    cancelled_comments = session.exec(
        select(CancelledServiceComment)
        .join(Booking, Booking.id == CancelledServiceComment.booking_id)
        .where(Booking.family_user_id == family_user_id)
        .where(CancelledServiceComment.author_user_id == Booking.professional_user_id)
        .where(CancelledServiceComment.is_hidden == False)
        .order_by(CancelledServiceComment.created_at.desc())
    ).all()
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
        # Los comentarios del profesional sobre una cancelación pertenecen a
        # la reputación de la familia; nunca se suman al perfil del profesional.
        "family_recent_cancelled_comments": [
            _cancelled_comment_response(comment, session.get(Booking, comment.booking_id), session)
            for comment in cancelled_comments[:3]
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

    validate_professional_schedule(
        professional.id, request.date, request.start_hour, request.end_hour, session,
    )
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
            **_cancellation_metadata(b, session),
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
            cancelled_comment_by_current_user=_cancelled_comment_exists_for_user(b.id, current_user.id, session),
            cancelled_comments=_cancelled_comments_for_booking(b, session),
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
            **_cancellation_metadata(b, session),
            family_name=user_full_name(current_user),
            professional_name=professional.full_name if professional else None,
            cancelled_comment_by_current_user=_cancelled_comment_exists_for_user(b.id, current_user.id, session),
            cancelled_comments=_cancelled_comments_for_booking(b, session),
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
            **_cancellation_metadata(b, session),
            family_name=user_full_name(family) if family else None,
            family_photo_url=family.photo_url if family else None,
            professional_name=current_user.full_name,
            reviewed_by_professional=b.id in prof_reviewed_ids,
            cancelled_comment_by_current_user=_cancelled_comment_exists_for_user(b.id, current_user.id, session),
            cancelled_comments=_cancelled_comments_for_booking(b, session),
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

    if decision.status == "approved":
        validate_professional_schedule(
            current_user.id, booking.date, booking.start_hour, booking.end_hour,
            session, exclude_booking_id=booking.id,
        )

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
        **_cancellation_metadata(booking, session),
        family_name=user_full_name(family) if family else None,
        professional_name=current_user.full_name,
    )


@router.put("/{booking_id}/cancel", response_model=BookingResponse)
def cancel_booking(
    booking_id: int,
    cancellation: BookingCancellation,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Cancela una reserva aprobada desde cualquiera de sus dos participantes."""
    booking = session.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    if current_user.id not in (booking.family_user_id, booking.professional_user_id):
        raise HTTPException(status_code=403, detail="No autorizado para cancelar este servicio")
    if booking.status != BookingStatus.approved:
        raise HTTPException(status_code=400, detail="Solo se pueden cancelar servicios aprobados")

    booking.status = BookingStatus.cancelled
    booking.cancellation_reason = cancellation.reason
    booking.cancelled_by_user_id = current_user.id
    booking.cancelled_at = datetime.now(BOOKING_TIMEZONE)
    session.add(booking)

    recipient_id = booking.professional_user_id if current_user.id == booking.family_user_id else booking.family_user_id
    create_notification(
        session,
        recipient_id,
        "booking_cancelled",
        "Servicio cancelado",
        f"{user_full_name(current_user)} canceló el servicio del {booking.date}. Motivo: {cancellation.reason}",
        booking.id,
    )
    session.commit()
    session.refresh(booking)

    family = session.get(User, booking.family_user_id)
    professional = session.get(User, booking.professional_user_id)
    clinical_record = session.get(ClinicalRecord, booking.clinical_record_id) if booking.clinical_record_id else None
    return BookingResponse(
        id=booking.id, family_user_id=booking.family_user_id,
        clinical_record_id=booking.clinical_record_id,
        patient_name=clinical_record.patient_name if clinical_record else None,
        professional_user_id=booking.professional_user_id,
        professional_role=booking.professional_role,
        date=booking.date, start_hour=booking.start_hour, end_hour=booking.end_hour,
        notes=booking.notes, status=booking.status.value,
        location_sharing_preference=booking.location_sharing_preference,
        rejection_reason=booking.rejection_reason,
        family_name=user_full_name(family) if family else None,
        professional_name=user_full_name(professional) if professional else None,
        **_cancellation_metadata(booking, session),
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
    sync_recognitions(current_user.id, session)
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
            **_cancellation_metadata(b, session),
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


@router.put("/availability/{avail_id}", response_model=AvailabilityResponse)
def update_availability(
    avail_id: int,
    request: AvailabilityUpdate,
    current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse)),
    session: Session = Depends(get_session),
):
    avail = session.get(Availability, avail_id)
    if not avail or avail.professional_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="No encontrado")
    avail.day_of_week = DayOfWeek(request.day_of_week)
    avail.start_hour = request.start_hour
    avail.end_hour = request.end_hour
    avail.is_active = request.is_active
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
    sync_recognitions(request.professional_user_id, session)
    session.commit()

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
# HU-021: Confianza y trayectoria / comentarios de cancelaciones
# ============================================================

@router.get("/professionals/{professional_user_id}/trust", response_model=ProfessionalTrustResponse)
def get_professional_trust(professional_user_id: int, session: Session = Depends(get_session)):
    """Información pública y verificable de trayectoria, sin motivos privados."""
    professional = session.get(User, professional_user_id)
    if not professional or professional.role not in (UserRole.caregiver, UserRole.nurse) or not professional.is_active:
        raise HTTPException(status_code=404, detail="Profesional no encontrado")

    profile_model = CaregiverProfile if professional.role == UserRole.caregiver else NurseProfile
    profile = session.exec(select(profile_model).where(profile_model.user_id == professional.id)).first()
    if not profile or profile.status != ProfileStatus.approved:
        raise HTTPException(status_code=404, detail="Profesional no encontrado")

    verification = session.exec(
        select(ProfessionalVerification).where(ProfessionalVerification.user_id == professional.id)
    ).first()
    reviews = get_professional_reviews(professional.id, session)
    completed_count = len(session.exec(
        select(Booking).where(
            Booking.professional_user_id == professional.id,
            Booking.status == BookingStatus.completed,
        )
    ).all())
    cancelled_comments = session.exec(
        select(CancelledServiceComment)
        .join(Booking, Booking.id == CancelledServiceComment.booking_id)
        .where(Booking.professional_user_id == professional.id)
        # La reputación pública profesional solo incorpora experiencias de la
        # familia hacia el profesional. La contraparte se muestra en la
        # reputación de la familia, no se le atribuye al profesional.
        .where(CancelledServiceComment.author_user_id == Booking.family_user_id)
        .where(CancelledServiceComment.is_hidden == False)
        .order_by(CancelledServiceComment.created_at.desc())
    ).all()
    recognitions = recognition_summary(professional.id, session)["recognitions"]
    session.commit()
    return ProfessionalTrustResponse(
        professional_user_id=professional.id,
        verification_status=(verification.status.value if verification else profile.status.value),
        experience_years=profile.experience_years,
        rating_avg=profile.rating_avg,
        rating_count=profile.rating_count,
        completed_services=completed_count,
        reviews=reviews,
        cancelled_comments=[_cancelled_comment_response(item, session.get(Booking, item.booking_id), session) for item in cancelled_comments],
        recognitions=recognitions,
    )


@router.post("/{booking_id}/cancelled-comments", response_model=CancelledCommentResponse, status_code=status.HTTP_201_CREATED)
def create_cancelled_comment(
    booking_id: int,
    request: CancelledCommentCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    booking = session.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    _assert_cancelled_booking_participant(booking, current_user)
    try:
        comment_text = validate_cancelled_comment_content(request.comment)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    existing = session.exec(
        select(CancelledServiceComment).where(
            CancelledServiceComment.booking_id == booking.id,
            CancelledServiceComment.author_user_id == current_user.id,
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Ya registraste un comentario para este servicio cancelado")
    item = CancelledServiceComment(booking_id=booking.id, author_user_id=current_user.id, comment=comment_text)
    session.add(item)
    session.commit()
    session.refresh(item)
    return _cancelled_comment_response(item, booking, session)


@router.post("/cancelled-comments/{comment_id}/report", status_code=status.HTTP_201_CREATED)
def report_cancelled_comment(
    comment_id: int,
    request: CancelledCommentReportCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    comment = session.get(CancelledServiceComment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comentario no encontrado")
    booking = session.get(Booking, comment.booking_id)
    _assert_cancelled_booking_participant(booking, current_user)
    if comment.author_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes reportar tu propio comentario")
    reason = (request.reason or "").strip()
    if len(reason) < 3 or len(reason) > 300:
        raise HTTPException(status_code=400, detail="Indica un motivo de reporte entre 3 y 300 caracteres")
    existing = session.exec(
        select(CancelledServiceCommentReport).where(
            CancelledServiceCommentReport.comment_id == comment.id,
            CancelledServiceCommentReport.reporter_user_id == current_user.id,
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Ya reportaste este comentario")
    session.add(CancelledServiceCommentReport(comment_id=comment.id, reporter_user_id=current_user.id, reason=reason))
    session.commit()
    return {"detail": "Reporte recibido para revisión"}


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
