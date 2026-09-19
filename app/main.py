import os
from pathlib import Path
from dotenv import load_dotenv
from sqlmodel import SQLModel
from sqlalchemy import text
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from contextlib import asynccontextmanager

from app.models import User, CaregiverProfile, ClinicalRecord, NurseProfile, Booking, Availability, Review, ProfessionalVerification, VerificationDocument, ServiceChatMessage, ServiceCarePlan, Notification  # noqa: F401
from app.database import engine
from app.database import get_session
from sqlmodel import Session
from app.auth import get_current_user
from app.routers import auth_router, caregivers_router, clinical_router, admin_router, nurses_router, bookings_router
from app.routers import upload_router, verification_router, service_chat_router, notifications_router, care_plan_router

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Crear carpeta de uploads si no existe
    Path("uploads/profiles").mkdir(parents=True, exist_ok=True)
    # Crear extensión pgvector si no existe
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
    SQLModel.metadata.create_all(engine)
    # Migraciones ligeras para instalaciones existentes sin Alembic.
    with engine.connect() as conn:
        conn.execute(text("DO $$ BEGIN ALTER TYPE verificationdocumenttype ADD VALUE 'additional_certificate'; EXCEPTION WHEN duplicate_object THEN NULL; END $$"))
        conn.execute(text("ALTER TABLE verification_documents ADD COLUMN IF NOT EXISTS document_name VARCHAR(150)"))
        # ``create_all`` no añade columnas a tablas existentes. Mantener aquí las
        # migraciones acumulativas de ClinicalRecord para bases creadas antes de
        # que se añadieran los datos de ubicación estructurada.
        conn.execute(text("ALTER TABLE clinical_records ADD COLUMN IF NOT EXISTS sector VARCHAR(100)"))
        conn.execute(text("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS clinical_record_id INTEGER REFERENCES clinical_records(id)"))
        conn.commit()
    yield


app = FastAPI(
    title="Plataforma Atención Domiciliaria",
    description="API para conectar familias con cuidadores de adultos mayores mediante IA",
    version="0.3.0",
    lifespan=lifespan,
)

# CORS para permitir requests del frontend React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar routers
app.include_router(auth_router.router)
app.include_router(caregivers_router.router)
app.include_router(nurses_router.router)
app.include_router(bookings_router.router)
app.include_router(clinical_router.router)
app.include_router(admin_router.router)
app.include_router(upload_router.router)
app.include_router(verification_router.router)
app.include_router(service_chat_router.router)
app.include_router(notifications_router.router)
app.include_router(care_plan_router.router)

# Servir imágenes subidas como archivos estáticos
app.mount("/uploads/profiles", StaticFiles(directory="uploads/profiles"), name="uploads-profiles")


# --- Schemas ---

class ChatRequest(BaseModel):
    mensaje: str
    localidad: str | None = None


# --- Endpoints base ---

@app.get("/health")
def health_check():
    return {"status": "ok", "version": "0.3.0"}


# --- Endpoint del Chatbot (SAI Applications) ---

@app.post("/api/chat")
def chat_con_sai(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Endpoint principal del chatbot.
    Carga las fichas del familiar autenticado y las pasa al agente.
    Retorna: { respuesta: str, profesionales: list }
    """
    from app.services.ai_agent import conversar
    from app.models import ClinicalRecord
    from sqlmodel import select

    # Cargar fichas del familiar si el rol es family
    familiares = []
    if current_user.role.value == "family":
        records = session.exec(
            select(ClinicalRecord).where(ClinicalRecord.family_user_id == current_user.id)
        ).all()
        familiares = [
            {
                "patient_name":     r.patient_name,
                "patient_age":      r.patient_age,
                "blood_type":       r.blood_type,
                "diagnoses":        r.diagnoses or [],
                "medications":      r.medications or [],
                "allergies":        r.allergies or [],
                "mobility_level":   r.mobility_level,
                "special_needs":    r.special_needs,
                "emergency_contact":r.emergency_contact,
                "eps":              r.eps,
                "prepaid_medicine": r.prepaid_medicine,
                "preferred_hospital": r.preferred_hospital,
                "address":          r.address,
                "neighborhood":     r.neighborhood,
                "city":             r.city,
                "floor_number":     r.floor_number,
                "is_apartment":     r.is_apartment,
                "has_elevator":     r.has_elevator,
            }
            for r in records
        ]

    try:
        result = conversar(request.mensaje, familiares=familiares)
        return {"respuesta": result["texto"], "profesionales": result["profesionales"]}
    except Exception as e:
        # La recomendación local sigue disponible aunque el proveedor conversacional
        # externo no responda o devuelva una respuesta no compatible.
        try:
            import json
            from app.mcp_server import buscar_cuidadores_similares

            raw = buscar_cuidadores_similares(
                descripcion_paciente=request.mensaje,
                localidad=request.localidad,
            )
            parsed = json.loads(raw)
            return {
                "respuesta": (
                    "No fue posible consultar el asistente conversacional en este momento. "
                    + parsed.get("texto", "Encontré estas recomendaciones locales.")
                ),
                "profesionales": parsed.get("profesionales", []),
            }
        except Exception as fallback_error:
            raise HTTPException(
                status_code=503,
                detail="El asistente no está disponible temporalmente. "
                f"Error del proveedor: {str(e)}. Error local: {str(fallback_error)}",
            )


@app.post("/api/chat/local")
def chat_local(request: ChatRequest):
    """
    Endpoint de búsqueda directa (sin SAI).
    Ejecuta búsqueda vectorial directa en pgvector.
    Retorna: { respuesta: str, profesionales: list }
    """
    import json
    from app.mcp_server import buscar_cuidadores_similares

    try:
        raw = buscar_cuidadores_similares(
            descripcion_paciente=request.mensaje,
            localidad=request.localidad,
        )
        try:
            parsed = json.loads(raw)
            return {"respuesta": parsed.get("texto", raw), "profesionales": parsed.get("profesionales", [])}
        except (json.JSONDecodeError, AttributeError):
            return {"respuesta": raw, "profesionales": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en búsqueda: {str(e)}")
