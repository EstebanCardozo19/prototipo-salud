"""Reglas temporales y cierre automático de los servicios contratados."""
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from app.models import Booking, BookingStatus


SERVICE_TIMEZONE = ZoneInfo("America/Bogota")
AUTOMATIC_COMPLETION_DELAY = timedelta(minutes=30)


def _localized_now(now: datetime | None = None) -> datetime:
    """Normaliza una fecha para comparar siempre en la zona horaria del servicio."""
    if now is None:
        return datetime.now(SERVICE_TIMEZONE)
    if now.tzinfo is None:
        return now.replace(tzinfo=SERVICE_TIMEZONE)
    return now.astimezone(SERVICE_TIMEZONE)


def service_schedule(booking: Booking) -> tuple[datetime, datetime]:
    """Construye el intervalo [inicio, fin) del servicio a partir del booking."""
    try:
        service_date = date.fromisoformat(booking.date)
        start = datetime.combine(service_date, time(hour=booking.start_hour), SERVICE_TIMEZONE)
        end = datetime.combine(service_date, time(hour=booking.end_hour), SERVICE_TIMEZONE)
    except (TypeError, ValueError) as error:
        raise ValueError("El servicio tiene una fecha u horario inválido") from error

    if end <= start:
        raise ValueError("La hora de finalización debe ser posterior a la hora de inicio")
    return start, end


def is_service_active(booking: Booking, now: datetime | None = None) -> bool:
    """Indica si el momento actual está dentro del horario contratado."""
    start, end = service_schedule(booking)
    current_time = _localized_now(now)
    return start <= current_time < end


def should_auto_complete(booking: Booking, now: datetime | None = None) -> bool:
    """Indica si un servicio aprobado venció hace al menos 30 minutos."""
    if booking.status != BookingStatus.approved:
        return False
    _, end = service_schedule(booking)
    return _localized_now(now) >= end + AUTOMATIC_COMPLETION_DELAY


def complete_expired_services(session: Session, now: datetime | None = None) -> int:
    """Completa los servicios aprobados que no se cerraron 30 minutos tras su fin.

    La operación es idempotente: un servicio ya completado no se vuelve a modificar.
    """
    completed_count = 0
    approved_bookings = session.exec(
        select(Booking).where(Booking.status == BookingStatus.approved)
    ).all()

    for booking in approved_bookings:
        try:
            expired = should_auto_complete(booking, now)
        except ValueError:
            # Un dato histórico inválido no debe detener el cierre de los demás servicios.
            continue
        if expired:
            booking.status = BookingStatus.completed
            session.add(booking)
            completed_count += 1

    if completed_count:
        session.commit()
    return completed_count