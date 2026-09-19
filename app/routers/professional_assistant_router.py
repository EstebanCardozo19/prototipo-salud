"""Asistente documental seguro para enfermeros y cuidadores asignados."""
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.auth import require_role
from app.database import get_session
from app.mcp_server import obtener_contexto_paciente_asignado
from app.services.service_lifecycle import is_service_active
from app.models import (
    Booking, BookingStatus, ClinicalRecord, ClinicalRecordDocument, ProfessionalAssistantAuditLog,
    ServiceCarePlan, User, UserRole,
)
from app.routers.notifications_router import create_notification, dispatch_emergency_webhook

router = APIRouter(prefix="/api/professional-assistant", tags=["Asistente profesional"])

EMERGENCY_PATTERN = re.compile(
    r"\b(dolor(?:\s+en)?\s+el\s+pecho|dificultad\s+para\s+respirar|no\s+respira|"
    r"desmayo|inconsciente|convulsi\w*|acv|derrame|par[aá]lisis|sangrado\s+abundante|"
    r"hemorragia|labios\s+morados|confusi[oó]n\s+repentina|intento\s+de\s+suicidio|ca[ií]da\s+fuerte)\b",
    re.IGNORECASE,
)


class AssistantQuestion(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    history: list[dict] = Field(default_factory=list, max_length=12)


class AssistantResponse(BaseModel):
    response: str
    context: dict
    emergency_detected: bool = False
    escalation_created: bool = False
    limitations: list[str]


def _authorized_booking_context(booking_id: int, current_user: User, session: Session):
    """Valida asignación, aprobación e integridad ficha/familia."""
    booking = session.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    if booking.professional_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Solo el profesional asignado puede acceder al asistente")
    if booking.status != BookingStatus.approved:
        raise HTTPException(status_code=403, detail="El asistente solo está disponible durante un servicio aprobado")
    try:
        active_service = is_service_active(booking)
    except ValueError:
        raise HTTPException(status_code=409, detail="El servicio tiene una fecha u horario inválido")
    if not active_service:
        raise HTTPException(
            status_code=403,
            detail="El asistente solo está disponible durante el horario activo del servicio",
        )
    if not booking.clinical_record_id:
        raise HTTPException(status_code=409, detail="Este servicio no tiene una ficha clínica vinculada")
    record = session.get(ClinicalRecord, booking.clinical_record_id)
    if not record or record.family_user_id != booking.family_user_id:
        raise HTTPException(status_code=409, detail="La ficha clínica vinculada al servicio no es válida")
    plan = session.exec(select(ServiceCarePlan).where(ServiceCarePlan.booking_id == booking.id)).first()
    return booking, record, plan


def _audit(session: Session, current_user: User, booking: Booking, action: str) -> None:
    session.add(ProfessionalAssistantAuditLog(
        professional_user_id=current_user.id,
        booking_id=booking.id,
        clinical_record_id=booking.clinical_record_id,
        action=action,
    ))
    session.commit()


def _add_authorized_document_context(context: dict, record: ClinicalRecord, session: Session) -> bool:
    """Añade texto de adjuntos únicamente tras consentimiento familiar explícito."""
    if not record.allow_professional_document_access:
        return False
    documents = session.exec(
        select(ClinicalRecordDocument).where(
            ClinicalRecordDocument.clinical_record_id == record.id,
        )
    ).all()
    excerpts = [
        {
            "filename": document.original_filename,
            "content_type": document.content_type,
            "text": document.extracted_text,
        }
        for document in documents
        if document.extracted_text
    ]
    if excerpts:
        context["authorized_clinical_documents"] = excerpts
    return True


def _list_text(values: list[str], empty: str) -> str:
    return ", ".join(values) if values else empty


def _documentary_answer(message: str, context: dict, include_clinical_details: bool) -> str:
    """Responde solo con información registrada; no infiere ni prescribe."""
    normalized = message.lower()
    patient = context["patient"]
    plan = context["care_plan"]
    parts = ["Soy un asistente documental: resumo únicamente información registrada y no reemplazo la valoración clínica."]

    if any(word in normalized for word in ("resumen", "información", "informacion", "paciente", "visita")):
        summary = (
            f"{patient['name']}, {patient['age']} años. Movilidad: {patient['mobility_level'] or 'no registrada'}. "
            f"Necesidades especiales: {patient['special_needs'] or 'no registradas'}."
        )
        if include_clinical_details:
            summary += f" Diagnósticos registrados: {_list_text(patient.get('diagnoses', []), 'ninguno')}."
        parts.append(summary)
    if any(word in normalized for word in ("alerg", "contraindic")):
        parts.append(f"Alergias registradas: {_list_text(patient['allergies'], 'ninguna registrada')}.")
    if any(word in normalized for word in ("medic", "horario", "dosis", "tomar")):
        schedule = plan["medication_schedule"]
        if schedule:
            items = "; ".join(
                f"{item.get('medication', 'Medicamento')}: {item.get('dosage', 'dosis no indicada')} a las {item.get('time', 'hora no indicada')}"
                for item in schedule
            )
            parts.append(f"Pautas registradas en el plan: {items}. No modifiques dosis, horarios ni tratamientos; confirma cualquier duda con el tratante.")
        else:
            parts.append("No hay un horario de medicación registrado en el plan. No infieras ni administres cambios; confirma con la familia o el profesional tratante.")
    if any(word in normalized for word in ("protocolo", "emerg", "urgencia")):
        parts.append(f"Protocolo registrado: {plan['emergency_protocol'] or 'no hay un protocolo registrado para este servicio'}.")
    if len(parts) == 1:
        parts.append("Puedo resumir la información autorizada, recordar alergias, medicamentos y horarios documentados, movilidad, necesidades especiales o el protocolo registrado.")
    return " ".join(parts)


def _conversational_documentary_answer(message: str, context: dict, history: list[dict], include_clinical_details: bool) -> str:
    """Usa SAI con contexto mínimo autorizado y conserva respaldo seguro local."""
    try:
        from app.services.ai_agent import conversar_con_contexto_documental

        response = conversar_con_contexto_documental(message, context, history)
        if response:
            return response
    except Exception:
        # No se expone el error del proveedor ni se amplía el contexto autorizado.
        pass
    return _documentary_answer(message, context, include_clinical_details)


def _emergency_response(session: Session, booking: Booking) -> tuple[str, bool]:
    try:
        create_notification(session, booking.family_user_id, "emergency", "Posible alerta durante el servicio", "El asistente detectó una posible alerta reportada por el profesional asignado.", booking.id)
        session.commit()
        notified = True
    except Exception:
        session.rollback()
        notified = False
    webhook_delivered = dispatch_emergency_webhook(booking.id, booking.family_user_id)
    return (
        "⚠️ Posible emergencia. No esperes una respuesta del asistente: activa de inmediato el protocolo del servicio y llama al 123 en Colombia o solicita atención de urgencias. Realiza la valoración profesional correspondiente y comunica a la familia según el protocolo. La alerta interna fue " + ("registrada" if notified else "no pudo registrarse") + "; confirma la comunicación por un canal directo. Este asistente no diagnostica ni sustituye la atención de emergencia.",
        notified or webhook_delivered,
    )


@router.get("/{booking_id}/context", response_model=dict)
def get_context(
    booking_id: int,
    current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse)),
    session: Session = Depends(get_session),
):
    booking, record, plan = _authorized_booking_context(booking_id, current_user, session)
    context = obtener_contexto_paciente_asignado(
        booking, record, plan, include_clinical_details=current_user.role == UserRole.nurse,
    )
    # La lectura manual muestra únicamente texto extraído, nunca el archivo binario.
    # Este endpoint ya validó profesional asignado, aprobación y horario activo.
    document_access_granted = _add_authorized_document_context(context, record, session)
    context["document_access_authorized"] = document_access_granted
    _audit(session, current_user, booking, "view_context_documents" if document_access_granted else "view_context")
    return context


@router.post("/{booking_id}/chat", response_model=AssistantResponse)
def ask_assistant(
    booking_id: int,
    request: AssistantQuestion,
    current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse)),
    session: Session = Depends(get_session),
):
    booking, record, plan = _authorized_booking_context(booking_id, current_user, session)
    include_clinical_details = current_user.role == UserRole.nurse
    context = obtener_contexto_paciente_asignado(booking, record, plan, include_clinical_details)
    document_access_granted = _add_authorized_document_context(context, record, session)
    message = request.message.strip()
    _audit(session, current_user, booking, "ask_assistant_documents" if document_access_granted else "ask_assistant")

    if EMERGENCY_PATTERN.search(message):
        response, escalated = _emergency_response(session, booking)
        return AssistantResponse(
            response=response, context=context, emergency_detected=True, escalation_created=escalated,
            limitations=["No usar el chat para emergencias", "No diagnostica ni prescribe"],
        )
    return AssistantResponse(
        response=_conversational_documentary_answer(message, context, request.history, include_clinical_details), context=context,
        limitations=[
            "Solo usa información registrada en la ficha y el plan del servicio.",
            *( ["La familia autorizó usar el texto extraído de los documentos adjuntos."] if document_access_granted else ["La familia no autorizó usar documentos adjuntos en el asistente."] ),
            "No diagnostica, prescribe, ajusta dosis ni sustituye una valoración profesional.",
            "No muestra dirección exacta, contactos de emergencia ni datos de aseguramiento.",
            *( ["Como cuidador, no muestra diagnósticos, grupo sanguíneo ni listado clínico general de medicamentos."] if not include_clinical_details else [] ),
        ],
    )