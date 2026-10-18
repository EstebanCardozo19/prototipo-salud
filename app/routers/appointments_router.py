"""Citas médicas familiares y solicitudes opcionales de acompañamiento."""
import calendar
from datetime import date, timedelta
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlmodel import Session, select

from app.auth import require_role
from app.database import get_session
from app.models import (
    AppointmentAccompanimentStatus, AppointmentStatus, Booking, BookingStatus,
    ClinicalRecord, ClinicalRecordDocument, MedicalAppointment, User, UserRole,
)
from app.routers.notifications_router import create_notification


router = APIRouter(prefix="/api/appointments", tags=["Citas médicas"])


class AppointmentCreate(BaseModel):
    clinical_record_id: int
    appointment_type: str
    date: str
    time: str
    location: Optional[str] = None
    treating_professional: Optional[str] = None
    notes: Optional[str] = None
    document_ids: List[int] = []
    pending_documents: List[str] = []
    recurrence_frequency: Optional[str] = None
    recurrence_until: Optional[str] = None
    accompaniment_professional_user_id: Optional[int] = None

    @field_validator("appointment_type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("El tipo o motivo de la cita es obligatorio")
        return value

    @field_validator("date", "recurrence_until")
    @classmethod
    def validate_date(cls, value: Optional[str]) -> Optional[str]:
        if value is not None:
            date.fromisoformat(value)
        return value

    @field_validator("time")
    @classmethod
    def validate_time(cls, value: str) -> str:
        try:
            hour, minute = map(int, value.split(":"))
        except ValueError as error:
            raise ValueError("La hora debe tener formato HH:MM") from error
        if not 0 <= hour <= 23 or not 0 <= minute <= 59:
            raise ValueError("La hora no es válida")
        return f"{hour:02d}:{minute:02d}"

    @field_validator("recurrence_frequency")
    @classmethod
    def validate_recurrence(cls, value: Optional[str]) -> Optional[str]:
        if value not in (None, "weekly", "monthly"):
            raise ValueError("La recurrencia debe ser semanal o mensual")
        return value

    @field_validator("pending_documents")
    @classmethod
    def validate_pending_documents(cls, value: List[str]) -> List[str]:
        return [item.strip() for item in value if item.strip()][:20]


class AppointmentUpdate(BaseModel):
    appointment_type: str
    date: str
    time: str
    location: Optional[str] = None
    treating_professional: Optional[str] = None
    notes: Optional[str] = None
    document_ids: List[int] = []
    pending_documents: List[str] = []

    _validate_type = field_validator("appointment_type")(AppointmentCreate.validate_type)
    _validate_date = field_validator("date")(AppointmentCreate.validate_date)
    _validate_time = field_validator("time")(AppointmentCreate.validate_time)
    _validate_pending_documents = field_validator("pending_documents")(AppointmentCreate.validate_pending_documents)


class AppointmentOutcome(BaseModel):
    outcome_notes: Optional[str] = None
    medical_recommendations: Optional[str] = None
    follow_up_pending: bool = False
    follow_up_notes: Optional[str] = None


class AppointmentDecision(BaseModel):
    accepted: bool


class AppointmentResponse(BaseModel):
    id: int
    clinical_record_id: int
    patient_name: str
    appointment_type: str
    date: str
    time: str
    location: Optional[str]
    treating_professional: Optional[str]
    notes: Optional[str]
    document_ids: List[int]
    pending_documents: List[str]
    status: str
    outcome_notes: Optional[str]
    medical_recommendations: Optional[str]
    follow_up_pending: bool
    follow_up_notes: Optional[str]
    recurrence_frequency: Optional[str]
    recurrence_group_id: Optional[str]
    accompaniment_required: bool
    accompaniment_professional_user_id: Optional[int]
    accompaniment_professional_name: Optional[str]
    accompaniment_status: str


def _recurrence_dates(start: date, frequency: Optional[str], until: Optional[str]) -> List[date]:
    if not frequency:
        return [start]
    if not until:
        raise HTTPException(status_code=422, detail="Indica hasta cuándo se repite la cita")
    end = date.fromisoformat(until)
    if end <= start:
        raise HTTPException(status_code=422, detail="La fecha final debe ser posterior a la cita")
    dates, current = [start], start
    while current < end:
        if frequency == "weekly":
            current += timedelta(days=7)
        else:
            month = current.month + 1
            year, month = current.year + (month - 1) // 12, (month - 1) % 12 + 1
            current = date(year, month, min(current.day, calendar.monthrange(year, month)[1]))
        if current <= end:
            dates.append(current)
        if len(dates) > 52:
            raise HTTPException(status_code=422, detail="Una serie puede tener como máximo 52 citas")
    return dates


def _serialize(item: MedicalAppointment, record: ClinicalRecord, session: Session) -> AppointmentResponse:
    professional = session.get(User, item.accompaniment_professional_user_id) if item.accompaniment_professional_user_id else None
    return AppointmentResponse(
        id=item.id, clinical_record_id=item.clinical_record_id, patient_name=record.patient_name,
        appointment_type=item.appointment_type, date=item.date, time=item.time, location=item.location,
        treating_professional=item.treating_professional, notes=item.notes,
        document_ids=item.document_ids or [], pending_documents=item.pending_documents or [], status=item.status.value,
        outcome_notes=item.outcome_notes, medical_recommendations=item.medical_recommendations,
        follow_up_pending=item.follow_up_pending, follow_up_notes=item.follow_up_notes,
        recurrence_frequency=item.recurrence_frequency, recurrence_group_id=item.recurrence_group_id,
        accompaniment_required=item.accompaniment_required,
        accompaniment_professional_user_id=item.accompaniment_professional_user_id,
        accompaniment_professional_name=professional.full_name if professional else None,
        accompaniment_status=item.accompaniment_status.value,
    )


def _assigned_professional(session: Session, family_id: int, record_id: int, professional_id: int) -> User:
    booking = session.exec(select(Booking).where(
        Booking.family_user_id == family_id, Booking.clinical_record_id == record_id,
        Booking.professional_user_id == professional_id, Booking.status == BookingStatus.approved,
    )).first()
    professional = session.get(User, professional_id)
    if not booking or not professional or professional.role not in (UserRole.caregiver, UserRole.nurse):
        raise HTTPException(status_code=422, detail="El profesional debe tener un servicio aprobado para este paciente")
    return professional


def _validate_documents(session: Session, record_id: int, document_ids: List[int]) -> List[int]:
    unique_ids = list(dict.fromkeys(document_ids))
    if len(unique_ids) > 20:
        raise HTTPException(status_code=422, detail="Puedes adjuntar máximo 20 documentos")
    for document_id in unique_ids:
        document = session.get(ClinicalRecordDocument, document_id)
        if not document or document.clinical_record_id != record_id:
            raise HTTPException(status_code=422, detail="Uno de los documentos no pertenece a este paciente")
    return unique_ids


def _owned_appointment(appointment_id: int, current_user: User, session: Session) -> tuple[MedicalAppointment, ClinicalRecord]:
    item = session.get(MedicalAppointment, appointment_id)
    if not item or item.family_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    record = session.get(ClinicalRecord, item.clinical_record_id)
    return item, record


@router.get("/eligible-professionals")
def eligible_professionals(clinical_record_id: int, current_user: User = Depends(require_role(UserRole.family)), session: Session = Depends(get_session)):
    record = session.get(ClinicalRecord, clinical_record_id)
    if not record or record.family_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    bookings = session.exec(select(Booking).where(
        Booking.family_user_id == current_user.id, Booking.clinical_record_id == clinical_record_id,
        Booking.status == BookingStatus.approved,
    )).all()
    professionals = {}
    for booking in bookings:
        user = session.get(User, booking.professional_user_id)
        if user and user.role in (UserRole.caregiver, UserRole.nurse):
            professionals[user.id] = {"id": user.id, "name": user.full_name, "role": user.role.value}
    return list(professionals.values())


@router.post("/", response_model=List[AppointmentResponse], status_code=status.HTTP_201_CREATED)
def create_appointment(request: AppointmentCreate, current_user: User = Depends(require_role(UserRole.family)), session: Session = Depends(get_session)):
    record = session.get(ClinicalRecord, request.clinical_record_id)
    if not record or record.family_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    professional = _assigned_professional(session, current_user.id, record.id, request.accompaniment_professional_user_id) if request.accompaniment_professional_user_id else None
    dates = _recurrence_dates(date.fromisoformat(request.date), request.recurrence_frequency, request.recurrence_until)
    document_ids = _validate_documents(session, record.id, request.document_ids)
    group_id = str(uuid4()) if request.recurrence_frequency else None
    appointments = []
    for occurrence in dates:
        item = MedicalAppointment(
            family_user_id=current_user.id, clinical_record_id=record.id, appointment_type=request.appointment_type,
            date=occurrence.isoformat(), time=request.time, location=request.location,
            treating_professional=request.treating_professional, notes=request.notes,
            document_ids=document_ids, pending_documents=request.pending_documents,
            recurrence_frequency=request.recurrence_frequency, recurrence_group_id=group_id,
            accompaniment_required=professional is not None,
            accompaniment_professional_user_id=professional.id if professional else None,
            accompaniment_status=AppointmentAccompanimentStatus.pending if professional else AppointmentAccompanimentStatus.none,
        )
        session.add(item)
        appointments.append(item)
    if professional:
        create_notification(session, professional.id, "appointment_accompaniment", "Solicitud de acompañamiento", f"Se solicitó tu acompañamiento para la cita de {record.patient_name} el {request.date}.")
    session.commit()
    for item in appointments:
        session.refresh(item)
    return [_serialize(item, record, session) for item in appointments]


@router.get("/family", response_model=List[AppointmentResponse])
def list_family_appointments(current_user: User = Depends(require_role(UserRole.family)), session: Session = Depends(get_session)):
    items = session.exec(select(MedicalAppointment).where(MedicalAppointment.family_user_id == current_user.id).order_by(MedicalAppointment.date, MedicalAppointment.time)).all()
    return [_serialize(item, session.get(ClinicalRecord, item.clinical_record_id), session) for item in items]


@router.put("/{appointment_id}/details", response_model=AppointmentResponse)
def update_appointment(appointment_id: int, request: AppointmentUpdate, current_user: User = Depends(require_role(UserRole.family)), session: Session = Depends(get_session)):
    item, record = _owned_appointment(appointment_id, current_user, session)
    if item.status != AppointmentStatus.scheduled:
        raise HTTPException(status_code=400, detail="Solo puedes editar citas programadas")
    item.appointment_type = request.appointment_type
    item.date, item.time = request.date, request.time
    item.location, item.treating_professional, item.notes = request.location, request.treating_professional, request.notes
    item.document_ids = _validate_documents(session, record.id, request.document_ids)
    item.pending_documents = request.pending_documents
    session.add(item)
    session.commit()
    session.refresh(item)
    return _serialize(item, record, session)


@router.put("/{appointment_id}/outcome", response_model=AppointmentResponse)
def record_appointment_outcome(appointment_id: int, request: AppointmentOutcome, current_user: User = Depends(require_role(UserRole.family)), session: Session = Depends(get_session)):
    item, record = _owned_appointment(appointment_id, current_user, session)
    if item.status == AppointmentStatus.cancelled:
        raise HTTPException(status_code=400, detail="No puedes registrar el resultado de una cita cancelada")
    item.outcome_notes = request.outcome_notes
    item.medical_recommendations = request.medical_recommendations
    item.follow_up_pending = request.follow_up_pending
    item.follow_up_notes = request.follow_up_notes
    item.status = AppointmentStatus.completed
    session.add(item)
    session.commit()
    session.refresh(item)
    return _serialize(item, record, session)


@router.put("/{appointment_id}/cancel", response_model=AppointmentResponse)
def cancel_appointment(appointment_id: int, current_user: User = Depends(require_role(UserRole.family)), session: Session = Depends(get_session)):
    item, record = _owned_appointment(appointment_id, current_user, session)
    if item.status != AppointmentStatus.scheduled:
        raise HTTPException(status_code=400, detail="Solo puedes cancelar citas programadas")
    item.status = AppointmentStatus.cancelled
    if item.accompaniment_status == AppointmentAccompanimentStatus.pending:
        item.accompaniment_status = AppointmentAccompanimentStatus.cancelled
        if item.accompaniment_professional_user_id:
            create_notification(session, item.accompaniment_professional_user_id, "appointment_accompaniment", "Cita cancelada", f"La cita de {record.patient_name} del {item.date} fue cancelada.")
    session.add(item)
    session.commit()
    session.refresh(item)
    return _serialize(item, record, session)


@router.get("/professional", response_model=List[AppointmentResponse])
def list_professional_appointments(current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse)), session: Session = Depends(get_session)):
    items = session.exec(select(MedicalAppointment).where(
        MedicalAppointment.accompaniment_professional_user_id == current_user.id,
    ).order_by(MedicalAppointment.date, MedicalAppointment.time)).all()
    return [_serialize(item, session.get(ClinicalRecord, item.clinical_record_id), session) for item in items]


@router.put("/{appointment_id}/accompaniment", response_model=AppointmentResponse)
def decide_accompaniment(appointment_id: int, request: AppointmentDecision, current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse)), session: Session = Depends(get_session)):
    item = session.get(MedicalAppointment, appointment_id)
    if not item:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    if item.accompaniment_professional_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No estás asignado a esta solicitud")
    if item.accompaniment_status != AppointmentAccompanimentStatus.pending:
        raise HTTPException(status_code=400, detail="La solicitud ya fue respondida")
    item.accompaniment_status = AppointmentAccompanimentStatus.accepted if request.accepted else AppointmentAccompanimentStatus.rejected
    session.add(item)
    record = session.get(ClinicalRecord, item.clinical_record_id)
    decision = "aceptó" if request.accepted else "rechazó"
    create_notification(session, item.family_user_id, "appointment_accompaniment", "Respuesta a acompañamiento", f"{current_user.full_name} {decision} acompañar la cita de {record.patient_name} del {item.date}.")
    session.commit()
    session.refresh(item)
    return _serialize(item, record, session)