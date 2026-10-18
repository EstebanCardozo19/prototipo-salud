import os
import threading
import logging
from pathlib import Path
from dotenv import load_dotenv
from sqlmodel import SQLModel, select
from sqlalchemy import text
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager

from app.models import User, CaregiverProfile, ClinicalRecord, ClinicalRecordDocument, NurseProfile, Booking, Availability, Review, ProfessionalVerification, VerificationDocument, ServiceChatMessage, ServiceCarePlan, ProfessionalAssistantAuditLog, Notification, PushSubscription, MedicationReminderDelivery, MedicalAppointment, AppointmentReminderDelivery, PatientMedication, CancelledServiceComment, CancelledServiceCommentReport  # noqa: F401
from app.database import engine
from app.database import get_session
from sqlmodel import Session
from app.auth import get_current_user, validate_authentication_configuration
from app.security.encryption import (
    encrypt_bytes, encrypt_text, is_encrypted, user_email_lookup,
    validate_encryption_configuration,
)
from app.routers import auth_router, caregivers_router, clinical_router, admin_router, nurses_router, bookings_router
from app.routers import upload_router, verification_router, service_chat_router, notifications_router, care_plan_router, professional_assistant_router, appointments_router, medications_router

load_dotenv()


SERVICE_LIFECYCLE_INTERVAL_SECONDS = 60
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_authentication_configuration()
    validate_encryption_configuration()
    if os.getenv("PRELOAD_EMBEDDING_MODEL", "").lower() in {"1", "true", "yes"}:
        from app.services.embedding_service import precargar_modelo

        logger.info("Precargando el modelo local de embeddings.")
        precargar_modelo()
        logger.info("Modelo local de embeddings listo.")
    # Crear carpeta de uploads si no existe
    Path("uploads/profiles").mkdir(parents=True, exist_ok=True)
    Path("private_uploads/clinical_records").mkdir(parents=True, exist_ok=True)
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
        conn.execute(text("ALTER TABLE clinical_records ADD COLUMN IF NOT EXISTS takes_medications BOOLEAN NOT NULL DEFAULT FALSE"))
        # Las fichas previas que ya tienen un listado conservan correctamente el
        # estado afirmativo al incorporar esta preferencia explícita.
        conn.execute(text("UPDATE clinical_records SET takes_medications = TRUE WHERE medications IS NOT NULL"))
        conn.execute(text("ALTER TABLE clinical_records ADD COLUMN IF NOT EXISTS allow_professional_document_access BOOLEAN NOT NULL DEFAULT FALSE"))
        conn.execute(text("ALTER TABLE clinical_record_documents ADD COLUMN IF NOT EXISTS extracted_text TEXT"))
        conn.execute(text("ALTER TABLE nurse_profiles ADD COLUMN IF NOT EXISTS embedding vector(384)"))
        conn.execute(text("ALTER TABLE caregiver_profiles ADD COLUMN IF NOT EXISTS coverage_localities JSON NOT NULL DEFAULT '[]'::json"))
        conn.execute(text("ALTER TABLE caregiver_profiles ADD COLUMN IF NOT EXISTS covers_all_bogota BOOLEAN NOT NULL DEFAULT FALSE"))
        conn.execute(text("ALTER TABLE nurse_profiles ADD COLUMN IF NOT EXISTS coverage_localities JSON NOT NULL DEFAULT '[]'::json"))
        conn.execute(text("ALTER TABLE nurse_profiles ADD COLUMN IF NOT EXISTS covers_all_bogota BOOLEAN NOT NULL DEFAULT FALSE"))
        # BUG-001: 5.0 no representa una valoración real cuando el contador es
        # cero. Reconciliar los acumulados desde ``reviews`` conserva todas las
        # reseñas existentes y también corrige perfiles creados antes del fix.
        # Las instalaciones previas crearon esta columna como NOT NULL; se debe
        # eliminar primero esa restricción para que AVG pueda representar la
        # ausencia de reseñas con NULL, no con una valoración ficticia de 0 o 5.
        conn.execute(text("ALTER TABLE caregiver_profiles ALTER COLUMN rating_avg DROP NOT NULL"))
        conn.execute(text("ALTER TABLE nurse_profiles ALTER COLUMN rating_avg DROP NOT NULL"))
        conn.execute(text("ALTER TABLE caregiver_profiles ALTER COLUMN rating_avg DROP DEFAULT"))
        conn.execute(text("ALTER TABLE nurse_profiles ALTER COLUMN rating_avg DROP DEFAULT"))
        conn.execute(text("""
            UPDATE caregiver_profiles AS profile
            SET rating_count = summary.count,
                rating_avg = summary.average
            FROM (
                SELECT profile_row.id,
                       COUNT(review.id)::INTEGER AS count,
                       ROUND(AVG(review.rating)::NUMERIC, 2)::FLOAT AS average
                FROM caregiver_profiles AS profile_row
                LEFT JOIN reviews AS review ON review.professional_user_id = profile_row.user_id
                GROUP BY profile_row.id
            ) AS summary
            WHERE profile.id = summary.id
        """))
        conn.execute(text("""
            UPDATE nurse_profiles AS profile
            SET rating_count = summary.count,
                rating_avg = summary.average
            FROM (
                SELECT profile_row.id,
                       COUNT(review.id)::INTEGER AS count,
                       ROUND(AVG(review.rating)::NUMERIC, 2)::FLOAT AS average
                FROM nurse_profiles AS profile_row
                LEFT JOIN reviews AS review ON review.professional_user_id = profile_row.user_id
                GROUP BY profile_row.id
            ) AS summary
            WHERE profile.id = summary.id
        """))
        conn.execute(text("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS clinical_record_id INTEGER REFERENCES clinical_records(id)"))
        conn.execute(text("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS location_sharing_preference VARCHAR(30) NOT NULL DEFAULT 'locality_neighborhood'"))
        # HU-034: migración acumulativa y no destructiva de la auditoría de
        # cancelación de servicios ya aceptados.
        conn.execute(text("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(500)"))
        conn.execute(text("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by_user_id INTEGER REFERENCES users(id)"))
        conn.execute(text("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE"))
        # HU-021: tablas creadas por ``create_all`` en instalaciones nuevas; estas
        # sentencias son acumulativas para las bases existentes y no modifican datos.
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS cancelled_service_comments (
                id SERIAL PRIMARY KEY,
                booking_id INTEGER NOT NULL REFERENCES bookings(id),
                author_user_id INTEGER NOT NULL REFERENCES users(id),
                comment TEXT NOT NULL,
                is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                CONSTRAINT uq_cancelled_comment_booking_author UNIQUE (booking_id, author_user_id)
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_cancelled_service_comments_booking_id ON cancelled_service_comments (booking_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_cancelled_service_comments_author_user_id ON cancelled_service_comments (author_user_id)"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS cancelled_service_comment_reports (
                id SERIAL PRIMARY KEY,
                comment_id INTEGER NOT NULL REFERENCES cancelled_service_comments(id),
                reporter_user_id INTEGER NOT NULL REFERENCES users(id),
                reason VARCHAR(300) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                CONSTRAINT uq_cancelled_comment_reporter UNIQUE (comment_id, reporter_user_id)
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_cancelled_service_comment_reports_comment_id ON cancelled_service_comment_reports (comment_id)"))
        conn.execute(text("DO $$ BEGIN CREATE TYPE appointmentaccompanimentstatus AS ENUM ('none', 'pending', 'accepted', 'rejected', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$"))
        conn.execute(text("DO $$ BEGIN CREATE TYPE appointmentstatus AS ENUM ('scheduled', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$"))
        conn.execute(text("ALTER TABLE medical_appointments ADD COLUMN IF NOT EXISTS document_ids JSON NOT NULL DEFAULT '[]'::json"))
        conn.execute(text("ALTER TABLE medical_appointments ADD COLUMN IF NOT EXISTS pending_documents JSON NOT NULL DEFAULT '[]'::json"))
        conn.execute(text("ALTER TABLE medical_appointments ADD COLUMN IF NOT EXISTS status appointmentstatus NOT NULL DEFAULT 'scheduled'"))
        conn.execute(text("ALTER TABLE medical_appointments ADD COLUMN IF NOT EXISTS outcome_notes VARCHAR(1500)"))
        conn.execute(text("ALTER TABLE medical_appointments ADD COLUMN IF NOT EXISTS medical_recommendations VARCHAR(1500)"))
        conn.execute(text("ALTER TABLE medical_appointments ADD COLUMN IF NOT EXISTS follow_up_pending BOOLEAN NOT NULL DEFAULT FALSE"))
        conn.execute(text("ALTER TABLE medical_appointments ADD COLUMN IF NOT EXISTS follow_up_notes VARCHAR(1000)"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS appointment_reminder_deliveries (
                id SERIAL PRIMARY KEY,
                appointment_id INTEGER NOT NULL REFERENCES medical_appointments(id),
                reminder_type VARCHAR(30) NOT NULL,
                delivered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                CONSTRAINT uq_appointment_reminder_delivery UNIQUE (appointment_id, reminder_type)
            )
        """))
        # El cifrado Fernet ocupa más espacio que los tipos históricos y los JSON
        # deben pasar a texto antes de almacenar su representación cifrada.
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_lookup VARCHAR(64)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS security_question_1 VARCHAR(100)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS security_answer_1_hash VARCHAR(255)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS security_question_2 VARCHAR(100)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS security_answer_2_hash VARCHAR(255)"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email_lookup ON users (email_lookup)"))
        for column in ("email", "full_name"):
            conn.execute(text(f"ALTER TABLE users ALTER COLUMN {column} TYPE TEXT"))
        for column in (
            "patient_name", "diagnoses", "medications", "allergies", "mobility_level", "special_needs",
            "emergency_contact", "address", "neighborhood", "sector", "city", "housing_notes", "eps",
            "prepaid_medicine", "preferred_hospital", "blood_type",
        ):
            conn.execute(text(f"ALTER TABLE clinical_records ALTER COLUMN {column} TYPE TEXT USING {column}::text"))
        # ``create_all`` crea esta tabla en instalaciones nuevas; esta sentencia
        # cubre instalaciones existentes, donde create_all no altera el esquema.
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS professional_assistant_audit_logs (
                id SERIAL PRIMARY KEY,
                professional_user_id INTEGER NOT NULL REFERENCES users(id),
                booking_id INTEGER NOT NULL REFERENCES bookings(id),
                clinical_record_id INTEGER NOT NULL REFERENCES clinical_records(id),
                action VARCHAR(50) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_professional_assistant_audit_logs_professional_user_id ON professional_assistant_audit_logs (professional_user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_professional_assistant_audit_logs_booking_id ON professional_assistant_audit_logs (booking_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_professional_assistant_audit_logs_clinical_record_id ON professional_assistant_audit_logs (clinical_record_id)"))
        # Tabla de medicamentos permanentes del paciente
        conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE medicationfrequency AS ENUM (
                    'every_4h','every_6h','every_8h','every_12h','every_24h',
                    'twice_daily','three_daily','four_daily','as_needed','custom'
                );
            EXCEPTION WHEN duplicate_object THEN NULL; END $$
        """))
        conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE medicationstatus AS ENUM ('active','proposed','suspended','rejected');
            EXCEPTION WHEN duplicate_object THEN NULL; END $$
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS patient_medications (
                id SERIAL PRIMARY KEY,
                clinical_record_id INTEGER NOT NULL REFERENCES clinical_records(id),
                name VARCHAR(200) NOT NULL,
                dose VARCHAR(100) NOT NULL,
                frequency medicationfrequency NOT NULL,
                schedules JSON,
                instructions VARCHAR(500),
                current_stock INTEGER,
                stock_unit VARCHAR(50),
                restock_alert_threshold INTEGER,
                treatment_start_date VARCHAR(10),
                treatment_duration_days INTEGER,
                status medicationstatus NOT NULL DEFAULT 'active',
                created_by_user_id INTEGER NOT NULL REFERENCES users(id),
                proposed_by_user_id INTEGER REFERENCES users(id),
                approved_by_user_id INTEGER REFERENCES users(id),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_patient_medications_clinical_record_id ON patient_medications (clinical_record_id)"))
        # Migración: hacer booking_id opcional en medication_reminder_deliveries
        # y añadir patient_medication_id para rastrear medicamentos permanentes
        conn.execute(text("ALTER TABLE medication_reminder_deliveries ALTER COLUMN booking_id DROP NOT NULL"))
        conn.execute(text("ALTER TABLE medication_reminder_deliveries ADD COLUMN IF NOT EXISTS patient_medication_id INTEGER REFERENCES patient_medications(id)"))
        # Recrea el constraint único sin booking_id obligatorio
        conn.execute(text("ALTER TABLE medication_reminder_deliveries DROP CONSTRAINT IF EXISTS uq_medication_reminder_delivery"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_medication_reminder_delivery ON medication_reminder_deliveries (schedule_key, reminder_date)"))
        conn.commit()
    _migrate_sensitive_data()
    # Cierra automáticamente los servicios aprobados 30 minutos después de su hora
    # de finalización. Cada ejecución usa una sesión independiente y el cierre es
    # idempotente, por lo que es seguro si hay más de una instancia de la API.
    from app.services.service_lifecycle import complete_expired_services
    from app.services.medication_reminders import dispatch_due_medication_reminders
    from app.services.appointment_reminders import dispatch_due_appointment_reminders

    stop_service_lifecycle = threading.Event()

    def run_service_lifecycle() -> None:
        while not stop_service_lifecycle.is_set():
            try:
                with Session(engine) as lifecycle_session:
                    complete_expired_services(lifecycle_session)
                    dispatch_due_medication_reminders(lifecycle_session)
                    dispatch_due_appointment_reminders(lifecycle_session)
            except Exception:
                # El ciclo se reintentará en el siguiente minuto sin afectar la API.
                pass
            stop_service_lifecycle.wait(SERVICE_LIFECYCLE_INTERVAL_SECONDS)

    lifecycle_thread = threading.Thread(
        target=run_service_lifecycle,
        name="service-lifecycle",
        daemon=True,
    )
    lifecycle_thread.start()
    yield
    stop_service_lifecycle.set()
    lifecycle_thread.join(timeout=SERVICE_LIFECYCLE_INTERVAL_SECONDS + 1)


def _migrate_sensitive_data() -> None:
    """Cifra instalaciones existentes sin volver a cifrar datos ya protegidos."""
    from sqlalchemy.orm.attributes import flag_modified
    from app.models import UserRole

    encrypted_record_fields = (
        "patient_name", "diagnoses", "medications", "allergies", "mobility_level", "special_needs",
        "emergency_contact", "address", "neighborhood", "sector", "city", "housing_notes", "eps",
        "prepaid_medicine", "preferred_hospital", "blood_type",
    )
    document_dir = Path("private_uploads/clinical_records")
    with Session(engine) as session:
        family_users = session.exec(
            select(User).where(User.role == UserRole.family).order_by(User.id)
        ).all()
        seen_lookups = {}
        for user in family_users:
            # El email puede estar cifrado; el HMAC siempre debe calcularse sobre
            # su valor normalizado en claro para que el login pueda localizarlo.
            lookup = user_email_lookup(user)
            existing_user_id = seen_lookups.get(lookup)
            if existing_user_id is not None:
                # Las instalaciones anteriores permitían duplicados porque el
                # índice se calculaba erróneamente sobre el texto cifrado. No es
                # posible autenticar dos cuentas con el mismo correo: se conserva
                # la cuenta más antigua y se deja la posterior sin índice para
                # evitar que la migración impida iniciar la API.
                user.email_lookup = None
                logger.warning(
                    "Cuenta familiar duplicada detectada durante la migración: "
                    "se conserva user_id=%s y se requiere revisar user_id=%s.",
                    existing_user_id,
                    user.id,
                )
            else:
                seen_lookups[lookup] = user.id
                user.email_lookup = lookup
            if not is_encrypted(user.email):
                user.email = encrypt_text(user.email)
            if not is_encrypted(user.full_name):
                user.full_name = encrypt_text(user.full_name)
            session.add(user)
        for record in session.exec(select(ClinicalRecord)).all():
            for field in encrypted_record_fields:
                # El TypeDecorator convierte el valor heredado a claro. Marcamos el
                # campo para forzar su serialización cifrada en el UPDATE.
                setattr(record, field, getattr(record, field))
                flag_modified(record, field)
            session.add(record)
        for document in session.exec(select(ClinicalRecordDocument)).all():
            path = document_dir / document.stored_filename
            if path.exists():
                content = path.read_bytes()
                if not content.startswith(b"gAAAA"):
                    path.write_bytes(encrypt_bytes(content))
        session.commit()


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
app.include_router(professional_assistant_router.router)
app.include_router(appointments_router.router)
app.include_router(medications_router.router)

# Servir imágenes subidas como archivos estáticos
app.mount("/uploads/profiles", StaticFiles(directory="uploads/profiles"), name="uploads-profiles")


# --- Schemas ---

class ChatRequest(BaseModel):
    mensaje: str
    localidad: str | None = None
    historial: list[dict[str, str]] = Field(default_factory=list, max_length=12)


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
        result = conversar(
            request.mensaje,
            historial=request.historial,
            familiares=familiares,
        )
        return {"respuesta": result["texto"], "profesionales": result["profesionales"]}
    except Exception as e:
        # La recomendación local sigue disponible aunque el proveedor conversacional
        # externo no responda o devuelva una respuesta no compatible.
        try:
            import json
            from app.mcp_server import buscar_profesionales_similares

            raw = buscar_profesionales_similares(
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
    from app.mcp_server import buscar_profesionales_similares

    try:
        raw = buscar_profesionales_similares(
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
