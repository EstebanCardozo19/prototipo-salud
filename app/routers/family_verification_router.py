"""
Router de verificación de cédula para cuentas familiares.

Flujo:
1. La familia sube su cédula (imagen o PDF) desde su perfil.
2. Se crea/actualiza un FamilyVerification en estado pending.
3. El admin revisa el documento y aprueba o rechaza.
4. Una vez aprobada, la familia puede contratar servicios (crear bookings).
"""
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user, require_role
from app.database import get_session
from app.models import FamilyVerification, ProfileStatus, User, UserRole
from app.security.encryption import decrypt_text

router = APIRouter(prefix="/api/family-verification", tags=["Verificación familiar"])

DOCUMENT_DIR = Path("private_uploads/family_verification")
DOCUMENT_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_CONTENT_TYPES = {"application/pdf", "image/jpeg", "image/png"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


class FamilyVerificationResponse(BaseModel):
    user_id: int
    status: str
    submitted_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    has_document: bool = False


def _get_or_create_verification(user: User, session: Session) -> FamilyVerification:
    fv = session.exec(
        select(FamilyVerification).where(FamilyVerification.user_id == user.id)
    ).first()
    if not fv:
        fv = FamilyVerification(
            user_id=user.id,
            status=ProfileStatus.pending,
        )
        session.add(fv)
        session.commit()
        session.refresh(fv)
    return fv


def _serialize(fv: FamilyVerification) -> FamilyVerificationResponse:
    doc_path = DOCUMENT_DIR / f"{fv.user_id}_cedula"
    has_doc = any(doc_path.with_suffix(ext).exists() for ext in (".pdf", ".jpg", ".png"))
    return FamilyVerificationResponse(
        user_id=fv.user_id,
        status=fv.status.value,
        submitted_at=fv.submitted_at,
        reviewed_at=fv.reviewed_at,
        rejection_reason=fv.rejection_reason,
        has_document=has_doc,
    )


@router.get("/me", response_model=FamilyVerificationResponse)
def get_my_verification(
    current_user: User = Depends(require_role(UserRole.family)),
    session: Session = Depends(get_session),
):
    """Retorna el estado actual de la verificación de cédula del familiar."""
    fv = _get_or_create_verification(current_user, session)
    return _serialize(fv)


@router.post("/documents/cedula", response_model=FamilyVerificationResponse)
async def upload_cedula(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role(UserRole.family)),
    session: Session = Depends(get_session),
):
    """Sube o reemplaza la imagen/PDF de la cédula para verificación.

    Solo se puede subir/reemplazar si la verificación está en borrador (nunca
    enviada) o fue rechazada. Una vez aprobada, no se puede modificar.
    """
    fv = _get_or_create_verification(current_user, session)

    if fv.status == ProfileStatus.approved:
        raise HTTPException(409, "Tu cédula ya fue verificada y no puede modificarse.")

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(415, "Solo se aceptan archivos PDF, JPEG o PNG.")

    content = await file.read()
    if not content or len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, "El archivo debe pesar máximo 10 MB.")

    # Eliminar documento anterior si existe
    for ext in (".pdf", ".jpg", ".png"):
        old = DOCUMENT_DIR / f"{current_user.id}_cedula{ext}"
        if old.exists():
            old.unlink()

    ext_map = {"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png"}
    stored_name = f"{current_user.id}_cedula{ext_map[file.content_type]}"
    (DOCUMENT_DIR / stored_name).write_bytes(content)

    # Marcar como pendiente de revisión
    fv.status = ProfileStatus.pending
    fv.submitted_at = datetime.now(timezone.utc)
    fv.reviewed_at = None
    fv.reviewed_by_user_id = None
    fv.rejection_reason = None
    session.add(fv)
    session.commit()
    session.refresh(fv)

    return _serialize(fv)


@router.get("/documents/cedula/download")
def download_cedula(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Descarga la cédula del familiar autenticado (o el admin puede acceder a cualquiera)."""
    target_user_id = current_user.id
    if current_user.role != UserRole.admin and current_user.role != UserRole.family:
        raise HTTPException(403, "Sin permiso.")

    for ext in (".pdf", ".jpg", ".png"):
        path = DOCUMENT_DIR / f"{target_user_id}_cedula{ext}"
        if path.exists():
            media_type = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".png": "image/png"}[ext]
            return FileResponse(path, media_type=media_type, filename=f"cedula_{target_user_id}{ext}")

    raise HTTPException(404, "Documento no encontrado.")


@router.get("/documents/{user_id}/download")
def download_cedula_by_id(
    user_id: int,
    current_user: User = Depends(require_role(UserRole.admin)),
    session: Session = Depends(get_session),
):
    """Permite al admin descargar la cédula de cualquier familiar."""
    for ext in (".pdf", ".jpg", ".png"):
        path = DOCUMENT_DIR / f"{user_id}_cedula{ext}"
        if path.exists():
            media_type = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".png": "image/png"}[ext]
            return FileResponse(path, media_type=media_type, filename=f"cedula_{user_id}{ext}")
    raise HTTPException(404, "Documento no encontrado.")
