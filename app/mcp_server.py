"""
Servidor MCP (Model Context Protocol) personalizado.
Expone la herramienta buscar_cuidadores_similares para el agente de IA.

Ejecutar standalone: python -m app.mcp_server
"""
import os
from dotenv import load_dotenv
from sqlmodel import Session
from sqlalchemy import text

from app.models import Booking, CaregiverProfile, ClinicalRecord, ServiceCarePlan, User
from app.services.embedding_service import generar_embedding
from app.database import engine

load_dotenv()


import json

def buscar_cuidadores_similares(descripcion_paciente: str, localidad: str = None) -> str:
    """
    Busca los 3 cuidadores más compatibles usando búsqueda vectorial.
    Retorna un JSON serializado con texto narrativo + lista estructurada de profesionales.
    """
    query_embedding = generar_embedding(descripcion_paciente)
    embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

    with Session(engine) as session:
        if localidad:
            sql = text("""
                SELECT cp.id, u.id as user_id, u.full_name, u.photo_url,
                       cp.specialties, cp.location, cp.experience_years,
                       cp.hourly_rate, cp.bio,
                       1 - (cp.embedding <=> CAST(:embedding AS vector)) AS similitud
                FROM caregiver_profiles cp
                JOIN users u ON u.id = cp.user_id
                WHERE LOWER(cp.location) = LOWER(:localidad)
                  AND u.is_active = true
                ORDER BY cp.embedding <=> CAST(:embedding AS vector)
                LIMIT 3
            """)
            results = session.execute(sql, {"embedding": embedding_str, "localidad": localidad}).fetchall()
        else:
            sql = text("""
                SELECT cp.id, u.id as user_id, u.full_name, u.photo_url,
                       cp.specialties, cp.location, cp.experience_years,
                       cp.hourly_rate, cp.bio,
                       1 - (cp.embedding <=> CAST(:embedding AS vector)) AS similitud
                FROM caregiver_profiles cp
                JOIN users u ON u.id = cp.user_id
                WHERE u.is_active = true
                ORDER BY cp.embedding <=> CAST(:embedding AS vector)
                LIMIT 3
            """)
            results = session.execute(sql, {"embedding": embedding_str}).fetchall()

    if not results:
        # Retornamos JSON vacío para que el frontend lo sepa
        return json.dumps({"texto": "No se encontraron cuidadores disponibles con esos criterios.", "profesionales": []})

    profesionales = []
    texto_lines = []

    for i, row in enumerate(results, 1):
        specialties = row.specialties if isinstance(row.specialties, list) else []
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
            "role": "caregiver",
        })

        texto_lines.append(
            f"{i}. **{row.full_name}** — {specialties_str} · {row.location} · "
            f"{row.experience_years} años exp. · ${row.hourly_rate:,.0f}/h"
        )

    texto = "Encontré estos profesionales para ti:\n" + "\n".join(texto_lines)
    return json.dumps({"texto": texto, "profesionales": profesionales}, ensure_ascii=False)


def obtener_contexto_paciente_asignado(
    booking: Booking,
    clinical_record: ClinicalRecord,
    care_plan: ServiceCarePlan | None = None,
    include_clinical_details: bool = False,
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
            "name": "buscar_cuidadores_similares",
            "function": {
                "name": "buscar_cuidadores_similares",
                "description": (
                    "Busca los 3 cuidadores más compatibles con las necesidades del paciente "
                    "usando búsqueda vectorial por similitud coseno. Usa esta herramienta cuando "
                    "la familia describe las necesidades de cuidado del adulto mayor."
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
                    },
                    "required": ["descripcion_paciente"],
                },
            },
        }
    ]


if __name__ == "__main__":
    # Modo standalone: prueba rápida de la herramienta
    result = buscar_cuidadores_similares("Paciente con Alzheimer que necesita acompañamiento nocturno", "Usaquén")
    print(result)
