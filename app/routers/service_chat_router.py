"""Chat privado entre la familia y el profesional de una solicitud aprobada."""
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.auth import get_current_user
from app.security.encryption import user_full_name
from app.database import get_session
from app.models import Booking, BookingStatus, ServiceChatMessage, User
from app.routers.notifications_router import create_notification


router = APIRouter(prefix="/api/service-chat", tags=["Chat de servicio"])


class ServiceChatMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=1000)


class ServiceChatMessageResponse(BaseModel):
    id: int
    booking_id: int
    sender_user_id: int
    sender_name: str
    content: str
    created_at: datetime | None = None


def _active_booking_for_participant(booking_id: int, current_user: User, session: Session) -> Booking:
    booking = session.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if current_user.id not in (booking.family_user_id, booking.professional_user_id):
        raise HTTPException(status_code=403, detail="No autorizado para acceder a este chat")
    if booking.status != BookingStatus.approved:
        raise HTTPException(status_code=403, detail="El chat solo está disponible mientras el servicio esté aprobado y activo")
    return booking


@router.get("/{booking_id}/messages", response_model=List[ServiceChatMessageResponse])
def list_messages(
    booking_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    booking = _active_booking_for_participant(booking_id, current_user, session)
    messages = session.exec(
        select(ServiceChatMessage)
        .where(ServiceChatMessage.booking_id == booking_id)
        .order_by(ServiceChatMessage.created_at, ServiceChatMessage.id)
    ).all()
    sender_ids = {message.sender_user_id for message in messages}
    senders = {}
    if sender_ids:
        senders = {sender.id: sender for sender in session.exec(select(User).where(User.id.in_(sender_ids))).all()}
    return [
        ServiceChatMessageResponse(
            id=message.id,
            booking_id=message.booking_id,
            sender_user_id=message.sender_user_id,
            sender_name=senders.get(message.sender_user_id).full_name if senders.get(message.sender_user_id) else "Usuario",
            content=message.content,
            created_at=message.created_at,
        )
        for message in messages
    ]


@router.post("/{booking_id}/messages", response_model=ServiceChatMessageResponse, status_code=status.HTTP_201_CREATED)
def send_message(
    booking_id: int,
    request: ServiceChatMessageCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    booking = _active_booking_for_participant(booking_id, current_user, session)
    content = request.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío")
    message = ServiceChatMessage(booking_id=booking_id, sender_user_id=current_user.id, content=content)
    session.add(message)
    # El mensaje es la acción principal: debe guardarse aunque todavía no exista
    # la tabla de notificaciones en una instalación que no se haya reiniciado.
    session.commit()
    session.refresh(message)

    recipient_id = booking.professional_user_id if current_user.id == booking.family_user_id else booking.family_user_id
    try:
        create_notification(
            session,
            recipient_id,
            "message",
            "Nuevo mensaje del servicio",
            f"{user_full_name(current_user)} te escribió sobre el servicio del {booking.date}.",
            booking.id,
        )
        session.commit()
    except Exception:
        # Una alerta interna no puede bloquear la conversación si falla la
        # migración/creación de su tabla o cualquier operación secundaria.
        session.rollback()
    return ServiceChatMessageResponse(
        id=message.id,
        booking_id=message.booking_id,
        sender_user_id=message.sender_user_id,
        sender_name=user_full_name(current_user),
        content=message.content,
        created_at=message.created_at,
    )