import enum
from typing import Optional, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, String, Enum as SAEnum, JSON, DateTime, Text, UniqueConstraint, func
from pgvector.sqlalchemy import Vector
from app.security.encryption import EncryptedJSON, EncryptedText


class UserRole(str, enum.Enum):
    family = "family"
    caregiver = "caregiver"
    nurse = "nurse"
    admin = "admin"


class NurseSpecialty(str, enum.Enum):
    general = "general"
    geriatrics = "geriatrics"           # Geriatría
    neurology = "neurology"             # Neurología
    cardiology = "cardiology"           # Cardiología
    pulmonology = "pulmonology"         # Neumología
    psychiatry = "psychiatry"           # Psiquiatría
    physiatry = "physiatry"             # Medicina física y rehabilitación
    palliative = "palliative"           # Cuidados paliativos
    internal_medicine = "internal_medicine"  # Medicina interna
    endocrinology = "endocrinology"     # Endocrinología
    nephrology = "nephrology"           # Nefrología
    orthopedics = "orthopedics"         # Ortopedia


class ProfileStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"

class VerificationDocumentType(str, enum.Enum):
    identity = "identity"
    training = "training"
    work_reference = "work_reference"
    professional_license = "professional_license"
    nursing_degree = "nursing_degree"
    additional_certificate = "additional_certificate"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(sa_column=Column(Text, unique=True, nullable=False, index=True))
    # Índice HMAC no reversible para cuentas familiares cifradas.
    email_lookup: Optional[str] = Field(default=None, sa_column=Column(String(64), unique=True, index=True, nullable=True))
    password_hash: str = Field(max_length=255)
    # Se guardan identificadores de preguntas predefinidas y hashes bcrypt de
    # respuestas normalizadas; nunca las respuestas en texto plano.
    security_question_1: Optional[str] = Field(default=None, max_length=100)
    security_answer_1_hash: Optional[str] = Field(default=None, max_length=255)
    security_question_2: Optional[str] = Field(default=None, max_length=100)
    security_answer_2_hash: Optional[str] = Field(default=None, max_length=255)
    full_name: str = Field(sa_column=Column(Text, nullable=False))
    role: UserRole = Field(sa_column=Column(SAEnum(UserRole, name="userrole"), nullable=False))
    is_active: bool = Field(default=True)
    photo_url: Optional[str] = Field(default=None, max_length=500)
    phone: Optional[str] = Field(default=None, sa_column=Column(EncryptedText, nullable=True))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )

    caregiver_profile: Optional["CaregiverProfile"] = Relationship(back_populates="user")
    nurse_profile: Optional["NurseProfile"] = Relationship(back_populates="user")
    clinical_records: List["ClinicalRecord"] = Relationship(back_populates="family_user")


class CaregiverProfile(SQLModel, table=True):
    __tablename__ = "caregiver_profiles"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", unique=True, nullable=False)
    experience_years: int = Field(default=0)
    specialties: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    hourly_rate: float = Field(default=0.0)
    location: str = Field(max_length=100)
    # La localidad primaria se conserva para el mapa; la cobertura es independiente.
    coverage_localities: List[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    covers_all_bogota: bool = Field(default=False, nullable=False)
    bio: Optional[str] = Field(default=None, max_length=500)
    status: ProfileStatus = Field(
        default=ProfileStatus.pending,
        sa_column=Column(SAEnum(ProfileStatus, name="profilestatus"), nullable=False, server_default="pending")
    )
    embedding: Optional[List[float]] = Field(
        default=None,
        sa_column=Column(Vector(384))
    )
    # Rating agregado; None significa que todavía no tiene reseñas.
    rating_avg: Optional[float] = Field(default=None)
    rating_count: int = Field(default=0)

    user: Optional[User] = Relationship(back_populates="caregiver_profile")

class ProfessionalVerification(SQLModel, table=True):
    __tablename__ = "professional_verifications"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", unique=True, nullable=False)
    role: UserRole = Field(sa_column=Column(SAEnum(UserRole, name="verificationuserrole"), nullable=False))
    status: ProfileStatus = Field(default=ProfileStatus.pending, sa_column=Column(SAEnum(ProfileStatus, name="verificationstatus"), nullable=False, server_default="pending"))
    submitted_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True)))
    reviewed_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True)))
    reviewed_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    rejection_reason: Optional[str] = Field(default=None, max_length=500)

class VerificationDocument(SQLModel, table=True):
    __tablename__ = "verification_documents"
    id: Optional[int] = Field(default=None, primary_key=True)
    verification_id: int = Field(foreign_key="professional_verifications.id", nullable=False)
    document_type: VerificationDocumentType = Field(sa_column=Column(SAEnum(VerificationDocumentType, name="verificationdocumenttype"), nullable=False))
    document_name: Optional[str] = Field(default=None, max_length=150)
    original_filename: str = Field(max_length=255)
    stored_filename: str = Field(max_length=255, unique=True)
    content_type: str = Field(max_length=100)
    size_bytes: int
    uploaded_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), server_default=func.now()))


class ClinicalRecord(SQLModel, table=True):
    """Historia clínica del adulto mayor asociado a una familia."""
    __tablename__ = "clinical_records"

    id: Optional[int] = Field(default=None, primary_key=True)
    family_user_id: int = Field(foreign_key="users.id", nullable=False)

    # ── Datos básicos del paciente ───────────────────────────────
    patient_name: str = Field(sa_column=Column(EncryptedText, nullable=False))
    patient_age: int = Field(default=0)
    diagnoses: Optional[List[str]] = Field(default=None, sa_column=Column(EncryptedJSON))
    takes_medications: bool = Field(default=False, nullable=False)
    medications: Optional[List[str]] = Field(default=None, sa_column=Column(EncryptedJSON))
    allergies: Optional[List[str]] = Field(default=None, sa_column=Column(EncryptedJSON))
    mobility_level: Optional[str] = Field(default=None, sa_column=Column(EncryptedText))
    special_needs: Optional[str] = Field(default=None, sa_column=Column(EncryptedText))
    emergency_contact: Optional[str] = Field(default=None, sa_column=Column(EncryptedText))

    # ── Dirección y características de la vivienda ───────────────
    address: Optional[str] = Field(default=None, sa_column=Column(EncryptedText))
    neighborhood: Optional[str] = Field(default=None, sa_column=Column(EncryptedText))
    sector: Optional[str] = Field(default=None, sa_column=Column(EncryptedText))
    city: Optional[str] = Field(default=None, sa_column=Column(EncryptedText))
    floor_number: Optional[int] = Field(default=None)                     # Piso (null = planta baja)
    is_apartment: Optional[bool] = Field(default=None)                    # True=apartamento, False=casa
    has_elevator: Optional[bool] = Field(default=None)                    # ¿Tiene ascensor?
    housing_notes: Optional[str] = Field(default=None, sa_column=Column(EncryptedText))

    # ── Información médico-administrativa ────────────────────────
    eps: Optional[str] = Field(default=None, sa_column=Column(EncryptedText))
    prepaid_medicine: Optional[str] = Field(default=None, sa_column=Column(EncryptedText))
    preferred_hospital: Optional[str] = Field(default=None, sa_column=Column(EncryptedText))
    blood_type: Optional[str] = Field(default=None, sa_column=Column(EncryptedText))
    # Consentimiento explícito de la familia para usar adjuntos con el asistente
    # del profesional asignado durante un servicio activo.
    allow_professional_document_access: bool = Field(default=False, nullable=False)

    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    )

    family_user: Optional[User] = Relationship(back_populates="clinical_records")


class ClinicalRecordDocument(SQLModel, table=True):
    """Archivo clínico privado adjuntado a la ficha de un paciente."""
    __tablename__ = "clinical_record_documents"

    id: Optional[int] = Field(default=None, primary_key=True)
    clinical_record_id: int = Field(foreign_key="clinical_records.id", nullable=False, index=True)
    original_filename: str = Field(max_length=255)
    stored_filename: str = Field(max_length=255, unique=True)
    content_type: str = Field(max_length=100)
    size_bytes: int
    # El texto extraído se guarda cifrado; nunca se expone en listados o descargas.
    extracted_text: Optional[str] = Field(default=None, sa_column=Column(EncryptedText))
    uploaded_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class NurseProfile(SQLModel, table=True):
    """Perfil de enfermero/a con especialidad y datos profesionales."""
    __tablename__ = "nurse_profiles"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", unique=True, nullable=False)
    specialty: NurseSpecialty = Field(
        sa_column=Column(SAEnum(NurseSpecialty, name="nursespecialty"), nullable=False)
    )
    license_number: str = Field(max_length=50)
    institution: Optional[str] = Field(default=None, max_length=200)
    experience_years: int = Field(default=0)
    bio: Optional[str] = Field(default=None, max_length=500)
    location: str = Field(max_length=100)
    coverage_localities: List[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    covers_all_bogota: bool = Field(default=False, nullable=False)
    hourly_rate: float = Field(default=0.0)
    # Permite recomendar enfermeros con la misma búsqueda semántica usada para
    # cuidadores. Las instalaciones existentes se actualizan en el lifespan.
    embedding: Optional[List[float]] = Field(
        default=None,
        sa_column=Column(Vector(384))
    )
    status: ProfileStatus = Field(
        default=ProfileStatus.pending,
        sa_column=Column(SAEnum(ProfileStatus, name="profilestatus", create_type=False), nullable=False, server_default="pending")
    )
    # Rating agregado; None significa que todavía no tiene reseñas.
    rating_avg: Optional[float] = Field(default=None)
    rating_count: int = Field(default=0)
    embedding: Optional[List[float]] = Field(
        default=None,
        sa_column=Column(Vector(384))
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )

    user: Optional[User] = Relationship(back_populates="nurse_profile")


# ============================================================
# Disponibilidad horaria (para cuidadores y médicos)
# ============================================================

class DayOfWeek(str, enum.Enum):
    monday = "monday"
    tuesday = "tuesday"
    wednesday = "wednesday"
    thursday = "thursday"
    friday = "friday"
    saturday = "saturday"
    sunday = "sunday"


class Availability(SQLModel, table=True):
    """Horarios disponibles de un profesional (médico o cuidador)."""
    __tablename__ = "availability"

    id: Optional[int] = Field(default=None, primary_key=True)
    professional_user_id: int = Field(foreign_key="users.id", nullable=False)
    day_of_week: DayOfWeek = Field(sa_column=Column(SAEnum(DayOfWeek, name="dayofweek"), nullable=False))
    start_hour: int = Field(default=8)   # Hora inicio (0-23)
    end_hour: int = Field(default=17)    # Hora fin (0-23)
    is_active: bool = Field(default=True)


# ============================================================
# Solicitudes de contratación
# ============================================================

class BookingStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    completed = "completed"
    cancelled = "cancelled"


class Booking(SQLModel, table=True):
    """Solicitud de contratación de un familiar hacia un profesional."""
    __tablename__ = "bookings"

    id: Optional[int] = Field(default=None, primary_key=True)
    family_user_id: int = Field(foreign_key="users.id", nullable=False)
    clinical_record_id: Optional[int] = Field(default=None, foreign_key="clinical_records.id")
    professional_user_id: int = Field(foreign_key="users.id", nullable=False)
    professional_role: str = Field(max_length=20)  # "caregiver" o "doctor"
    date: str = Field(max_length=10)  # YYYY-MM-DD
    start_hour: int = Field(default=8)
    end_hour: int = Field(default=12)
    notes: Optional[str] = Field(default=None, max_length=500)  # Descripción de necesidades
    # La opción restrictiva es el valor predeterminado: la dirección exacta
    # solo se comparte antes de aceptar el servicio con autorización expresa.
    location_sharing_preference: str = Field(default="locality_neighborhood", max_length=30)
    status: BookingStatus = Field(
        default=BookingStatus.pending,
        sa_column=Column(SAEnum(BookingStatus, name="bookingstatus"), nullable=False, server_default="pending")
    )
    rejection_reason: Optional[str] = Field(default=None, max_length=300)
    # Auditoría de la cancelación posterior a una aceptación. Se conserva en la
    # misma reserva para que ambas partes vean el motivo y quién realizó la acción.
    cancellation_reason: Optional[str] = Field(default=None, max_length=500)
    cancelled_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    cancelled_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )


# ============================================================
# Citas médicas y acompañamiento
# ============================================================

class AppointmentAccompanimentStatus(str, enum.Enum):
    none = "none"
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"
    cancelled = "cancelled"


class AppointmentStatus(str, enum.Enum):
    scheduled = "scheduled"
    completed = "completed"
    cancelled = "cancelled"


class MedicalAppointment(SQLModel, table=True):
    """Cita médica registrada por una familia para uno de sus pacientes."""
    __tablename__ = "medical_appointments"

    id: Optional[int] = Field(default=None, primary_key=True)
    family_user_id: int = Field(foreign_key="users.id", nullable=False, index=True)
    clinical_record_id: int = Field(foreign_key="clinical_records.id", nullable=False, index=True)
    appointment_type: str = Field(max_length=120)
    date: str = Field(max_length=10, index=True)  # YYYY-MM-DD
    time: str = Field(max_length=5)  # HH:MM
    location: Optional[str] = Field(default=None, max_length=250)
    treating_professional: Optional[str] = Field(default=None, max_length=150)
    notes: Optional[str] = Field(default=None, max_length=1000)
    document_ids: List[int] = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    pending_documents: List[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    status: AppointmentStatus = Field(
        default=AppointmentStatus.scheduled,
        sa_column=Column(SAEnum(AppointmentStatus, name="appointmentstatus"), nullable=False, server_default="scheduled"),
    )
    outcome_notes: Optional[str] = Field(default=None, max_length=1500)
    medical_recommendations: Optional[str] = Field(default=None, max_length=1500)
    follow_up_pending: bool = Field(default=False, nullable=False)
    follow_up_notes: Optional[str] = Field(default=None, max_length=1000)
    recurrence_frequency: Optional[str] = Field(default=None, max_length=20)  # weekly | monthly
    recurrence_group_id: Optional[str] = Field(default=None, max_length=36, index=True)
    accompaniment_required: bool = Field(default=False, nullable=False)
    accompaniment_professional_user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    accompaniment_status: AppointmentAccompanimentStatus = Field(
        default=AppointmentAccompanimentStatus.none,
        sa_column=Column(
            SAEnum(AppointmentAccompanimentStatus, name="appointmentaccompanimentstatus"),
            nullable=False,
            server_default="none",
        ),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )


class AppointmentReminderDelivery(SQLModel, table=True):
    """Evita repetir recordatorios internos de preparación y asistencia."""
    __tablename__ = "appointment_reminder_deliveries"
    __table_args__ = (UniqueConstraint("appointment_id", "reminder_type", name="uq_appointment_reminder_delivery"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    appointment_id: int = Field(foreign_key="medical_appointments.id", nullable=False, index=True)
    reminder_type: str = Field(max_length=30)
    delivered_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


# ============================================================
# Chat de servicio
# ============================================================

class ServiceChatMessage(SQLModel, table=True):
    """Mensaje privado intercambiado durante una solicitud aprobada."""
    __tablename__ = "service_chat_messages"

    id: Optional[int] = Field(default=None, primary_key=True)
    booking_id: int = Field(foreign_key="bookings.id", nullable=False, index=True)
    sender_user_id: int = Field(foreign_key="users.id", nullable=False, index=True)
    content: str = Field(max_length=1000)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )


# ============================================================
# Plan documental del servicio
# ============================================================

class ServiceCarePlan(SQLModel, table=True):
    """Pautas documentales ingresadas por el profesional para un servicio activo."""
    __tablename__ = "service_care_plans"

    id: Optional[int] = Field(default=None, primary_key=True)
    booking_id: int = Field(foreign_key="bookings.id", nullable=False, unique=True, index=True)
    professional_user_id: int = Field(foreign_key="users.id", nullable=False, index=True)
    medication_schedule: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))
    emergency_protocol: Optional[str] = Field(default=None, max_length=3000)
    treating_physician_contact: Optional[str] = Field(default=None, max_length=500)
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    )


# ============================================================
# Auditoría de acceso del asistente profesional
# ============================================================

class ProfessionalAssistantAuditLog(SQLModel, table=True):
    """Audita accesos al asistente sin guardar el contenido sensible de la consulta."""
    __tablename__ = "professional_assistant_audit_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    professional_user_id: int = Field(foreign_key="users.id", nullable=False, index=True)
    booking_id: int = Field(foreign_key="bookings.id", nullable=False, index=True)
    clinical_record_id: int = Field(foreign_key="clinical_records.id", nullable=False, index=True)
    action: str = Field(max_length=50)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )


# ============================================================
# Notificaciones internas
# ============================================================

class Notification(SQLModel, table=True):
    """Alerta persistente que se muestra únicamente dentro de la aplicación."""
    __tablename__ = "notifications"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", nullable=False, index=True)
    type: str = Field(max_length=50)
    title: str = Field(max_length=150)
    body: str = Field(max_length=500)
    booking_id: Optional[int] = Field(default=None, foreign_key="bookings.id", index=True)
    is_read: bool = Field(default=False, nullable=False)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )


class PushSubscription(SQLModel, table=True):
    """Suscripción Web Push de un dispositivo de un profesional."""
    __tablename__ = "push_subscriptions"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", nullable=False, index=True)
    endpoint: str = Field(sa_column=Column(Text, unique=True, nullable=False))
    subscription_data: dict = Field(sa_column=Column(JSON, nullable=False))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )


# ============================================================
# Medicamentos del paciente (permanente, por ficha clínica)
# ============================================================

class MedicationStatus(str, enum.Enum):
    active = "active"           # vigente, aprobado por la familia
    proposed = "proposed"       # propuesto por un profesional, pendiente de aprobación
    suspended = "suspended"     # suspendido por la familia
    rejected = "rejected"       # rechazado por la familia


class MedicationFrequency(str, enum.Enum):
    every_4h  = "every_4h"      # Cada 4 horas
    every_6h  = "every_6h"      # Cada 6 horas
    every_8h  = "every_8h"      # Cada 8 horas
    every_12h = "every_12h"     # Cada 12 horas
    every_24h = "every_24h"     # Una vez al día
    twice_daily  = "twice_daily"
    three_daily  = "three_daily"
    four_daily   = "four_daily"
    as_needed    = "as_needed"  # Solo si es necesario
    custom       = "custom"     # Definido en notes


class PatientMedication(SQLModel, table=True):
    """Medicamento permanente del paciente, gestionado por la familia.

    El profesional asignado puede proponer cambios; la familia siempre aprueba.
    """
    __tablename__ = "patient_medications"

    id: Optional[int] = Field(default=None, primary_key=True)
    clinical_record_id: int = Field(foreign_key="clinical_records.id", nullable=False, index=True)

    # Datos del medicamento
    name: str = Field(max_length=200)
    dose: str = Field(max_length=100)                         # ej: "500 mg", "10 ml"
    frequency: MedicationFrequency = Field(
        sa_column=Column(SAEnum(MedicationFrequency, name="medicationfrequency"), nullable=False)
    )
    schedules: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))  # ["07:00","15:00","23:00"]
    instructions: Optional[str] = Field(default=None, max_length=500)            # "con comida", "en ayunas"

    # Stock y reabastecimiento
    current_stock: Optional[int] = Field(default=None)        # unidades disponibles actualmente
    stock_unit: Optional[str] = Field(default=None, max_length=50)  # "pastillas", "ml", "parches"
    restock_alert_threshold: Optional[int] = Field(default=None)    # avisar cuando queden ≤ N unidades
    treatment_start_date: Optional[str] = Field(default=None, max_length=10)   # YYYY-MM-DD
    treatment_duration_days: Optional[int] = Field(default=None)               # None = indefinido

    # Control de acceso / aprobación
    status: MedicationStatus = Field(
        default=MedicationStatus.active,
        sa_column=Column(SAEnum(MedicationStatus, name="medicationstatus"), nullable=False, server_default="active")
    )
    created_by_user_id: int = Field(foreign_key="users.id", nullable=False)      # quien lo creó
    proposed_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")  # profesional que propuso (si aplica)
    approved_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")  # familiar que aprobó

    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    )


class MedicationReminderDelivery(SQLModel, table=True):
    """Registro idempotente de los recordatorios enviados por pauta y día."""
    __tablename__ = "medication_reminder_deliveries"
    __table_args__ = (UniqueConstraint("schedule_key", "reminder_date", name="uq_medication_reminder_delivery"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    booking_id: Optional[int] = Field(default=None, foreign_key="bookings.id", index=True)
    patient_medication_id: Optional[int] = Field(default=None, foreign_key="patient_medications.id", index=True)
    schedule_key: str = Field(max_length=64, nullable=False, index=True)
    reminder_date: str = Field(max_length=10, nullable=False, index=True)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )


# ============================================================
# Reseñas / Comentarios
# ============================================================

class Review(SQLModel, table=True):
    """Reseña de un familiar sobre un profesional."""
    __tablename__ = "reviews"

    id: Optional[int] = Field(default=None, primary_key=True)
    family_user_id: int = Field(foreign_key="users.id", nullable=False)
    professional_user_id: int = Field(foreign_key="users.id", nullable=False)
    booking_id: Optional[int] = Field(default=None, foreign_key="bookings.id")
    rating: int = Field(default=5)  # 1-5 estrellas
    comment: Optional[str] = Field(default=None, max_length=500)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )


# ============================================================
# Reconocimientos profesionales
# ============================================================

class RecognitionType(str, enum.Enum):
    first_service = "first_service"
    excellent_care = "excellent_care"
    featured_professional = "featured_professional"


class ProfessionalRecognition(SQLModel, table=True):
    """Insignia obtenida automáticamente a partir de actividad verificable."""
    __tablename__ = "professional_recognitions"
    __table_args__ = (
        UniqueConstraint("professional_user_id", "recognition_type", name="uq_professional_recognition"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    professional_user_id: int = Field(foreign_key="users.id", nullable=False, index=True)
    recognition_type: RecognitionType = Field(
        sa_column=Column(SAEnum(RecognitionType, name="recognitiontype"), nullable=False)
    )
    awarded_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )


# ============================================================
# Reseñas de profesional → familiar (bidireccional)
# ============================================================

class FamilyReview(SQLModel, table=True):
    """Reseña de un profesional sobre una familia (bidireccional)."""
    __tablename__ = "family_reviews"

    id: Optional[int] = Field(default=None, primary_key=True)
    professional_user_id: int = Field(foreign_key="users.id", nullable=False)
    family_user_id: int = Field(foreign_key="users.id", nullable=False)
    booking_id: int = Field(foreign_key="bookings.id", nullable=False)  # siempre requerido
    rating: int = Field(default=5)   # 1-5 estrellas
    comment: Optional[str] = Field(default=None, max_length=500)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )


# ============================================================
# Comentarios de servicios cancelados (sin calificación)
# ============================================================

class CancelledServiceComment(SQLModel, table=True):
    """Experiencia textual de una de las partes de un servicio cancelado.

    No contiene estrellas y no participa en los acumulados de reseñas. La
    restricción única garantiza un comentario por autor y reserva.
    """
    __tablename__ = "cancelled_service_comments"
    __table_args__ = (
        UniqueConstraint("booking_id", "author_user_id", name="uq_cancelled_comment_booking_author"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    booking_id: int = Field(foreign_key="bookings.id", nullable=False, index=True)
    author_user_id: int = Field(foreign_key="users.id", nullable=False, index=True)
    comment: str = Field(sa_column=Column(Text, nullable=False))
    is_hidden: bool = Field(default=False, nullable=False)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )


class CancelledServiceCommentReport(SQLModel, table=True):
    """Reporte de un comentario cancelado; conserva trazabilidad de moderación."""
    __tablename__ = "cancelled_service_comment_reports"
    __table_args__ = (
        UniqueConstraint("comment_id", "reporter_user_id", name="uq_cancelled_comment_reporter"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    comment_id: int = Field(foreign_key="cancelled_service_comments.id", nullable=False, index=True)
    reporter_user_id: int = Field(foreign_key="users.id", nullable=False, index=True)
    reason: str = Field(max_length=300, nullable=False)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )
