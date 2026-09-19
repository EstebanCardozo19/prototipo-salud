"""Generación de recordatorios de medicación para profesionales en turno."""
from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, time
from typing import Any

from sqlmodel import Session, select

from app.models import Booking, BookingStatus, MedicationReminderDelivery, PushSubscription, ServiceCarePlan
from app.routers.notifications_router import create_notification
from app.services.service_lifecycle import _localized_now, is_service_active


TIME_PATTERN = re.compile(r"^\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])?\s*$")


def parse_medication_time(value: str) -> time | None:
    """Convierte ``HH:MM`` o ``HH:MM AM/PM`` a una hora local válida."""
    match = TIME_PATTERN.match(value or "")
    if not match:
        return None
    hour, minute, period = int(match.group(1)), int(match.group(2)), match.group(3)
    if minute > 59:
        return None
    if period:
        if not 1 <= hour <= 12:
            return None
        hour = hour % 12 + (12 if period.lower() == "pm" else 0)
    elif hour > 23:
        return None
    return time(hour, minute)


def _schedule_key(item: dict[str, Any]) -> str:
    canonical = json.dumps(
        {key: str(item.get(key, "")).strip() for key in ("medication", "dosage", "time", "instructions")},
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _send_web_push(session: Session, user_id: int, booking_id: int) -> None:
    """Entrega un push discreto; el detalle clínico permanece en la aplicación."""
    private_key = os.getenv("VAPID_PRIVATE_KEY")
    if not os.getenv("VAPID_PUBLIC_KEY") or not private_key:
        return
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        return
    payload = json.dumps({
        "title": "Recordatorio de medicación",
        "body": "Tienes una pauta de medicación programada durante tu servicio activo.",
        "url": "/",
        "booking_id": booking_id,
    })
    subscriptions = session.exec(select(PushSubscription).where(PushSubscription.user_id == user_id)).all()
    for subscription in subscriptions:
        try:
            webpush(
                subscription_info=subscription.subscription_data,
                data=payload,
                vapid_private_key=private_key,
                vapid_claims={"sub": os.getenv("VAPID_CLAIMS_SUB", "mailto:soporte@example.com")},
            )
        except WebPushException as error:
            if getattr(error.response, "status_code", None) in (404, 410):
                session.delete(subscription)
        except Exception:
            # Una indisponibilidad del proveedor no debe detener los recordatorios internos.
            continue


def dispatch_due_medication_reminders(session: Session, now: datetime | None = None) -> int:
    """Registra y entrega las pautas del minuto actual, sin duplicar envíos."""
    current_time = _localized_now(now).replace(second=0, microsecond=0)
    dispatched = 0
    bookings = session.exec(select(Booking).where(Booking.status == BookingStatus.approved)).all()
    for booking in bookings:
        try:
            if not is_service_active(booking, current_time):
                continue
        except ValueError:
            continue
        plan = session.exec(select(ServiceCarePlan).where(ServiceCarePlan.booking_id == booking.id)).first()
        if not plan:
            continue
        for item in plan.medication_schedule or []:
            scheduled_time = parse_medication_time(str(item.get("time", "")))
            if scheduled_time != current_time.time().replace(tzinfo=None):
                continue
            key = _schedule_key(item)
            existing = session.exec(
                select(MedicationReminderDelivery).where(
                    MedicationReminderDelivery.booking_id == booking.id,
                    MedicationReminderDelivery.schedule_key == key,
                    MedicationReminderDelivery.reminder_date == current_time.date().isoformat(),
                )
            ).first()
            if existing:
                continue
            medication = str(item.get("medication", "Medicamento")).strip()
            dosage = str(item.get("dosage", "dosis autorizada")).strip()
            instructions = str(item.get("instructions", "")).strip()
            body = f"Administrar {medication}: {dosage}."
            if instructions:
                body += f" Indicaciones: {instructions}"
            session.add(MedicationReminderDelivery(
                booking_id=booking.id, schedule_key=key, reminder_date=current_time.date().isoformat()
            ))
            create_notification(session, booking.professional_user_id, "medication_reminder", "Recordatorio de medicación", body, booking.id)
            _send_web_push(session, booking.professional_user_id, booking.id)
            dispatched += 1
    if dispatched:
        session.commit()
    return dispatched