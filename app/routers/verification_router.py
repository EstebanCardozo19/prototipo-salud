import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session, select
from app.auth import get_current_user, require_role
from app.database import get_session
from app.models import CaregiverProfile, NurseProfile, ProfessionalVerification, ProfileStatus, User, UserRole, VerificationDocument, VerificationDocumentType

router = APIRouter(prefix="/api/verification", tags=["Verificación profesional"])
DOCUMENT_DIR = Path("private_uploads/verification"); DOCUMENT_DIR.mkdir(parents=True, exist_ok=True)
# Los cuidadores pueden adjuntar soportes para facilitar la revisión, pero no se
# les exige ningún documento para enviar la solicitud. La documentación sí es
# obligatoria para el ejercicio profesional de enfermería.
REQUIRED = {
    UserRole.caregiver: set(),
    UserRole.nurse: {
        VerificationDocumentType.identity,
        VerificationDocumentType.professional_license,
        VerificationDocumentType.nursing_degree,
    },
}

class DocumentResponse(BaseModel):
    id: int; document_type: str; document_name: Optional[str]; original_filename: str; download_url: str
class VerificationResponse(BaseModel):
    id: int; role: str; status: str; submitted_at: Optional[datetime]; reviewed_at: Optional[datetime]; rejection_reason: Optional[str]; required_documents: list[str]; documents: list[DocumentResponse]

def verification_for(user, session):
    item = session.exec(select(ProfessionalVerification).where(ProfessionalVerification.user_id == user.id)).first()
    if not item:
        item = ProfessionalVerification(user_id=user.id, role=user.role); session.add(item); session.commit(); session.refresh(item)
    return item
def serialize(item, session):
    docs = session.exec(select(VerificationDocument).where(VerificationDocument.verification_id == item.id)).all()
    return VerificationResponse(id=item.id, role=item.role.value, status=item.status.value, submitted_at=item.submitted_at, reviewed_at=item.reviewed_at, rejection_reason=item.rejection_reason, required_documents=sorted(x.value for x in REQUIRED[item.role]), documents=[DocumentResponse(id=d.id, document_type=d.document_type.value, document_name=d.document_name, original_filename=d.original_filename, download_url=f'/api/verification/documents/{d.id}/download') for d in docs])

@router.get('/me', response_model=VerificationResponse)
def mine(current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse)), session: Session = Depends(get_session)):
    return serialize(verification_for(current_user, session), session)
@router.post('/documents/{document_type}', response_model=DocumentResponse)
async def upload(document_type: VerificationDocumentType, file: UploadFile = File(...), document_name: Optional[str] = Form(None), current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse)), session: Session = Depends(get_session)):
    allowed_documents = (
        REQUIRED[current_user.role]
        | {VerificationDocumentType.additional_certificate}
        | ({VerificationDocumentType.identity, VerificationDocumentType.training, VerificationDocumentType.work_reference} if current_user.role == UserRole.caregiver else set())
    )
    if document_type not in allowed_documents: raise HTTPException(400, 'Documento no permitido para este rol')
    document_name = (document_name or '').strip() or None
    if document_type in {VerificationDocumentType.training, VerificationDocumentType.nursing_degree, VerificationDocumentType.additional_certificate} and not document_name:
        raise HTTPException(400, 'Indique el nombre del certificado o título')
    if document_name and len(document_name) > 150: raise HTTPException(400, 'El nombre no puede superar 150 caracteres')
    if file.content_type not in {'application/pdf','image/jpeg','image/png'}: raise HTTPException(415, 'Use PDF, JPEG o PNG')
    content = await file.read()
    if not content or len(content) > 10 * 1024 * 1024: raise HTTPException(413, 'El archivo debe pesar máximo 10 MB')
    item = verification_for(current_user, session); old = None if document_type == VerificationDocumentType.additional_certificate else session.exec(select(VerificationDocument).where(VerificationDocument.verification_id == item.id, VerificationDocument.document_type == document_type)).first()
    if old:
        path = DOCUMENT_DIR / old.stored_filename
        if path.exists(): path.unlink()
        session.delete(old); session.flush()
    ext = {'application/pdf':'.pdf','image/jpeg':'.jpg','image/png':'.png'}[file.content_type]; stored = f'{item.id}_{uuid.uuid4().hex}{ext}'; (DOCUMENT_DIR / stored).write_bytes(content)
    doc = VerificationDocument(verification_id=item.id, document_type=document_type, document_name=document_name, original_filename=(file.filename or stored)[:255], stored_filename=stored, content_type=file.content_type, size_bytes=len(content)); session.add(doc); session.commit(); session.refresh(doc)
    return DocumentResponse(id=doc.id, document_type=doc.document_type.value, document_name=doc.document_name, original_filename=doc.original_filename, download_url=f'/api/verification/documents/{doc.id}/download')
@router.post('/submit', response_model=VerificationResponse)
def submit(current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse)), session: Session = Depends(get_session)):
    item = verification_for(current_user, session); docs = session.exec(select(VerificationDocument).where(VerificationDocument.verification_id == item.id)).all(); missing = REQUIRED[current_user.role] - {d.document_type for d in docs}
    if missing: raise HTTPException(400, 'Faltan: ' + ', '.join(sorted(x.value for x in missing)))
    model = CaregiverProfile if current_user.role == UserRole.caregiver else NurseProfile; profile = session.exec(select(model).where(model.user_id == current_user.id)).first()
    if not profile or not profile.location or not profile.bio: raise HTTPException(400, 'Complete localidad y biografía antes de enviar')
    item.status=ProfileStatus.pending; item.submitted_at=datetime.now(timezone.utc); item.reviewed_at=None; item.reviewed_by_user_id=None; item.rejection_reason=None; profile.status=ProfileStatus.pending; session.add(item); session.add(profile); session.commit(); session.refresh(item); return serialize(item, session)
@router.get('/documents/{document_id}/download')
def download(document_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    doc=session.get(VerificationDocument,document_id)
    if not doc: raise HTTPException(404,'Documento no encontrado')
    item=session.get(ProfessionalVerification,doc.verification_id)
    if current_user.role != UserRole.admin and item.user_id != current_user.id: raise HTTPException(403,'Sin permiso')
    path=DOCUMENT_DIR/doc.stored_filename
    if not path.exists(): raise HTTPException(404,'Archivo no disponible')
    return FileResponse(path, media_type=doc.content_type, filename=doc.original_filename)