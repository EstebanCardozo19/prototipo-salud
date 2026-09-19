"""
Router de subida de fotos de perfil.
Guarda la imagen en disco bajo /uploads/profiles/ y actualiza photo_url en el usuario.
"""
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlmodel import Session

from app.auth import UserResponse, get_current_user
from app.database import get_session
from app.models import User

router = APIRouter(prefix="/api/upload", tags=["Fotos de perfil"])

# Carpeta donde se guardan las fotos (relativa a la raíz del proyecto)
UPLOAD_DIR = Path("uploads/profiles")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Tipos de imagen permitidos
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE_MB = 5


@router.post("/profile-photo", response_model=UserResponse)
async def upload_profile_photo(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Sube una foto de perfil para el usuario autenticado.
    Formatos aceptados: JPEG, PNG, WEBP. Tamaño máximo: 5 MB.
    Retorna el usuario actualizado con la nueva photo_url.
    """
    # Validar tipo de contenido
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Tipo de archivo no permitido. Use: {', '.join(ALLOWED_CONTENT_TYPES)}",
        )

    # Leer el contenido y validar tamaño
    content = await file.read()
    max_bytes = MAX_FILE_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"El archivo supera el tamaño máximo de {MAX_FILE_SIZE_MB} MB",
        )

    # Determinar extensión según content-type
    ext_map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }
    extension = ext_map[file.content_type]

    # Eliminar foto anterior si existe
    if current_user.photo_url:
        old_filename = current_user.photo_url.split("/uploads/profiles/")[-1]
        old_path = UPLOAD_DIR / old_filename
        if old_path.exists():
            old_path.unlink()

    # Guardar nueva foto con nombre único
    filename = f"user_{current_user.id}_{uuid.uuid4().hex}{extension}"
    file_path = UPLOAD_DIR / filename
    file_path.write_bytes(content)

    # Actualizar photo_url en la base de datos
    db_user = session.get(User, current_user.id)
    db_user.photo_url = f"/uploads/profiles/{filename}"
    session.add(db_user)
    session.commit()
    session.refresh(db_user)

    return UserResponse(
        id=db_user.id,
        email=db_user.email,
        full_name=db_user.full_name,
        role=db_user.role.value,
        is_active=db_user.is_active,
        photo_url=db_user.photo_url,
    )


@router.delete("/profile-photo", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile_photo(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Elimina la foto de perfil del usuario autenticado."""
    if not current_user.photo_url:
        raise HTTPException(status_code=404, detail="El usuario no tiene foto de perfil")

    filename = current_user.photo_url.split("/uploads/profiles/")[-1]
    file_path = UPLOAD_DIR / filename
    if file_path.exists():
        file_path.unlink()

    db_user = session.get(User, current_user.id)
    db_user.photo_url = None
    session.add(db_user)
    session.commit()
