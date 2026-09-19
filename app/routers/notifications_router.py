"""Centro de notificaciones internas de la aplicación."""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user
from app.database import get_session
from app.models import Notification, User


router = APIRouter(prefix="/api/notifications", tags=["Notificaciones"])


class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    body: str
    booking_id: Optional[int] = None
    is_read: bool
    created_at: Optional[datetime] = None


def create_notification(session: Session, user_id: int, notification_type: str, title: str, body: str, booking_id: Optional[int] = None):
    """Registra una alerta. La transacción se confirma desde la acción que la originó."""
    session.add(Notification(
        user_id=user_id,
        type=notification_type,
        title=title,
        body=body,
        booking_id=booking_id,
    ))


def serialize(notification: Notification) -> NotificationResponse:
    return NotificationResponse(
        id=notification.id,
        type=notification.type,
        title=notification.title,
        body=notification.body,
        booking_id=notification.booking_id,
        is_read=notification.is_read,
        created_at=notification.created_at,
    )


@router.get("/", response_model=List[NotificationResponse])
def list_notifications(
    limit: int = 30,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    safe_limit = max(1, min(limit, 100))
    notifications = session.exec(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(safe_limit)
    ).all()
    return [serialize(notification) for notification in notifications]


@router.put("/{notification_id}/read", response_model=NotificationResponse)
def mark_as_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    notification = session.get(Notification, notification_id)
    if not notification or notification.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    notification.is_read = True
    session.add(notification)
    session.commit()
    session.refresh(notification)
    return serialize(notification)


@router.put("/read-all")
def mark_all_as_read(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    notifications = session.exec(
        select(Notification).where(Notification.user_id == current_user.id, Notification.is_read == False)  # noqa: E712
    ).all()
    for notification in notifications:
        notification.is_read = True
        session.add(notification)
    session.commit()
    return {"updated": len(notifications)}