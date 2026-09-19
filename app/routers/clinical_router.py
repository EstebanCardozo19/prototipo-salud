"""
Router de historia clínica: CRUD para familiares.
Incluye datos del paciente, vivienda e información médico-administrativa.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select
from typing import Optional, List

from app.database import get_session
from app.models import User, UserRole, ClinicalRecord
from app.auth import get_current_user, require_role

router = APIRouter(prefix="/api/clinical-records", tags=["Historia Clínica"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class ClinicalRecordCreate(BaseModel):
    # Datos básicos del paciente
    patient_name: str
    patient_age: int
    diagnoses: Optional[List[str]] = None
    medications: Optional[List[str]] = None
    allergies: Optional[List[str]] = None
    mobility_level: Optional[str] = None       # independiente | asistida | postrado
    special_needs: Optional[str] = None
    emergency_contact: Optional[str] = None
    blood_type: Optional[str] = None           # A+, O-, etc.

    # Dirección y vivienda
    address: Optional[str] = None             # Dirección completa (formato colombiano)
    neighborhood: Optional[str] = None        # Localidad / Comuna
    sector: Optional[str] = None             # Barrio / Sector específico
    city: Optional[str] = None                # Ciudad
    floor_number: Optional[int] = None        # Piso (None = planta baja)
    is_apartment: Optional[bool] = None       # True = apartamento, False = casa
    has_elevator: Optional[bool] = None
    housing_notes: Optional[str] = None       # Observaciones de acceso / portería

    # Info médico-administrativa
    eps: Optional[str] = None
    prepaid_medicine: Optional[str] = None    # None si no tiene
    preferred_hospital: Optional[str] = None


class ClinicalRecordUpdate(BaseModel):
    # Datos básicos del paciente
    patient_name: Optional[str] = None
    patient_age: Optional[int] = None
    diagnoses: Optional[List[str]] = None
    medications: Optional[List[str]] = None
    allergies: Optional[List[str]] = None
    mobility_level: Optional[str] = None
    special_needs: Optional[str] = None
    emergency_contact: Optional[str] = None
    blood_type: Optional[str] = None

    # Dirección y vivienda
    address: Optional[str] = None
    neighborhood: Optional[str] = None
    sector: Optional[str] = None
    city: Optional[str] = None
    floor_number: Optional[int] = None
    is_apartment: Optional[bool] = None
    has_elevator: Optional[bool] = None
    housing_notes: Optional[str] = None

    # Info médico-administrativa
    eps: Optional[str] = None
    prepaid_medicine: Optional[str] = None
    preferred_hospital: Optional[str] = None


class ClinicalRecordResponse(BaseModel):
    id: int
    family_user_id: int

    # Datos básicos del paciente
    patient_name: str
    patient_age: int
    diagnoses: Optional[List[str]]
    medications: Optional[List[str]]
    allergies: Optional[List[str]]
    mobility_level: Optional[str]
    special_needs: Optional[str]
    emergency_contact: Optional[str]
    blood_type: Optional[str]

    # Dirección y vivienda
    address: Optional[str]
    neighborhood: Optional[str]
    sector: Optional[str]
    city: Optional[str]
    floor_number: Optional[int]
    is_apartment: Optional[bool]
    has_elevator: Optional[bool]
    housing_notes: Optional[str]

    # Info médico-administrativa
    eps: Optional[str]
    prepaid_medicine: Optional[str]
    preferred_hospital: Optional[str]


# ── Endpoints ─────────────────────────────────────────────────────────────────

MAX_FAMILY_RECORDS = 5

@router.post("/", response_model=ClinicalRecordResponse, status_code=status.HTTP_201_CREATED)
def create_clinical_record(
    request: ClinicalRecordCreate,
    current_user: User = Depends(require_role(UserRole.family)),
    session: Session = Depends(get_session),
):
    """Crea la ficha del familiar/paciente a cargo. Máximo 5 fichas por cuenta."""
    count = session.exec(
        select(ClinicalRecord).where(ClinicalRecord.family_user_id == current_user.id)
    ).all()
    if len(count) >= MAX_FAMILY_RECORDS:
        raise HTTPException(
            status_code=400,
            detail=f"Límite alcanzado: máximo {MAX_FAMILY_RECORDS} familiares por cuenta."
        )
    record = ClinicalRecord(
        family_user_id=current_user.id,
        **request.model_dump(),
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


@router.get("/", response_model=List[ClinicalRecordResponse])
def list_my_clinical_records(
    current_user: User = Depends(require_role(UserRole.family)),
    session: Session = Depends(get_session),
):
    """Lista todas las fichas del familiar autenticado."""
    records = session.exec(
        select(ClinicalRecord).where(ClinicalRecord.family_user_id == current_user.id)
    ).all()
    return records


@router.get("/{record_id}", response_model=ClinicalRecordResponse)
def get_clinical_record(
    record_id: int,
    current_user: User = Depends(require_role(UserRole.family, UserRole.admin)),
    session: Session = Depends(get_session),
):
    """Obtiene una ficha por ID."""
    record = session.get(ClinicalRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Ficha no encontrada")

    if current_user.role != UserRole.admin and record.family_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")

    return record


@router.put("/{record_id}", response_model=ClinicalRecordResponse)
def update_clinical_record(
    record_id: int,
    request: ClinicalRecordUpdate,
    current_user: User = Depends(require_role(UserRole.family)),
    session: Session = Depends(get_session),
):
    """Actualiza cualquier campo de la ficha del paciente."""
    record = session.get(ClinicalRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Ficha no encontrada")

    if record.family_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado para editar esta ficha")

    for key, value in request.model_dump(exclude_unset=True).items():
        setattr(record, key, value)

    session.add(record)
    session.commit()
    session.refresh(record)
    return record


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_clinical_record(
    record_id: int,
    current_user: User = Depends(require_role(UserRole.family)),
    session: Session = Depends(get_session),
):
    """Elimina la ficha del paciente."""
    record = session.get(ClinicalRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Ficha no encontrada")

    if record.family_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")

    session.delete(record)
    session.commit()
