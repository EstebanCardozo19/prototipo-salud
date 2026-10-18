"""Recordatorios internos para citas médicas, sin dependencia de servicios."""
from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.models import AppointmentReminderDelivery, AppointmentStatus, MedicalAppointment
from app.routers.notifications_router import create_notification
from app.services.service_lifecycle import SERVICE_TIMEZONE


def dispatch_due_appointment_reminders(session: Session, now: datetime | None = None) -> int:
    """Crea una sola alerta 24 h y 2 h antes de cada cita programada."""
    now = now or datetime.now(SERVICE_TIMEZONE)
    sent = 0
    appointments = session.exec(
        select(MedicalAppointment).where(MedicalAppointment.status == AppointmentStatus.scheduled)
    ).all()
    for appointment in appointments:
        # La consulta ya filtra este estado; se conserva la protección para
        # sesiones simuladas y para evitar alertas si el registro cambia en memoria.
        if appointment.status != AppointmentStatus.scheduled:
            continue
        try:
            scheduled_at = datetime.fromisoformat(f"{appointment.date}T{appointment.time}").replace(tzinfo=SERVICE_TIMEZONE)
        except ValueError:
            continue
        reminders = (
            ("prepare_documents", timedelta(hours=24), "Prepara los documentos", f"Mañana tienes la cita de {appointment.appointment_type}. Revisa los documentos pendientes."),
            ("attend_appointment", timedelta(hours=2), "Recordatorio de cita médica", f"La cita de {appointment.appointment_type} es a las {appointment.time}."),
        )
        for reminder_type, advance, title, body in reminders:
            if not scheduled_at - advance <= now < scheduled_at:
                continue
            exists = session.exec(select(AppointmentReminderDelivery).where(
                AppointmentReminderDelivery.appointment_id == appointment.id,
                AppointmentReminderDelivery.reminder_type == reminder_type,
            )).first()
            if exists:
                continue
            session.add(AppointmentReminderDelivery(appointment_id=appointment.id, reminder_type=reminder_type))
            create_notification(session, appointment.family_user_id, "appointment_reminder", title, body)
            sent += 1
    if sent:
        session.commit()
    return sent