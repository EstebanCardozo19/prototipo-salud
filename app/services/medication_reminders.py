"""Generación de recordatorios de medicación.

Fuentes de pautas:
  1. ``ServiceCarePlan.medication_schedule``  — pautas del profesional para un servicio activo.
  2. ``PatientMedication``                   — medicamentos permanentes registrados por la familia.

Destinatarios:
  - Profesional en servicio activo (siempre que haya servicio).
  - Familiar propietario de la ficha (siempre).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, time
from typing import Any

from sqlmodel import Session, select

from app.models import (
    Booking, BookingStatus,
    ClinicalRecord,
    MedicationReminderDelivery, MedicationStatus,
    PatientMedication, PushSubscription,
    ServiceCarePlan,
)
from app.routers.notifications_router import create_notification
from app.services.service_lifecycle import _localized_now, is_service_active


TIME_PATTERN = re.compile(r"^\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])?\s*$")

FREQUENCY_LABELS: dict[str, str] = {
    "every_4h": "cada 4 h", "every_6h": "cada 6 h", "every_8h": "cada 8 h",
    "every_12h": "cada 12 h", "every_24h": "1 vez/día",
    "twice_daily": "2 veces/día", "three_daily": "3 veces/día", "four_daily": "4 veces/día",
}


# ── Helpers ───────────────────────────────────────────────────────────────

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
    """Clave idempotente para una pauta del ServiceCarePlan."""
    canonical = json.dumps(
        {k: str(item.get(k, "")).strip() for k in ("medication", "dosage", "time", "instructions")},
        ensure_ascii=False, sort_keys=True,
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def _patient_med_key(med_id: int, schedule_time: str) -> str:
    """Clave idempotente para un PatientMedication."""
    canonical = json.dumps({"med_id": med_id, "time": schedule_time}, sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _already_delivered(session: Session, key: str, date_str: str) -> bool:
    return session.exec(
        select(MedicationReminderDelivery).where(
            MedicationReminderDelivery.schedule_key == key,
            MedicationReminderDelivery.reminder_date == date_str,
        )
    ).first() is not None


def _mark_delivered(
    session: Session,
    key: str,
    date_str: str,
    booking_id: int | None = None,
    patient_medication_id: int | None = None,
) -> None:
    session.add(MedicationReminderDelivery(
        booking_id=booking_id,
        patient_medication_id=patient_medication_id,
        schedule_key=key,
        reminder_date=date_str,
    ))


def _send_push(session: Session, user_id: int, booking_id: int | None, title: str, body: str) -> None:
    private_key = os.getenv("VAPID_PRIVATE_KEY")
    if not os.getenv("VAPID_PUBLIC_KEY") or not private_key:
        return
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        return
    payload = json.dumps({"title": title, "body": body, "url": "/", "booking_id": booking_id})
    subscriptions = session.exec(select(PushSubscription).where(PushSubscription.user_id == user_id)).all()
    for sub in subscriptions:
        try:
            webpush(
                subscription_info=sub.subscription_data,
                data=payload,
                vapid_private_key=private_key,
                vapid_claims={"sub": os.getenv("VAPID_CLAIMS_SUB", "mailto:soporte@example.com")},
            )
        except Exception as err:
            if hasattr(err, "response") and getattr(err.response, "status_code", None) in (404, 410):
                session.delete(sub)
            continue


def _find_active_booking(session: Session, clinical_record_id: int, now: datetime) -> Booking | None:
    """Devuelve el primer booking aprobado con servicio activo en este momento para la ficha."""
    bookings = session.exec(
        select(Booking).where(
            Booking.clinical_record_id == clinical_record_id,
            Booking.status == BookingStatus.approved,
        )
    ).all()
    for b in bookings:
        try:
            if is_service_active(b, now):
                return b
        except ValueError:
            continue
    return None


# ── Fuente 1: ServiceCarePlan ─────────────────────────────────────────────

def _dispatch_care_plan_reminders(session: Session, now: datetime) -> int:
    """Notifica al profesional en turno según el plan del servicio."""
    dispatched = 0
    now_time = now.time().replace(second=0, microsecond=0)
    date_str = now.date().isoformat()

    bookings = session.exec(select(Booking).where(Booking.status == BookingStatus.approved)).all()
    for booking in bookings:
        try:
            if not is_service_active(booking, now):
                continue
        except ValueError:
            continue
        plan = session.exec(select(ServiceCarePlan).where(ServiceCarePlan.booking_id == booking.id)).first()
        if not plan:
            continue
        for item in plan.medication_schedule or []:
            t = parse_medication_time(str(item.get("time", "")))
            if t != now_time:
                continue
            key = _schedule_key(item)
            if _already_delivered(session, key, date_str):
                continue
            med_name = str(item.get("medication", "Medicamento")).strip()
            dosage   = str(item.get("dosage", "dosis autorizada")).strip()
            instr    = str(item.get("instructions", "")).strip()
            body = f"Administrar {med_name}: {dosage}."
            if instr:
                body += f" Indicaciones: {instr}"
            _mark_delivered(session, key, date_str, booking_id=booking.id)
            create_notification(session, booking.professional_user_id,
                                "medication_reminder", f"💊 Recordatorio: {med_name}", body, booking.id)
            _send_push(session, booking.professional_user_id, booking.id,
                       f"💊 Recordatorio: {med_name}", body)
            dispatched += 1
    return dispatched


# ── Fuente 2: PatientMedication ───────────────────────────────────────────

def _dispatch_patient_medication_reminders(session: Session, now: datetime) -> int:
    """Notifica al familiar (siempre) y al profesional en servicio activo (si existe)."""
    dispatched = 0
    now_time = now.time().replace(second=0, microsecond=0)
    date_str = now.date().isoformat()

    meds = session.exec(
        select(PatientMedication).where(
            PatientMedication.status == MedicationStatus.active,
        )
    ).all()

    for med in meds:
        schedules: list[str] = med.schedules or []
        if not schedules:
            continue

        # ¿Toca ahora?
        matching_time: str | None = next(
            (s for s in schedules if parse_medication_time(s) == now_time), None
        )
        if not matching_time:
            continue

        key = _patient_med_key(med.id, matching_time)
        if _already_delivered(session, key, date_str):
            continue

        # Construir cuerpo del mensaje
        freq_str = FREQUENCY_LABELS.get(
            med.frequency.value if hasattr(med.frequency, "value") else str(med.frequency), ""
        )
        body_base = f"{med.name}: {med.dose}"
        if freq_str:
            body_base += f" ({freq_str})"
        if med.instructions:
            body_base += f" — {med.instructions}"

        stock_warning = ""
        if (med.current_stock is not None
                and med.restock_alert_threshold is not None
                and med.current_stock <= med.restock_alert_threshold):
            stock_warning = (
                f" ⚠️ Stock bajo: quedan {med.current_stock} {med.stock_unit or 'unidades'}."
                " Solicita el próximo abastecimiento."
            )

        family_body = f"Es hora de administrar {body_base}.{stock_warning}"
        prof_body   = f"Administrar a paciente: {body_base}.{stock_warning}"
        title       = f"💊 Hora del medicamento: {med.name}"

        # Buscar servicio activo
        active_booking = _find_active_booking(session, med.clinical_record_id, now)

        # Marcar entregado
        _mark_delivered(
            session, key, date_str,
            booking_id=active_booking.id if active_booking else None,
            patient_medication_id=med.id,
        )

        # Notificar al familiar
        record = session.get(ClinicalRecord, med.clinical_record_id)
        if record:
            create_notification(
                session, record.family_user_id, "medication_reminder",
                title, family_body,
                active_booking.id if active_booking else None,
            )
            _send_push(session, record.family_user_id,
                       active_booking.id if active_booking else None,
                       title, family_body)
            dispatched += 1

        # Notificar al profesional en turno
        if active_booking:
            create_notification(
                session, active_booking.professional_user_id, "medication_reminder",
                title, prof_body, active_booking.id,
            )
            _send_push(session, active_booking.professional_user_id,
                       active_booking.id, title, prof_body)
            dispatched += 1

    return dispatched


# ── Punto de entrada ──────────────────────────────────────────────────────

def dispatch_due_medication_reminders(session: Session, now: datetime | None = None) -> int:
    """Combina las dos fuentes y entrega los recordatorios del minuto actual."""
    current_time = _localized_now(now).replace(second=0, microsecond=0)
    dispatched = 0
    try:
        dispatched += _dispatch_care_plan_reminders(session, current_time)
    except Exception:
        pass
    try:
        dispatched += _dispatch_patient_medication_reminders(session, current_time)
    except Exception:
        pass
    if dispatched:
        session.commit()
    return dispatched
