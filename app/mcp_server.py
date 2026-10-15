"""
Servidor MCP (Model Context Protocol) personalizado.
Expone la herramienta buscar_cuidadores_similares para el agente de IA.

Ejecutar standalone: python -m app.mcp_server
"""
import os
from dotenv import load_dotenv
from sqlmodel import Session
from sqlalchemy import text

from app.models import Booking, CaregiverProfile, ClinicalRecord, MedicationStatus, NurseProfile, PatientMedication, ProfileStatus, ServiceCarePlan, User
from app.services.embedding_service import generar_embedding
from app.database import engine

load_dotenv()


import json

def buscar_profesionales_similares(
    descripcion_paciente: str,
    tipo_profesional: str | None = None,
    localidad: str | None = None,
) -> str:
    """
    Busca los 3 profesionales más compatibles del tipo indicado usando búsqueda
    vectorial. El tipo debe ser ``caregiver`` o ``nurse``.
    Retorna un JSON serializado con texto narrativo + lista estructurada de profesionales.
    """
    if tipo_profesional not in {"caregiver", "nurse"}:
        return json.dumps({
            "texto": "¿Buscas un cuidador/a o un enfermero/a?",
            "profesionales": [],
        }, ensure_ascii=False)

    query_embedding = generar_embedding(descripcion_paciente)
    embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

    with Session(engine) as session:
        # Los perfiles creados antes de incorporar embeddings a enfermería siguen
        # siendo recomendables: se completan una sola vez al necesitarlos.
        if tipo_profesional == "nurse":
            nurses_without_embedding = session.query(NurseProfile).filter(
                NurseProfile.embedding.is_(None),
                NurseProfile.status == ProfileStatus.approved,
            ).all()
            for nurse in nurses_without_embedding:
                nurse.embedding = generar_embedding(
                    f"{nurse.bio or ''} Especialidad: {nurse.specialty.value}. "
                    f"Localidad: {nurse.location}."
                )
                session.add(nurse)
            if nurses_without_embedding:
                session.commit()

        if tipo_profesional == "caregiver":
            profile_table = "caregiver_profiles"
            specialty_column = "specialties"
        else:
            profile_table = "nurse_profiles"
            specialty_column = "specialty"

        if localidad:
            sql = text(f"""
                SELECT cp.id, u.id as user_id, u.full_name, u.photo_url,
                       cp.{specialty_column} AS specialties, cp.location, cp.experience_years,
                       cp.hourly_rate, cp.bio,
                       1 - (cp.embedding <=> CAST(:embedding AS vector)) AS similitud
                FROM {profile_table} cp
                JOIN users u ON u.id = cp.user_id
                WHERE LOWER(cp.location) = LOWER(:localidad)
                  AND u.is_active = true
                  AND cp.status = :approved_status
                  AND cp.embedding IS NOT NULL
                ORDER BY cp.embedding <=> CAST(:embedding AS vector)
                LIMIT 3
            """)
            results = session.execute(sql, {"embedding": embedding_str, "localidad": localidad, "approved_status": ProfileStatus.approved.value}).fetchall()
        else:
            sql = text(f"""
                SELECT cp.id, u.id as user_id, u.full_name, u.photo_url,
                       cp.{specialty_column} AS specialties, cp.location, cp.experience_years,
                       cp.hourly_rate, cp.bio,
                       1 - (cp.embedding <=> CAST(:embedding AS vector)) AS similitud
                FROM {profile_table} cp
                JOIN users u ON u.id = cp.user_id
                WHERE u.is_active = true
                  AND cp.status = :approved_status
                  AND cp.embedding IS NOT NULL
                ORDER BY cp.embedding <=> CAST(:embedding AS vector)
                LIMIT 3
            """)
            results = session.execute(sql, {"embedding": embedding_str, "approved_status": ProfileStatus.approved.value}).fetchall()

    if not results:
        # Retornamos JSON vacío para que el frontend lo sepa
        label = "cuidadores" if tipo_profesional == "caregiver" else "enfermeros"
        return json.dumps({"texto": f"No se encontraron {label} disponibles con esos criterios.", "profesionales": []}, ensure_ascii=False)

    profesionales = []
    texto_lines = []

    for i, row in enumerate(results, 1):
        specialties = row.specialties if isinstance(row.specialties, list) else [str(row.specialties)] if row.specialties else []
        specialties_str = ", ".join(specialties) if specialties else "Cuidado general"

        profesionales.append({
            "user_id": row.user_id,
            "full_name": row.full_name,
            "photo_url": row.photo_url,
            "specialties": specialties,
            "specialty_display": specialties_str,
            "location": row.location,
            "experience_years": row.experience_years,
            "hourly_rate": float(row.hourly_rate),
            "bio": row.bio or "",
            "similitud": float(row.similitud),
            "role": tipo_profesional,
        })

        texto_lines.append(
            f"{i}. **{row.full_name}** — {specialties_str} · {row.location} · "
            f"{row.experience_years} años exp. · ${row.hourly_rate:,.0f}/h"
        )

    texto = "Encontré estos profesionales para ti:\n" + "\n".join(texto_lines)
    return json.dumps({"texto": texto, "profesionales": profesionales}, ensure_ascii=False)


# Alias temporal para consumidores externos que aún usen el nombre anterior.
def buscar_cuidadores_similares(descripcion_paciente: str, localidad: str = None) -> str:
    return buscar_profesionales_similares(descripcion_paciente, "caregiver", localidad)


def obtener_contexto_paciente_asignado(
    booking: Booking,
    clinical_record: ClinicalRecord,
    care_plan: ServiceCarePlan | None = None,
    include_clinical_details: bool = False,
    patient_medications: list | None = None,
) -> dict:
    """Construye contexto mínimo para un profesional autorizado previamente.

    No recibe IDs ni abre una sesión de base de datos: el router es responsable de
    validar relación profesional-servicio-ficha antes de invocar esta herramienta.
    Nunca devuelve dirección, contactos de emergencia, EPS ni aseguramiento. Los
    datos clínicos ampliados se exponen únicamente cuando el router los autoriza
    para el rol de enfermería.
    """
    context = {
        "service": {
            "booking_id": booking.id,
            "date": booking.date,
            "start_hour": booking.start_hour,
            "end_hour": booking.end_hour,
            "professional_role": booking.professional_role,
        },
        "patient": {
            "name": clinical_record.patient_name,
            "age": clinical_record.patient_age,
            "allergies": clinical_record.allergies or [],
            "mobility_level": clinical_record.mobility_level,
            "special_needs": clinical_record.special_needs,
        },
        "care_plan": {
            "medication_schedule": care_plan.medication_schedule or [] if care_plan else [],
            "emergency_protocol": care_plan.emergency_protocol if care_plan else None,
        },
    }

    # Medicamentos activos del paciente registrados por la familia
    if patient_medications:
        meds_context = []
        for m in patient_medications:
            entry = {
                "name": m.name,
                "dose": m.dose,
                "frequency": m.frequency.value if hasattr(m.frequency, "value") else str(m.frequency),
                "schedules": m.schedules or [],
                "instructions": m.instructions,
            }
            if include_clinical_details:
                # Enfermeros ven también el stock y período
                entry["current_stock"] = m.current_stock
                entry["stock_unit"] = m.stock_unit
                entry["restock_alert_threshold"] = m.restock_alert_threshold
                entry["treatment_start_date"] = m.treatment_start_date
                entry["treatment_duration_days"] = m.treatment_duration_days
                entry["low_stock"] = (
                    m.current_stock is not None
                    and m.restock_alert_threshold is not None
                    and m.current_stock <= m.restock_alert_threshold
                )
            meds_context.append(entry)
        context["patient_medications"] = meds_context

    if include_clinical_details:
        context["patient"].update({
            "blood_type": clinical_record.blood_type,
            "diagnoses": clinical_record.diagnoses or [],
            "medications_registered": clinical_record.medications or [],
        })
    return context


# Función auxiliar para obtener el schema de la herramienta (usado por el cliente)
def get_tool_definitions() -> list[dict]:
    """Retorna las definiciones de herramientas en formato compatible con SAI/OpenAI."""
    return [
        {
            "type": "function",
            "name": "buscar_profesionales_similares",
            "function": {
                "name": "buscar_profesionales_similares",
                "description": (
                    "Busca los 3 cuidadores o enfermeros más compatibles con las necesidades "
                    "del paciente usando búsqueda vectorial por similitud coseno. Solo úsala "
                    "cuando la familia haya indicado expresamente el tipo de profesional."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "descripcion_paciente": {
                            "type": "string",
                            "description": (
                                "Descripción completa de las necesidades clínicas y de cuidado. "
                                "Incluir condiciones médicas, tipo de asistencia, horario preferido."
                            ),
                        },
                        "localidad": {
                            "type": "string",
                            "description": (
                                "Localidad de Bogotá donde se necesita el servicio. "
                                "Ej: Usaquén, Chapinero, Suba, Kennedy, Engativá."
                            ),
                        },
                        "tipo_profesional": {
                            "type": "string",
                            "enum": ["caregiver", "nurse"],
                            "description": "Tipo solicitado: caregiver para cuidador/a o nurse para enfermero/a.",
                        },
                    },
                    "required": ["descripcion_paciente", "tipo_profesional"],
                },
            },
        }
    ]


if __name__ == "__main__":
    # Modo standalone: prueba rápida de la herramienta
    result = buscar_profesionales_similares("Paciente con Alzheimer que necesita acompañamiento nocturno", "caregiver", "Usaquén")
    print(result)
