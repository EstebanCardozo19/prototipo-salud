"""
Router de historia clínica: CRUD para familiares.
Incluye datos del paciente, vivienda e información médico-administrativa.
"""
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from io import BytesIO
from pydantic import BaseModel, field_validator
from sqlmodel import Session, select
from typing import Optional, List

from app.database import get_session
from app.models import User, UserRole, ClinicalRecord, ClinicalRecordDocument
from app.auth import get_current_user, require_role
from app.security.encryption import decrypt_bytes, encrypt_bytes
from app.services.document_text_extraction import extract_document_text, is_extracted_text_legible
from app.services.bogota_locations import validate_bogota_city

router = APIRouter(prefix="/api/clinical-records", tags=["Historia Clínica"])

DOCUMENT_DIR = Path("private_uploads/clinical_records")
DOCUMENT_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_DOCUMENT_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
}
MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024


# ── Schemas ──────────────────────────────────────────────────────────────────

class ClinicalRecordCreate(BaseModel):
    # Datos básicos del paciente
    patient_name: str
    patient_age: int
    diagnoses: Optional[List[str]] = None
    takes_medications: bool = False
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
    allow_professional_document_access: bool = False

    @field_validator("city")
    @classmethod
    def city_must_be_bogota(cls, value: Optional[str]) -> Optional[str]:
        return validate_bogota_city(value)


class ClinicalRecordUpdate(BaseModel):
    # Datos básicos del paciente
    patient_name: Optional[str] = None
    patient_age: Optional[int] = None
    diagnoses: Optional[List[str]] = None
    takes_medications: Optional[bool] = None
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
    allow_professional_document_access: Optional[bool] = None

    @field_validator("city")
    @classmethod
    def city_must_be_bogota(cls, value: Optional[str]) -> Optional[str]:
        return validate_bogota_city(value)


class ClinicalRecordResponse(BaseModel):
    id: int
    family_user_id: int
    allow_professional_document_access: bool = False

    # Datos básicos del paciente
    patient_name: str
    patient_age: int
    diagnoses: Optional[List[str]]
    takes_medications: bool = False
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


class ClinicalRecordDocumentResponse(BaseModel):
    id: int
    original_filename: str
    content_type: str
    size_bytes: int
    uploaded_at: Optional[datetime]
    download_url: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

MAX_FAMILY_RECORDS = 5


def get_owned_record(record_id: int, current_user: User, session: Session) -> ClinicalRecord:
    record = session.get(ClinicalRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Ficha no encontrada")
    if record.family_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado para acceder a esta ficha")
    return record


def document_response(document: ClinicalRecordDocument) -> ClinicalRecordDocumentResponse:
    return ClinicalRecordDocumentResponse(
        id=document.id,
        original_filename=document.original_filename,
        content_type=document.content_type,
        size_bytes=document.size_bytes,
        uploaded_at=document.uploaded_at,
        download_url=f"/api/clinical-records/documents/{document.id}/download",
    )


def normalize_medications(payload: dict) -> dict:
    """Evita almacenar medicamentos si la familia indicó que el paciente no toma."""
    if payload.get("takes_medications") is False:
        payload["medications"] = []
    return payload

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
        **normalize_medications(request.model_dump()),
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

    changes = normalize_medications(request.model_dump(exclude_unset=True))
    for key, value in changes.items():
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
    record = get_owned_record(record_id, current_user, session)

    documents = session.exec(
        select(ClinicalRecordDocument).where(ClinicalRecordDocument.clinical_record_id == record.id)
    ).all()
    for document in documents:
        file_path = DOCUMENT_DIR / document.stored_filename
        if file_path.exists():
            file_path.unlink()
        session.delete(document)

    session.delete(record)
    session.commit()


@router.get("/{record_id}/documents", response_model=List[ClinicalRecordDocumentResponse])
def list_clinical_record_documents(
    record_id: int,
    current_user: User = Depends(require_role(UserRole.family)),
    session: Session = Depends(get_session),
):
    """Lista los adjuntos privados de una ficha del familiar autenticado."""
    get_owned_record(record_id, current_user, session)
    documents = session.exec(
        select(ClinicalRecordDocument).where(ClinicalRecordDocument.clinical_record_id == record_id)
    ).all()
    return [document_response(document) for document in documents]


@router.post("/{record_id}/documents", response_model=ClinicalRecordDocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_clinical_record_document(
    record_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(require_role(UserRole.family)),
    session: Session = Depends(get_session),
):
    """Adjunta una foto (JPEG/PNG) o un PDF a una ficha clínica propia."""
    record = get_owned_record(record_id, current_user, session)
    if file.content_type not in ALLOWED_DOCUMENT_TYPES:
        raise HTTPException(status_code=415, detail="Use un archivo PDF, JPEG o PNG")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    if len(content) > MAX_DOCUMENT_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="El archivo debe pesar máximo 10 MB")

    extracted_text = extract_document_text(content, file.content_type)
    if not is_extracted_text_legible(extracted_text):
        raise HTTPException(
            status_code=422,
            detail=(
                "No fue posible leer el contenido del documento. Cargue una imagen o PDF nítido, "
                "bien iluminado y con texto visible; no se guardó el archivo."
            ),
        )

    stored_filename = f"record_{record.id}_{uuid.uuid4().hex}{ALLOWED_DOCUMENT_TYPES[file.content_type]}"
    (DOCUMENT_DIR / stored_filename).write_bytes(encrypt_bytes(content))
    document = ClinicalRecordDocument(
        clinical_record_id=record.id,
        original_filename=(file.filename or stored_filename)[:255],
        stored_filename=stored_filename,
        content_type=file.content_type,
        size_bytes=len(content),
        extracted_text=extracted_text,
    )
    session.add(document)
    session.commit()
    session.refresh(document)
    return document_response(document)


@router.get("/documents/{document_id}/download")
def download_clinical_record_document(
    document_id: int,
    current_user: User = Depends(require_role(UserRole.family, UserRole.admin)),
    session: Session = Depends(get_session),
):
    """Descarga privada autorizada de un adjunto clínico."""
    document = session.get(ClinicalRecordDocument, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    record = session.get(ClinicalRecord, document.clinical_record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Ficha no encontrada")
    if current_user.role != UserRole.admin and record.family_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")
    file_path = DOCUMENT_DIR / document.stored_filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Archivo no disponible")
    plaintext = decrypt_bytes(file_path.read_bytes(), allow_legacy_plaintext=True)
    headers = {"Content-Disposition": f'attachment; filename="{document.original_filename}"'}
    return StreamingResponse(BytesIO(plaintext), media_type=document.content_type, headers=headers)


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_clinical_record_document(
    document_id: int,
    current_user: User = Depends(require_role(UserRole.family)),
    session: Session = Depends(get_session),
):
    """Elimina un adjunto de una ficha propia."""
    document = session.get(ClinicalRecordDocument, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    get_owned_record(document.clinical_record_id, current_user, session)
    file_path = DOCUMENT_DIR / document.stored_filename
    if file_path.exists():
        file_path.unlink()
    session.delete(document)
    session.commit()
