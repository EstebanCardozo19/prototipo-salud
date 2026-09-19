import enum
from typing import Optional, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, String, Enum as SAEnum, JSON, DateTime, func
from pgvector.sqlalchemy import Vector


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
    email: str = Field(sa_column=Column(String(255), unique=True, nullable=False, index=True))
    password_hash: str = Field(max_length=255)
    full_name: str = Field(max_length=150)
    role: UserRole = Field(sa_column=Column(SAEnum(UserRole, name="userrole"), nullable=False))
    is_active: bool = Field(default=True)
    photo_url: Optional[str] = Field(default=None, max_length=500)
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
    bio: Optional[str] = Field(default=None, max_length=500)
    status: ProfileStatus = Field(
        default=ProfileStatus.pending,
        sa_column=Column(SAEnum(ProfileStatus, name="profilestatus"), nullable=False, server_default="pending")
    )
    embedding: Optional[List[float]] = Field(
        default=None,
        sa_column=Column(Vector(384))
    )
    # Rating agregado (se recalcula al crear/editar reviews)
    rating_avg: float = Field(default=5.0)
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
    patient_name: str = Field(max_length=150)
    patient_age: int = Field(default=0)
    diagnoses: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    medications: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    allergies: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    mobility_level: Optional[str] = Field(default=None, max_length=50)  # independiente, asistida, postrado
    special_needs: Optional[str] = Field(default=None, max_length=1000)
    emergency_contact: Optional[str] = Field(default=None, max_length=255)

    # ── Dirección y características de la vivienda ───────────────
    address: Optional[str] = Field(default=None, max_length=300)          # Dirección completa (formato colombiano)
    neighborhood: Optional[str] = Field(default=None, max_length=100)     # Localidad / Comuna
    sector: Optional[str] = Field(default=None, max_length=100)           # Barrio / Sector específico
    city: Optional[str] = Field(default=None, max_length=100)             # Ciudad
    floor_number: Optional[int] = Field(default=None)                     # Piso (null = planta baja)
    is_apartment: Optional[bool] = Field(default=None)                    # True=apartamento, False=casa
    has_elevator: Optional[bool] = Field(default=None)                    # ¿Tiene ascensor?
    housing_notes: Optional[str] = Field(default=None, max_length=500)    # Observaciones de acceso

    # ── Información médico-administrativa ────────────────────────
    eps: Optional[str] = Field(default=None, max_length=150)              # EPS del paciente
    prepaid_medicine: Optional[str] = Field(default=None, max_length=150) # Medicina prepagada (null si no tiene)
    preferred_hospital: Optional[str] = Field(default=None, max_length=200) # Hospital/clínica preferida
    blood_type: Optional[str] = Field(default=None, max_length=10)        # Tipo de sangre (A+, O-, etc.)

    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    )

    family_user: Optional[User] = Relationship(back_populates="clinical_records")


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
    hourly_rate: float = Field(default=0.0)
    status: ProfileStatus = Field(
        default=ProfileStatus.pending,
        sa_column=Column(SAEnum(ProfileStatus, name="profilestatus", create_type=False), nullable=False, server_default="pending")
    )
    # Rating agregado (se recalcula al crear/editar reviews)
    rating_avg: float = Field(default=5.0)
    rating_count: int = Field(default=0)
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
    status: BookingStatus = Field(
        default=BookingStatus.pending,
        sa_column=Column(SAEnum(BookingStatus, name="bookingstatus"), nullable=False, server_default="pending")
    )
    rejection_reason: Optional[str] = Field(default=None, max_length=300)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now())
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
