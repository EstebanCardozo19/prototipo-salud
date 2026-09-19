from datetime import datetime, timezone
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select
from app.auth import require_role
from app.database import get_session
from app.models import CaregiverProfile, NurseProfile, ProfessionalVerification, ProfileStatus, User, UserRole, VerificationDocument
from app.routers.notifications_router import create_notification

router = APIRouter(prefix='/api/admin', tags=['Administración'])
class ReviewRequest(BaseModel): status: str; reason: Optional[str] = None
class DocumentResponse(BaseModel): id: int; document_type: str; document_name: Optional[str]; original_filename: str; download_url: str
class PendingProfileResponse(BaseModel):
    id: int; user_id: int; full_name: str; email: str; role: str; location: str; status: str; experience_years: int; submitted_at: Optional[datetime]; documents: list[DocumentResponse]; profile_data: dict[str, Any]
class AdminUserResponse(BaseModel): id: int; email: str; full_name: str; role: str; is_active: bool
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
    return PendingProfileResponse(id=v.id,user_id=u.id,full_name=u.full_name,email=u.email,role=v.role.value,location=p.location if p else '',status=v.status.value,experience_years=p.experience_years if p else 0,submitted_at=v.submitted_at,documents=[DocumentResponse(id=d.id,document_type=d.document_type.value,document_name=d.document_name,original_filename=d.original_filename,download_url=f'/api/verification/documents/{d.id}/download') for d in docs],profile_data=profile_data)
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
    return [AdminUserResponse(id=u.id,email=u.email,full_name=u.full_name,role=u.role.value,is_active=u.is_active) for u in session.exec(select(User).offset(skip).limit(limit)).all()]
@router.put('/users/{user_id}/toggle-active')
def toggle(user_id:int,current_user:User=Depends(require_role(UserRole.admin)),session:Session=Depends(get_session)):
    u=session.get(User,user_id)
    if not u:raise HTTPException(404,'Usuario no encontrado')
    u.is_active=not u.is_active;session.add(u);session.commit();return {'id':u.id,'is_active':u.is_active}