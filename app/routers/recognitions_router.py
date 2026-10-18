"""Consulta de reconocimientos automáticos para profesionales."""
from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.auth import require_role
from app.database import get_session
from app.models import User, UserRole
from app.services.recognitions import recognition_summary

router = APIRouter(prefix="/api/recognitions", tags=["Reconocimientos"])


@router.get("/me")
def get_my_recognitions(
    current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse)),
    session: Session = Depends(get_session),
):
    summary = recognition_summary(current_user.id, session)
    session.commit()
    return summary