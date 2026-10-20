"""Herramientas de catálogo usadas por el agente familiar.

La recomendación y su puntuación se calculan localmente contra PostgreSQL, no
por el modelo conversacional. El modelo únicamente puede redactar respuestas.
"""
import json
import re
import unicodedata
from datetime import date

from sqlmodel import Session, select

from app.database import engine
from app.models import Availability, Booking, BookingStatus, CaregiverProfile, ClinicalRecord, MedicationStatus, NurseProfile, PatientMedication, ProfileStatus, ServiceCarePlan, User, UserRole
from app.services.bogota_locations import profile_covers_locality
from app.services.embedding_service import generar_embedding

SPECIALTY_TERMS = {
    "geriatrics": ("geriatria", "geront", "adulto mayor"),
    "neurology": ("alzheimer", "demencia", "deterioro cognitivo", "cognitiv", "memoria", "desorient", "neurolog", "parkinson", "acv"),
    "cardiology": ("cardio", "corazon", "hipertension"),
    "pulmonology": ("pulmon", "respirat", "oxigen"),
    "psychiatry": ("psiquiatr", "salud mental", "ansiedad", "depres"),
    "physiatry": ("rehabilit", "fisiatr", "movilidad"),
    "palliative": ("paliativ", "dolor cronico", "terminal"),
    "internal_medicine": ("medicina interna", "diabetes"),
    "endocrinology": ("diabetes", "endocrin"),
    "nephrology": ("renal", "rinon", "dialisis"),
    "orthopedics": ("ortoped", "fractura", "caida"),
}
DAY_WORDS = {"lunes": "monday", "martes": "tuesday", "miercoles": "wednesday", "jueves": "thursday", "viernes": "friday", "sabado": "saturday", "domingo": "sunday"}
SPECIALIZED_NEED_TERMS = tuple(term for terms in SPECIALTY_TERMS.values() for term in terms)


def _normalized(value: str) -> str:
    return "".join(char for char in unicodedata.normalize("NFD", (value or "").lower()) if unicodedata.category(char) != "Mn")


def _requested_day(description: str) -> str | None:
    text = _normalized(description)
    for word, day_name in DAY_WORDS.items():
        if re.search(rf"\b{word}\b", text):
            return day_name
    match = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", text)
    try:
        return date.fromisoformat(match.group(1)).strftime("%A").lower() if match else None
    except ValueError:
        return None


def _requested_schedule(description: str) -> tuple[str, int, int] | None:
    """Extrae fecha ISO y rango horario explícitos para verificarlos.

    Una frase ambigua no permite afirmar disponibilidad real para contratar.
    """
    match = re.search(
        r"\b(20\d{2}-\d{2}-\d{2})\b.*?\b(?:de\s+)?([01]?\d|2[0-3])(?:\s*(?::\s*\d{2})?)?\s*(?:a|hasta|-)\s*([01]?\d|2[0-3])(?:\s*(?::\s*\d{2})?)?\b",
        _normalized(description),
    )
    if not match:
        return None
    try:
        date.fromisoformat(match.group(1))
        start_hour, end_hour = int(match.group(2)), int(match.group(3))
        return (match.group(1), start_hour, end_hour) if start_hour != end_hour else None
    except ValueError:
        return None


def _is_schedule_available(schedule: tuple[str, int, int], availabilities: list, bookings: list) -> bool:
    """Aplica las mismas reglas de franjas y cruces que el flujo de reserva."""
    from app.routers.bookings_router import is_schedule_covered_by_availability, schedules_overlap

    service_date, start_hour, end_hour = schedule
    if not is_schedule_covered_by_availability(service_date, start_hour, end_hour, availabilities):
        return False
    return not any(
        schedules_overlap(service_date, start_hour, end_hour, booking.date, booking.start_hour, booking.end_hour)
        for booking in bookings
        if booking.status == BookingStatus.approved
    )


def _semantic_similarity(profile, query_embedding: list[float] | None) -> float:
    """Calcula similitud sobre embeddings persistidos, solo para ordenar elegibles."""
    embedding = getattr(profile, "embedding", None)
    if not query_embedding or not embedding or len(embedding) != len(query_embedding):
        return 0.0
    return float(sum(float(left) * float(right) for left, right in zip(embedding, query_embedding)))


def _profile_specialties(profile, professional_type: str) -> list[str]:
    if professional_type == "nurse":
        specialty = getattr(profile.specialty, "value", profile.specialty)
        return [str(specialty)] if specialty else []
    return [str(value) for value in (profile.specialties or [])]


def calcular_compatibilidad(profile, professional_type: str, description: str, locality: str | None, availabilities: list, schedule_verified: bool | None = None) -> tuple[int, list[str]]:
    """Calcula un puntaje estable: necesidades 40, experiencia 20, ubicación
    20, disponibilidad 10 y valoraciones verificadas 10.
    """
    text = _normalized(description)
    specialties = _profile_specialties(profile, professional_type)
    profile_text = _normalized(" ".join([profile.bio or "", *specialties]))
    matching_terms = [term for terms in SPECIALTY_TERMS.values() for term in terms if term in text and term in profile_text]
    need_score = 40 if matching_terms else (20 if any(term in profile_text for term in re.findall(r"[a-z]{5,}", text)) else 0)
    experience = max(0, int(profile.experience_years or 0))
    experience_score = min(20, experience * 2)
    location_score = 20 if locality and profile_covers_locality(profile, locality) else (10 if not locality else 0)
    active = [item for item in availabilities if item.is_active]
    requested_day = _requested_day(description)
    availability_score = 10 if schedule_verified is True else (10 if active and not _requested_schedule(description) and (not requested_day or any(getattr(item.day_of_week, "value", item.day_of_week) == requested_day for item in active)) else 0)
    rating_count = int(profile.rating_count or 0)
    rating_score = round((min(float(profile.rating_avg or 0), 5) / 5) * 10) if rating_count else 0
    criteria = []
    if matching_terms: criteria.append("coincide con necesidades y especialidad registradas")
    if experience: criteria.append(f"{experience} años de experiencia")
    if location_score == 20: criteria.append("cubre la localidad solicitada")
    if schedule_verified is True: criteria.append("disponibilidad verificada para la fecha y horario solicitados")
    elif availability_score: criteria.append("tiene disponibilidad publicada compatible; confirma el horario antes de contratar")
    if rating_count: criteria.append(f"valoración registrada: {float(profile.rating_avg):.1f}/5 ({rating_count})")
    return min(100, need_score + experience_score + location_score + availability_score + rating_score), criteria


def _serialize(profile, user, professional_type: str, score: int | None = None, criteria: list[str] | None = None) -> dict:
    specialties = _profile_specialties(profile, professional_type)
    return {"user_id": user.id, "profile_id": profile.id, "full_name": user.full_name, "photo_url": user.photo_url, "specialties": specialties, "specialty_display": ", ".join(specialties) or "Cuidado general", "location": profile.location, "coverage_localities": profile.coverage_localities or [], "covers_all_bogota": profile.covers_all_bogota, "experience_years": profile.experience_years, "hourly_rate": float(profile.hourly_rate), "bio": profile.bio or "", "rating_avg": float(profile.rating_avg) if profile.rating_count and profile.rating_avg is not None else None, "rating_count": int(profile.rating_count or 0), "role": professional_type, "compatibility": score, "compatibility_criteria": criteria or []}


def _profiles(session: Session, professional_type: str):
    model = NurseProfile if professional_type == "nurse" else CaregiverProfile
    role = UserRole.nurse if professional_type == "nurse" else UserRole.caregiver
    return session.exec(select(model, User).join(User, User.id == model.user_id).where(model.status == ProfileStatus.approved).where(User.is_active == True).where(User.role == role)).all()  # noqa: E712


def buscar_profesionales_similares(descripcion_paciente: str, tipo_profesional: str | None = None, localidad: str | None = None, page: int = 1, limit: int = 6) -> str:
    """Busca todos los perfiles reales del tipo solicitado y pagina el catálogo."""
    if tipo_profesional not in {"caregiver", "nurse"}:
        return json.dumps({"texto": "¿Buscas un cuidador/a o un enfermero/a?", "profesionales": []}, ensure_ascii=False)
    page, limit = max(1, int(page)), max(1, min(int(limit), 20))
    page = max(1, int(page or 1)); limit = max(1, min(int(limit or 6), 12)); ranked = []
    schedule = _requested_schedule(descripcion_paciente)
    normalized_description = _normalized(descripcion_paciente)
    requires_specialized_match = any(term in normalized_description for term in SPECIALIZED_NEED_TERMS)
    try:
        query_embedding = generar_embedding(descripcion_paciente)
    except Exception:
        # No se sustituyen resultados por ejemplos si el modelo local no está listo.
        query_embedding = None
        candidates = _profiles(session, tipo_profesional)
        ranked = []
        for profile, user in candidates:
            if localidad and not profile_covers_locality(profile, localidad):
                continue
            bookings = session.exec(select(Booking).where(Booking.professional_user_id == user.id).where(Booking.status == BookingStatus.approved)).all() if schedule else []
            schedule_verified = _is_schedule_available(schedule, availability, bookings) if schedule else None
            if schedule and not schedule_verified:
                continue
            score, criteria = calcular_compatibilidad(profile, tipo_profesional, descripcion_paciente, localidad, availability, schedule_verified)
            if requires_specialized_match and "coincide con necesidades y especialidad registradas" not in criteria:
                continue
            ranked.append((_serialize(profile, user, tipo_profesional, score, criteria), score, _semantic_similarity(profile, query_embedding)))
    ranked.sort(key=lambda item: (-item[1], -item[2], -item[0]["experience_years"], item[0]["full_name"].casefold()))
    total = len(ranked)
    professionals = [item[0] for item in ranked[(page - 1) * limit:page * limit]]
    label = "enfermeros" if tipo_profesional == "nurse" else "cuidadores"
    text = f"Encontré {total} {label} registrados que cumplen los criterios" + (f" en {localidad}" if localidad else "") + "."
    if not professionals:
        text = (f"No encontré {label} con compatibilidad registrada para esa necesidad específica."
                if requires_specialized_match else f"No hay más {label} que cumplan los criterios.")
    elif not schedule:
        text += " La disponibilidad para una fecha y hora concretas debe confirmarse antes de contratar."
    return json.dumps({"texto": text, "profesionales": professionals, "total": total, "page": page, "limit": limit, "has_more": page * limit < total}, ensure_ascii=False)


def buscar_profesional_por_nombre(name: str, tipo_profesional: str | None = None) -> list[dict]:
    """Consulta perfiles públicos reales por nombre, sin completar datos ausentes."""
    needle = _normalized(name)
    types = [tipo_profesional] if tipo_profesional in {"caregiver", "nurse"} else ["caregiver", "nurse"]
    matches = []
    with Session(engine) as session:
        for professional_type in types:
            for profile, user in _profiles(session, professional_type):
                if needle and needle in _normalized(user.full_name): matches.append(_serialize(profile, user, professional_type))
    return matches


def buscar_cuidadores_similares(descripcion_paciente: str, localidad: str = None) -> str:
    return buscar_profesionales_similares(descripcion_paciente, "caregiver", localidad)


def obtener_contexto_paciente_asignado(booking: Booking, clinical_record: ClinicalRecord, care_plan: ServiceCarePlan | None = None, include_clinical_details: bool = False, patient_medications: list | None = None) -> dict:
    """Construye el contexto mínimo autorizado del asistente documental."""
    context = {"service": {"date": booking.date, "start_hour": booking.start_hour, "end_hour": booking.end_hour, "professional_role": booking.professional_role}, "patient": {"name": clinical_record.patient_name, "age": clinical_record.patient_age, "mobility_level": clinical_record.mobility_level, "special_needs": clinical_record.special_needs, "allergies": clinical_record.allergies or []}}
    if care_plan: context["care_plan"] = {"medication_schedule": care_plan.medication_schedule or [], "emergency_protocol": care_plan.emergency_protocol}
    active_medications = [item for item in (patient_medications or []) if getattr(item, "status", None) == MedicationStatus.active]
    if active_medications:
        context["patient_medications"] = [{"name": item.name, "dose": item.dose, "frequency": getattr(item.frequency, "value", item.frequency), "schedules": item.schedules or [], "instructions": item.instructions} for item in active_medications]
    if include_clinical_details: context["patient"].update({"blood_type": clinical_record.blood_type, "diagnoses": clinical_record.diagnoses or [], "medications_registered": clinical_record.medications or []})
    return context


def get_tool_definitions() -> list[dict]:
    return [{"type": "function", "function": {"name": "buscar_profesionales_similares", "description": "Busca perfiles reales y devuelve compatibilidad determinista.", "parameters": {"type": "object", "properties": {"descripcion_paciente": {"type": "string"}, "tipo_profesional": {"type": "string", "enum": ["caregiver", "nurse"]}, "localidad": {"type": "string"}, "page": {"type": "integer"}}, "required": ["descripcion_paciente", "tipo_profesional"]}}}]