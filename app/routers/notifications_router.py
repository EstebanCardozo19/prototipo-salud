"""Centro de notificaciones internas de la aplicación."""
import os
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select
import requests

from app.auth import get_current_user, require_role
from app.database import get_session
from app.models import Notification, PushSubscription, User, UserRole


router = APIRouter(prefix="/api/notifications", tags=["Notificaciones"])


class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    body: str
    booking_id: Optional[int] = None
    is_read: bool
    created_at: Optional[datetime] = None


class PushSubscriptionRequest(BaseModel):
    endpoint: str
    keys: dict[str, str]


def create_notification(session: Session, user_id: int, notification_type: str, title: str, body: str, booking_id: Optional[int] = None):
    """Registra una alerta. La transacción se confirma desde la acción que la originó."""
    session.add(Notification(
        user_id=user_id,
        type=notification_type,
        title=title,
        body=body,
        booking_id=booking_id,
    ))


@router.get("/push/public-key")
def get_push_public_key(current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse))):
    """Expone únicamente la clave VAPID pública a profesionales autenticados."""
    public_key = os.getenv("VAPID_PUBLIC_KEY")
    if not public_key:
        raise HTTPException(status_code=503, detail="Las notificaciones push no están configuradas")
    return {"public_key": public_key}


@router.post("/push/subscriptions", status_code=201)
def save_push_subscription(
    request: PushSubscriptionRequest,
    current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse)),
    session: Session = Depends(get_session),
):
    endpoint = request.endpoint.strip()
    if not endpoint or not request.keys.get("p256dh") or not request.keys.get("auth"):
        raise HTTPException(status_code=422, detail="La suscripción push no es válida")
    subscription = session.exec(select(PushSubscription).where(PushSubscription.endpoint == endpoint)).first()
    data = {"endpoint": endpoint, "keys": request.keys}
    if subscription:
        subscription.user_id = current_user.id
        subscription.subscription_data = data
    else:
        subscription = PushSubscription(user_id=current_user.id, endpoint=endpoint, subscription_data=data)
    session.add(subscription)
    session.commit()
    return {"saved": True}


def dispatch_emergency_webhook(booking_id: int, family_user_id: int) -> bool:
    """Llama a un integrador institucional opcional sin enviar datos clínicos.

    Configure ``EMERGENCY_NOTIFICATION_WEBHOOK_URL`` para recibir IDs de
    referencia. El destino autorizado resuelve el contacto por su cuenta; no se
    envían prompts, respuestas, diagnósticos ni teléfonos desde esta aplicación.
    """
    webhook_url = os.getenv("EMERGENCY_NOTIFICATION_WEBHOOK_URL")
    if not webhook_url:
        return False
    try:
        response = requests.post(
            webhook_url,
            json={"event": "professional_assistant_emergency", "booking_id": booking_id, "family_user_id": family_user_id},
            timeout=5,
        )
        return response.ok
    except requests.RequestException:
        return False


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