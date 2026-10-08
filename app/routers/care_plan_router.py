"""Plan asistencial documental y asistente preventivo para servicios aprobados."""
from datetime import datetime
from typing import List, Optional
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.auth import get_current_user, require_role
from app.database import get_session
from app.models import Booking, BookingStatus, ServiceCarePlan, User, UserRole
from app.routers.notifications_router import create_notification


router = APIRouter(prefix="/api/service-care-plans", tags=["Plan asistencial documental"])

ALERT_PATTERN = re.compile(
    r"\b(dolor de pecho|dolor en el pecho|dificultad para respirar|no respira|"
    r"desmayo|inconsciente|convulsi|acv|derrame|par[aá]lisis|sangrado abundante|"
    r"hemorragia|labios morados|confusi[oó]n repentina|intento de suicidio|ca[ií]da fuerte)\b",
    re.IGNORECASE,
)


class MedicationScheduleItem(BaseModel):
    medication: str = Field(min_length=1, max_length=200)
    dosage: str = Field(min_length=1, max_length=200)
    time: str = Field(min_length=1, max_length=50)
    instructions: Optional[str] = Field(default=None, max_length=500)


class CarePlanUpsert(BaseModel):
    medication_schedule: List[MedicationScheduleItem] = Field(default_factory=list, max_length=30)
    emergency_protocol: Optional[str] = Field(default=None, max_length=3000)
    treating_physician_contact: Optional[str] = Field(default=None, max_length=500)


class CarePlanResponse(CarePlanUpsert):
    booking_id: int
    professional_user_id: int
    updated_at: Optional[datetime] = None


class AssistantRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)


class AssistantResponse(BaseModel):
    response: str
    emergency_detected: bool
    escalation_created: bool


def _active_booking_for_participant(booking_id: int, current_user: User, session: Session) -> Booking:
    booking = session.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    if current_user.id not in (booking.family_user_id, booking.professional_user_id):
        raise HTTPException(status_code=403, detail="No autorizado para consultar este plan")
    if booking.status != BookingStatus.approved:
        raise HTTPException(status_code=403, detail="El plan solo está disponible mientras el servicio esté aprobado y activo")
    return booking


def _serialize(plan: ServiceCarePlan) -> CarePlanResponse:
    return CarePlanResponse(
        booking_id=plan.booking_id,
        professional_user_id=plan.professional_user_id,
        medication_schedule=plan.medication_schedule or [],
        emergency_protocol=plan.emergency_protocol,
        treating_physician_contact=plan.treating_physician_contact,
        updated_at=plan.updated_at,
    )


@router.get("/{booking_id}", response_model=Optional[CarePlanResponse])
def get_care_plan(booking_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    _active_booking_for_participant(booking_id, current_user, session)
    plan = session.exec(select(ServiceCarePlan).where(ServiceCarePlan.booking_id == booking_id)).first()
    return _serialize(plan) if plan else None


@router.put("/{booking_id}", response_model=CarePlanResponse)
def upsert_care_plan(
    booking_id: int,
    request: CarePlanUpsert,
    current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse)),
    session: Session = Depends(get_session),
):
    booking = _active_booking_for_participant(booking_id, current_user, session)
    if booking.professional_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Solo el profesional asignado puede actualizar este plan")
    plan = session.exec(select(ServiceCarePlan).where(ServiceCarePlan.booking_id == booking_id)).first()
    if not plan:
        plan = ServiceCarePlan(booking_id=booking_id, professional_user_id=current_user.id)
    plan.medication_schedule = [item.model_dump() for item in request.medication_schedule]
    plan.emergency_protocol = request.emergency_protocol.strip() if request.emergency_protocol else None
    plan.treating_physician_contact = request.treating_physician_contact.strip() if request.treating_physician_contact else None
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return _serialize(plan)


@router.post("/{booking_id}/assistant", response_model=AssistantResponse)
def ask_documentary_assistant(
    booking_id: int,
    request: AssistantRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    booking = _active_booking_for_participant(booking_id, current_user, session)
    plan = session.exec(select(ServiceCarePlan).where(ServiceCarePlan.booking_id == booking_id)).first()
    message = request.message.strip()
    if ALERT_PATTERN.search(message):
        destination = plan.treating_physician_contact if plan and plan.treating_physician_contact else "el profesional tratante asignado"
        try:
            create_notification(session, booking.professional_user_id, "emergency", "Alerta preventiva del asistente", f"Se reportó una posible alerta en el servicio del {booking.date}: {message[:350]}", booking.id)
            if current_user.id != booking.family_user_id:
                create_notification(session, booking.family_user_id, "emergency", "Alerta preventiva del asistente", "El asistente detectó una posible alerta y notificó al profesional asignado.", booking.id)
            session.commit()
            escalation_created = True
        except Exception:
            session.rollback()
            escalation_created = False
        return AssistantResponse(
            response=("⚠️ Posible alerta de emergencia. No esperes una respuesta por este chat: llama ahora al número local de emergencias (en Colombia, 123) o solicita atención de urgencias. "
                      f"Contacta también a {destination}. El profesional asignado fue notificado preventivamente. "
                      "Este asistente no sustituye la valoración médica."),
            emergency_detected=True,
            escalation_created=escalation_created,
        )
    if not plan:
        return AssistantResponse(response="Aún no hay pautas documentales registradas por el profesional para este servicio. Contacta al profesional asignado para que las ingrese o confirme.", emergency_detected=False, escalation_created=False)
    schedule = plan.medication_schedule or []
    lower_message = message.lower()

    # Palabras clave para detectar intención sobre medicamentos
    MEDICATION_KEYWORDS = (
        "medic", "medicamento", "pastilla", "pastillas", "píldo", "jarabe",
        "horario", "hora", "cuándo", "cuando", "dosis", "tomar", "administr",
        "tratamiento", "farmaco", "fármaco", "suministr", "dar", "tome",
        "qué hay", "que hay", "qué tiene", "que tiene", "lista", "pautas",
        "plan", "todo", "resumen", "información", "informacion",
    )
    # Palabras clave para detectar intención sobre emergencias / contactos
    EMERGENCY_KEYWORDS = (
        "emerg", "urgencia", "urgente", "protocolo", "contacto", "médico",
        "medico", "doctor", "llamar", "llamar a", "teléfono", "telefono",
        "número", "numero", "quién", "quien", "escalamiento", "escalar",
    )

    asked_medication = any(word in lower_message for word in MEDICATION_KEYWORDS)
    asked_emergency = any(word in lower_message for word in EMERGENCY_KEYWORDS)

    # Si no detectó intención clara, mostrar todo el plan disponible
    if not asked_medication and not asked_emergency:
        asked_medication = True
        asked_emergency = True

    parts = []

    if asked_medication:
        if schedule:
            entries = "\n".join(
                f"• {item.get('medication')}: {item.get('dosage')} a las {item.get('time')}"
                + (f" ({item.get('instructions')})" if item.get('instructions') else "")
                for item in schedule
            )
            parts.append(f"Medicamentos registrados en el plan:\n{entries}")
        else:
            parts.append("No hay horarios de medicación registrados en este plan.")

    if asked_emergency:
        if plan.emergency_protocol:
            parts.append(f"Protocolo de emergencia:\n{plan.emergency_protocol}")
        if plan.treating_physician_contact:
            parts.append(f"Contacto del médico tratante: {plan.treating_physician_contact}")
        if not plan.emergency_protocol and not plan.treating_physician_contact:
            parts.append("No hay protocolo de emergencia ni contacto del médico registrado.")

    if not parts:
        parts.append("No encontré información registrada para responder esa consulta.")

    parts.append("⚠️ Este asistente no diagnostica, prescribe ni reemplaza la valoración del profesional tratante.")
    return AssistantResponse(response="\n\n".join(parts), emergency_detected=False, escalation_created=False)