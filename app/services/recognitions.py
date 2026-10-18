"""Reglas automáticas y persistentes de reconocimientos profesionales."""
from dataclasses import dataclass

from sqlmodel import Session, select

from app.models import (
    Booking, BookingStatus, ProfessionalRecognition, RecognitionType, Review,
)


RECOGNITION_CATALOG = {
    RecognitionType.first_service: {
        "code": RecognitionType.first_service.value,
        "name": "Primer servicio",
        "description": "Completaste tu primer servicio.",
        "icon": "workspace_premium",
    },
    RecognitionType.excellent_care: {
        "code": RecognitionType.excellent_care.value,
        "name": "Excelente atención",
        "description": "Recibiste 5 valoraciones verificadas de 4 o 5 estrellas.",
        "icon": "stars",
    },
    RecognitionType.featured_professional: {
        "code": RecognitionType.featured_professional.value,
        "name": "Profesional destacado",
        "description": "Completaste 10 servicios y mantienes una calificación promedio de 4,5 o más.",
        "icon": "military_tech",
    },
}


@dataclass(frozen=True)
class RecognitionMetrics:
    completed_services: int
    verified_excellent_reviews: int
    rating_average: float | None
    rating_count: int


def eligible_recognition_types(metrics: RecognitionMetrics) -> set[RecognitionType]:
    """Determina las insignias sin confiar en acumulados editables del perfil."""
    eligible = set()
    if metrics.completed_services >= 1:
        eligible.add(RecognitionType.first_service)
    if metrics.verified_excellent_reviews >= 5:
        eligible.add(RecognitionType.excellent_care)
    if metrics.completed_services >= 10 and metrics.rating_average is not None and metrics.rating_average >= 4.5:
        eligible.add(RecognitionType.featured_professional)
    return eligible


def recognition_metrics(professional_user_id: int, session: Session) -> RecognitionMetrics:
    completed_services = session.exec(select(Booking).where(
        Booking.professional_user_id == professional_user_id,
        Booking.status == BookingStatus.completed,
    )).all()
    reviews = session.exec(select(Review).where(
        Review.professional_user_id == professional_user_id,
    )).all()
    rating_count = len(reviews)
    return RecognitionMetrics(
        completed_services=len(completed_services),
        # Las reseñas ya están verificadas por el flujo de creación: una por
        # servicio completado perteneciente a la familia contratante.
        verified_excellent_reviews=sum(1 for review in reviews if review.rating >= 4),
        rating_average=round(sum(review.rating for review in reviews) / rating_count, 2) if rating_count else None,
        rating_count=rating_count,
    )


def sync_recognitions(professional_user_id: int, session: Session) -> RecognitionMetrics:
    """Persiste únicamente las insignias cuyas reglas objetivas se han cumplido."""
    metrics = recognition_metrics(professional_user_id, session)
    existing = {
        recognition.recognition_type
        for recognition in session.exec(select(ProfessionalRecognition).where(
            ProfessionalRecognition.professional_user_id == professional_user_id,
        )).all()
    }
    for recognition_type in eligible_recognition_types(metrics) - existing:
        session.add(ProfessionalRecognition(
            professional_user_id=professional_user_id,
            recognition_type=recognition_type,
        ))
    return metrics


def recognition_summary(professional_user_id: int, session: Session) -> dict:
    """Sincroniza y serializa insignias y progreso para el perfil o Mi Cuenta."""
    metrics = sync_recognitions(professional_user_id, session)
    awarded = {
        recognition.recognition_type
        for recognition in session.exec(select(ProfessionalRecognition).where(
            ProfessionalRecognition.professional_user_id == professional_user_id,
        )).all()
    }
    items = []
    for recognition_type, metadata in RECOGNITION_CATALOG.items():
        if recognition_type == RecognitionType.first_service:
            progress, target = metrics.completed_services, 1
            requirement = "Completa 1 servicio"
        elif recognition_type == RecognitionType.excellent_care:
            progress, target = metrics.verified_excellent_reviews, 5
            requirement = "Obtén 5 valoraciones verificadas de 4 o 5 estrellas"
        else:
            progress, target = metrics.completed_services, 10
            requirement = "Completa 10 servicios y alcanza un promedio de 4,5 estrellas"
        items.append({
            **metadata,
            "awarded": recognition_type in awarded,
            "progress": min(progress, target),
            "target": target,
            "requirement": requirement,
        })
    return {
        "recognitions": items,
        "metrics": {
            "completed_services": metrics.completed_services,
            "verified_excellent_reviews": metrics.verified_excellent_reviews,
            "rating_average": metrics.rating_average,
            "rating_count": metrics.rating_count,
        },
    }