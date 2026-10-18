"""Regresión de HU-021: comentarios textuales de servicios cancelados."""
import unittest

from fastapi import HTTPException

from app.models import (
    Booking, BookingStatus, CancelledServiceComment, User, UserRole,
)
from app.routers.bookings_router import (
    CancelledCommentCreate, create_cancelled_comment,
    validate_cancelled_comment_content,
)


class Result:
    def __init__(self, items): self.items = items
    def first(self): return self.items[0] if self.items else None
    def all(self): return self.items


class CommentSession:
    def __init__(self, booking, users):
        self.booking = booking
        self.users = users
        self.comments = []
        self.committed = False

    def get(self, model, item_id):
        if model is Booking: return self.booking if item_id == self.booking.id else None
        if model is User: return self.users.get(item_id)
        return None

    def exec(self, _statement):
        # Estas pruebas ejercen el flujo de creación; el endpoint consulta si
        # existe un comentario del mismo autor. La sesión mínima conserva esa
        # semántica mediante el parámetro enlazado de la sentencia.
        params = _statement.compile().params
        author_id = next((value for key, value in params.items() if 'author_user_id' in key), None)
        return Result([item for item in self.comments if item.author_user_id == author_id])

    def add(self, item):
        if isinstance(item, CancelledServiceComment):
            item.id = len(self.comments) + 1
            self.comments.append(item)

    def commit(self): self.committed = True
    def refresh(self, _item): pass


class CancelledServiceCommentTests(unittest.TestCase):
    def setUp(self):
        self.family = User(id=1, email='family@test', password_hash='x', full_name='Familia', role=UserRole.family)
        self.professional = User(id=2, email='pro@test', password_hash='x', full_name='Profesional', role=UserRole.caregiver)
        self.outsider = User(id=3, email='other@test', password_hash='x', full_name='Ajeno', role=UserRole.family)

    def booking(self, state=BookingStatus.cancelled, cancelled_by_user_id=1):
        return Booking(id=10, family_user_id=1, professional_user_id=2, professional_role='caregiver', date='2099-10-10', start_hour=8, end_hour=12, status=state, cancelled_by_user_id=cancelled_by_user_id)

    def test_both_parties_can_comment_without_stars(self):
        session = CommentSession(self.booking(), {1: self.family, 2: self.professional})
        family_comment = create_cancelled_comment(10, CancelledCommentCreate(comment='La coordinación cambió con anticipación.'), self.family, session)
        professional_comment = create_cancelled_comment(10, CancelledCommentCreate(comment='Recibí el aviso y pude reorganizar mi agenda.'), self.professional, session)
        self.assertEqual(len(session.comments), 2)
        self.assertFalse(hasattr(session.comments[0], 'rating'))
        self.assertEqual(family_comment.author_role, 'family')
        self.assertEqual(professional_comment.author_role, 'caregiver')

    def test_family_can_comment_when_the_professional_cancelled(self):
        session = CommentSession(self.booking(cancelled_by_user_id=self.professional.id), {1: self.family, 2: self.professional})

        comment = create_cancelled_comment(
            10,
            CancelledCommentCreate(comment='El profesional avisó la cancelación del servicio.'),
            self.family,
            session,
        )

        self.assertEqual(comment.author_role, 'family')
        self.assertEqual(len(session.comments), 1)
        self.assertEqual(session.comments[0].author_user_id, self.family.id)

    def test_rejects_duplicate_and_outsider(self):
        session = CommentSession(self.booking(), {1: self.family, 2: self.professional, 3: self.outsider})
        create_cancelled_comment(10, CancelledCommentCreate(comment='La coordinación cambió con anticipación.'), self.family, session)
        with self.assertRaises(HTTPException) as duplicate:
            create_cancelled_comment(10, CancelledCommentCreate(comment='Otro comentario diferente.'), self.family, session)
        self.assertEqual(duplicate.exception.status_code, 409)
        with self.assertRaises(HTTPException) as outsider:
            create_cancelled_comment(10, CancelledCommentCreate(comment='No participé en este servicio.'), self.outsider, session)
        self.assertEqual(outsider.exception.status_code, 403)

    def test_rejects_non_cancelled_services_and_sensitive_content(self):
        session = CommentSession(self.booking(BookingStatus.completed), {1: self.family, 2: self.professional})
        with self.assertRaises(HTTPException) as rejected:
            create_cancelled_comment(10, CancelledCommentCreate(comment='Texto válido para otro estado.'), self.family, session)
        self.assertEqual(rejected.exception.status_code, 400)
        for text in ('Llámame al 300 123 4567', 'El diagnóstico del paciente cambió', 'Es un idiota'):
            with self.subTest(text=text):
                with self.assertRaises(ValueError):
                    validate_cancelled_comment_content(text)


if __name__ == '__main__':
    unittest.main()