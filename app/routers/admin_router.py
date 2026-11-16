from datetime import datetime, timezone
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select
from app.auth import require_role
from app.database import get_session
from app.models import CaregiverProfile, FamilyVerification, NurseProfile, ProfessionalVerification, ProfileStatus, User, UserRole, VerificationDocument
from app.routers.notifications_router import create_notification
from app.security.encryption import encrypt_text, user_email, user_full_name

router = APIRouter(prefix='/api/admin', tags=['Administración'])
class ReviewRequest(BaseModel): status: str; reason: Optional[str] = None
class DocumentResponse(BaseModel): id: int; document_type: str; document_name: Optional[str]; original_filename: str; download_url: str
class PendingProfileResponse(BaseModel):
    id: int; user_id: int; full_name: str; email: str; role: str; location: str; status: str; experience_years: int; submitted_at: Optional[datetime]; documents: list[DocumentResponse]; profile_data: dict[str, Any]
class AdminUserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    verification_status: Optional[str] = None
    verification_submitted_at: Optional[datetime] = None
    national_id_verified: bool = False
    family_verification_status: Optional[str] = None

class FamilyPendingResponse(BaseModel):
    user_id: int
    full_name: str
    email: str
    national_id: str
    submitted_at: Optional[datetime]
    status: str
    rejection_reason: Optional[str] = None
    document_url: Optional[str] = None
class UpdateUserNameRequest(BaseModel): full_name: str
def serialize(v, u, s):
    model=CaregiverProfile if v.role==UserRole.caregiver else NurseProfile; p=s.exec(select(model).where(model.user_id==u.id)).first(); docs=s.exec(select(VerificationDocument).where(VerificationDocument.verification_id==v.id)).all()
    profile_data = {
        'bio': p.bio if p else None,
        'hourly_rate': p.hourly_rate if p else 0,
    }
    if v.role == UserRole.caregiver:
        profile_data['specialties'] = p.specialties or [] if p else []
    else:
        profile_data.update({
            'specialty': p.specialty.value if p else None,
            'license_number': p.license_number if p else None,
            'institution': p.institution if p else None,
        })
    return PendingProfileResponse(id=v.id,user_id=u.id,full_name=user_full_name(u),email=user_email(u),role=v.role.value,location=p.location if p else '',status=v.status.value,experience_years=p.experience_years if p else 0,submitted_at=v.submitted_at,documents=[DocumentResponse(id=d.id,document_type=d.document_type.value,document_name=d.document_name,original_filename=d.original_filename,download_url=f'/api/verification/documents/{d.id}/download') for d in docs],profile_data=profile_data)
@router.get('/profiles/pending',response_model=list[PendingProfileResponse])
def pending(current_user:User=Depends(require_role(UserRole.admin)),session:Session=Depends(get_session)):
    rows=session.exec(select(ProfessionalVerification,User).join(User,User.id==ProfessionalVerification.user_id).where(ProfessionalVerification.status==ProfileStatus.pending,ProfessionalVerification.submitted_at != None)).all(); return [serialize(v,u,session) for v,u in rows]
@router.put('/verifications/{verification_id}/review',response_model=PendingProfileResponse)
def review(verification_id:int,request:ReviewRequest,current_user:User=Depends(require_role(UserRole.admin)),session:Session=Depends(get_session)):
    if request.status not in ('approved','rejected'): raise HTTPException(400,"Status debe ser 'approved' o 'rejected'")
    if request.status=='rejected' and not (request.reason or '').strip(): raise HTTPException(400,'Debe indicar el motivo de rechazo')
    v=session.get(ProfessionalVerification,verification_id)
    if not v or not v.submitted_at: raise HTTPException(404,'Solicitud no encontrada o no enviada')
    v.status=ProfileStatus(request.status);v.reviewed_at=datetime.now(timezone.utc);v.reviewed_by_user_id=current_user.id;v.rejection_reason=request.reason.strip() if request.status=='rejected' else None
    model=CaregiverProfile if v.role==UserRole.caregiver else NurseProfile;p=session.exec(select(model).where(model.user_id==v.user_id)).first()
    if p:p.status=v.status;session.add(p)
    outcome = 'aprobada' if request.status == 'approved' else 'rechazada'
    body = 'Tu perfil ya es visible para las familias.' if request.status == 'approved' else f'Motivo: {v.rejection_reason}'
    create_notification(session, v.user_id, 'verification', f'Verificación {outcome}', body)
    session.add(v);session.commit();session.refresh(v);return serialize(v,session.get(User,v.user_id),session)
@router.get('/users',response_model=list[AdminUserResponse])
def users(skip:int=0,limit:int=50,current_user:User=Depends(require_role(UserRole.admin)),session:Session=Depends(get_session)):
    all_users = session.exec(select(User).offset(skip).limit(limit)).all()
    professional_ids = [u.id for u in all_users if u.role in (UserRole.caregiver, UserRole.nurse)]
    verifications = {}
    if professional_ids:
        verifications = {
            verification.user_id: verification
            for verification in session.exec(
                select(ProfessionalVerification).where(ProfessionalVerification.user_id.in_(professional_ids))
            ).all()
        }
    return [
        AdminUserResponse(
            id=u.id,
            email=user_email(u),
            full_name=user_full_name(u),
            role=u.role.value,
            is_active=u.is_active,
            verification_status=verifications[u.id].status.value if u.id in verifications else None,
            verification_submitted_at=verifications[u.id].submitted_at if u.id in verifications else None,
            national_id_verified=u.national_id_verified,
            family_verification_status=None,
        )
        for u in all_users
    ]
@router.put('/users/{user_id}/toggle-active')
def toggle(user_id:int,current_user:User=Depends(require_role(UserRole.admin)),session:Session=Depends(get_session)):
    u=session.get(User,user_id)
    if not u:raise HTTPException(404,'Usuario no encontrado')
    u.is_active=not u.is_active;session.add(u);session.commit();return {'id':u.id,'is_active':u.is_active}

@router.put('/users/{user_id}/full-name', response_model=AdminUserResponse)
def update_user_full_name(user_id: int, request: UpdateUserNameRequest, current_user: User = Depends(require_role(UserRole.admin)), session: Session = Depends(get_session)):
    """Permite exclusivamente a administradores modificar el nombre de una cuenta."""
    full_name = request.full_name.strip()
    if not full_name:
        raise HTTPException(422, 'El nombre completo es obligatorio')
    u = session.get(User, user_id)
    if not u:
        raise HTTPException(404, 'Usuario no encontrado')
    u.full_name = encrypt_text(full_name)
    session.add(u); session.commit(); session.refresh(u)
    verification = session.exec(select(ProfessionalVerification).where(ProfessionalVerification.user_id == u.id)).first()
    return AdminUserResponse(
        id=u.id,
        email=user_email(u),
        full_name=user_full_name(u),
        role=u.role.value,
        is_active=u.is_active,
        verification_status=verification.status.value if verification else None,
        verification_submitted_at=verification.submitted_at if verification else None,
        national_id_verified=u.national_id_verified,
    )


@router.get('/family-verifications/pending', response_model=list[FamilyPendingResponse])
def pending_families(
    current_user: User = Depends(require_role(UserRole.admin)),
    session: Session = Depends(get_session),
):
    """Lista las cuentas familiares cuya cédula está pendiente de revisión."""
    rows = session.exec(
        select(FamilyVerification, User)
        .join(User, User.id == FamilyVerification.user_id)
        .where(FamilyVerification.status == ProfileStatus.pending)
        .where(FamilyVerification.submitted_at != None)  # noqa: E711
    ).all()
    result = []
    for fv, u in rows:
        result.append(FamilyPendingResponse(
            user_id=u.id,
            full_name=user_full_name(u),
            email=user_email(u),
            national_id="",  # no se muestra en listado; el admin descarga el doc
            submitted_at=fv.submitted_at,
            status=fv.status.value,
            rejection_reason=fv.rejection_reason,
            document_url=f"/api/family-verification/documents/{u.id}/download",
        ))
    return result


@router.put('/family-verifications/{user_id}/review', response_model=FamilyPendingResponse)
def review_family(
    user_id: int,
    request: ReviewRequest,
    current_user: User = Depends(require_role(UserRole.admin)),
    session: Session = Depends(get_session),
):
    """Aprueba o rechaza la verificación de cédula de una cuenta familiar.

    - Aprobación: activa la cuenta (``is_active=True``) y marca ``national_id_verified=True``.
    - Rechazo: la cuenta permanece inactiva; se guarda el motivo de rechazo.
    """
    if request.status not in ("approved", "rejected"):
        raise HTTPException(400, "Status debe ser 'approved' o 'rejected'")
    if request.status == "rejected" and not (request.reason or "").strip():
        raise HTTPException(400, "Debe indicar el motivo de rechazo")

    u = session.get(User, user_id)
    if not u or u.role != UserRole.family:
        raise HTTPException(404, "Usuario familiar no encontrado")

    fv = session.exec(select(FamilyVerification).where(FamilyVerification.user_id == user_id)).first()
    if not fv:
        raise HTTPException(404, "Verificación familiar no encontrada")

    fv.status = ProfileStatus(request.status)
    fv.reviewed_at = datetime.now(timezone.utc)
    fv.reviewed_by_user_id = current_user.id
    fv.rejection_reason = request.reason.strip() if request.status == "rejected" else None

    if request.status == "approved":
        u.is_active = True
        u.national_id_verified = True

    session.add(fv)
    session.add(u)
    session.commit()
    session.refresh(fv)

    outcome = "aprobada" if request.status == "approved" else "rechazada"
    body = (
        "Tu identidad fue verificada. Ya puedes contratar servicios."
        if request.status == "approved"
        else f"Motivo: {fv.rejection_reason}"
    )
    create_notification(session, user_id, "verification", f"Verificación de cuenta {outcome}", body)

    return FamilyPendingResponse(
        user_id=u.id,
        full_name=user_full_name(u),
        email=user_email(u),
        national_id="",
        submitted_at=fv.submitted_at,
        status=fv.status.value,
        rejection_reason=fv.rejection_reason,
        document_url=f"/api/family-verification/documents/{u.id}/download",
    )


@router.get('/users/{user_id}/verification-documents')
def get_user_documents(
    user_id: int,
    current_user: User = Depends(require_role(UserRole.admin)),
    session: Session = Depends(get_session),
):
    """Devuelve los documentos de verificación de cualquier usuario profesional."""
    u = session.get(User, user_id)
    if not u:
        raise HTTPException(404, 'Usuario no encontrado')
    verification = session.exec(
        select(ProfessionalVerification).where(ProfessionalVerification.user_id == user_id)
    ).first()
    if not verification:
        return {'documents': [], 'status': None}
    docs = session.exec(
        select(VerificationDocument).where(VerificationDocument.verification_id == verification.id)
    ).all()
    return {
        'status': verification.status.value,
        'documents': [
            {
                'id': d.id,
                'document_type': d.document_type.value,
                'document_name': d.document_name,
                'original_filename': d.original_filename,
                'download_url': f'/api/verification/documents/{d.id}/download',
            }
            for d in docs
        ],
    }
