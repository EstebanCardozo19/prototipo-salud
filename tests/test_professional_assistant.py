"""Pruebas de límites de acceso y seguridad del asistente profesional."""
import unittest
from datetime import datetime
from unittest.mock import patch

from fastapi import HTTPException

from app.mcp_server import obtener_contexto_paciente_asignado
from app.models import Booking, BookingStatus, ClinicalRecord, ClinicalRecordDocument, User, UserRole
from app.routers import professional_assistant_router as assistant
from app.services.service_lifecycle import SERVICE_TIMEZONE, complete_expired_services, is_service_active


class FakeSession:
    def __init__(self, booking, record):
        self.booking = booking
        self.record = record
        self.added = []

    def get(self, model, identifier):
        if model is Booking:
            return self.booking if identifier == self.booking.id else None
        if model is ClinicalRecord:
            return self.record if identifier == self.record.id else None
        return None

    def exec(self, _query):
        class Result:
            def first(self):
                return None
        return Result()

    def add(self, value):
        self.added.append(value)

    def commit(self):
        pass


class FakeLifecycleSession:
    def __init__(self, bookings):
        self.bookings = bookings
        self.added = []
        self.committed = False

    def exec(self, _query):
        class Result:
            def __init__(self, bookings):
                self.bookings = bookings

            def all(self):
                return self.bookings
        return Result(self.bookings)

    def add(self, booking):
        self.added.append(booking)

    def commit(self):
        self.committed = True


class ProfessionalAssistantSecurityTests(unittest.TestCase):
    def setUp(self):
        self.booking = Booking(
            id=10, family_user_id=20, clinical_record_id=30, professional_user_id=40,
            professional_role="caregiver", date="2026-09-18", start_hour=8,
            end_hour=18, status=BookingStatus.approved,
        )
        self.record = ClinicalRecord(
            id=30, family_user_id=20, patient_name="Paciente", patient_age=82,
            diagnoses=["Diagnóstico privado"], medications=["Medicamento privado"],
            allergies=["Alergia documentada"], address="Dirección privada",
            emergency_contact="Contacto privado", eps="EPS privada",
        )
        self.user = User(id=40, email="professional@example.com", password_hash="x", full_name="Profesional", role=UserRole.caregiver)
        self.session = FakeSession(self.booking, self.record)

    def test_caregiver_context_excludes_sensitive_and_clinical_details(self):
        context = obtener_contexto_paciente_asignado(self.booking, self.record)
        patient = context["patient"]
        self.assertNotIn("diagnoses", patient)
        self.assertNotIn("medications_registered", patient)
        self.assertNotIn("address", patient)
        self.assertNotIn("emergency_contact", patient)
        self.assertNotIn("eps", patient)

    def test_nurse_context_can_include_authorized_clinical_details(self):
        context = obtener_contexto_paciente_asignado(self.booking, self.record, include_clinical_details=True)
        self.assertEqual(context["patient"]["diagnoses"], ["Diagnóstico privado"])
        self.assertEqual(context["patient"]["medications_registered"], ["Medicamento privado"])

    def test_rejects_different_professional(self):
        other_user = User(id=41, email="other@example.com", password_hash="x", full_name="Otro", role=UserRole.nurse)
        with self.assertRaises(HTTPException) as raised:
            assistant._authorized_booking_context(10, other_user, self.session)
        self.assertEqual(raised.exception.status_code, 403)

    def test_rejects_non_approved_booking(self):
        self.booking.status = BookingStatus.pending
        with self.assertRaises(HTTPException) as raised:
            assistant._authorized_booking_context(10, self.user, self.session)
        self.assertEqual(raised.exception.status_code, 403)

    def test_rejects_mismatched_clinical_record(self):
        self.record.family_user_id = 999
        with patch.object(assistant, "is_service_active", return_value=True), self.assertRaises(HTTPException) as raised:
            assistant._authorized_booking_context(10, self.user, self.session)
        self.assertEqual(raised.exception.status_code, 409)

    def test_rejects_service_before_its_scheduled_start(self):
        with patch.object(assistant, "is_service_active", return_value=False):
            with self.assertRaises(HTTPException) as raised:
                assistant._authorized_booking_context(10, self.user, self.session)
        self.assertEqual(raised.exception.status_code, 403)
        self.assertIn("horario activo", raised.exception.detail)
    def test_approved_assigned_booking_is_available_during_its_schedule(self):
        with patch.object(assistant, "is_service_active", return_value=True):
            booking, record, plan = assistant._authorized_booking_context(10, self.user, self.session)
        self.assertEqual(booking.id, 10)
        self.assertEqual(record.id, 30)
        self.assertIsNone(plan)
        self.assertEqual(booking.id, 10)
        self.assertEqual(record.id, 30)
        self.assertIsNone(plan)

    def test_service_is_active_only_within_its_scheduled_hours(self):
        self.assertFalse(is_service_active(self.booking, datetime(2026, 9, 18, 7, 59, tzinfo=SERVICE_TIMEZONE)))
        self.assertTrue(is_service_active(self.booking, datetime(2026, 9, 18, 8, 0, tzinfo=SERVICE_TIMEZONE)))
        self.assertTrue(is_service_active(self.booking, datetime(2026, 9, 18, 17, 59, tzinfo=SERVICE_TIMEZONE)))
        self.assertFalse(is_service_active(self.booking, datetime(2026, 9, 18, 18, 0, tzinfo=SERVICE_TIMEZONE)))

    def test_automatically_completes_approved_service_30_minutes_after_end(self):
        lifecycle_session = FakeLifecycleSession([self.booking])
        completed = complete_expired_services(
            lifecycle_session,
            datetime(2026, 9, 18, 18, 30, tzinfo=SERVICE_TIMEZONE),
        )
        self.assertEqual(completed, 1)
        self.assertEqual(self.booking.status, BookingStatus.completed)
        self.assertTrue(lifecycle_session.committed)

    def test_does_not_automatically_complete_before_30_minute_grace_period(self):
        lifecycle_session = FakeLifecycleSession([self.booking])
        completed = complete_expired_services(
            lifecycle_session,
            datetime(2026, 9, 18, 18, 29, tzinfo=SERVICE_TIMEZONE),
        )
        self.assertEqual(completed, 0)
        self.assertEqual(self.booking.status, BookingStatus.approved)
        self.assertFalse(lifecycle_session.committed)

    def test_approved_assigned_booking_context_is_returned_when_active(self):
        with patch.object(assistant, "is_service_active", return_value=True):
            booking, record, plan = assistant._authorized_booking_context(10, self.user, self.session)
        self.assertEqual(booking.id, 10)
        self.assertEqual(record.id, 30)
        self.assertIsNone(plan)

    def test_emergency_notification_failure_does_not_block_urgent_guidance(self):
        class FailingSession:
            def rollback(self):
                pass
        with patch.object(assistant, "create_notification", side_effect=RuntimeError("db unavailable")), patch.object(assistant, "dispatch_emergency_webhook", return_value=False):
            response, escalated = assistant._emergency_response(FailingSession(), self.booking)
        self.assertIn("llama al 123", response)
        self.assertIn("no pudo registrarse", response)
        self.assertFalse(escalated)

    def test_audit_log_contains_only_metadata(self):
        assistant._audit(self.session, self.user, self.booking, "ask_assistant")
        audit_log = self.session.added[0]
        self.assertEqual(audit_log.professional_user_id, self.user.id)
        self.assertEqual(audit_log.booking_id, self.booking.id)
        self.assertEqual(audit_log.clinical_record_id, self.record.id)
        self.assertEqual(audit_log.action, "ask_assistant")
        self.assertNotIn("message", audit_log.__dict__)
        self.assertNotIn("response", audit_log.__dict__)

    def test_conversational_answer_receives_only_authorized_context(self):
        context = obtener_contexto_paciente_asignado(self.booking, self.record)
        history = [{"role": "user", "content": "Hola"}]
        with patch("app.services.ai_agent.conversar_con_contexto_documental", return_value="¡Hola! ¿En qué información registrada te apoyo?") as conversational:
            response = assistant._conversational_documentary_answer("hola", context, history, False)
        self.assertIn("Hola", response)
        conversational.assert_called_once_with("hola", context, history)
        sent_context = conversational.call_args.args[1]
        self.assertNotIn("address", sent_context["patient"])
        self.assertNotIn("emergency_contact", sent_context["patient"])
        self.assertNotIn("diagnoses", sent_context["patient"])

    def test_document_text_is_excluded_without_explicit_family_consent(self):
        self.record.allow_professional_document_access = False
        context = obtener_contexto_paciente_asignado(self.booking, self.record)
        document_session = DocumentSession(self.booking, self.record, [ClinicalRecordDocument(
            id=1, clinical_record_id=self.record.id, original_filename="historia.pdf",
            stored_filename="private.pdf", content_type="application/pdf", size_bytes=12,
            extracted_text="Dato clínico del adjunto",
        )])
        granted = assistant._add_authorized_document_context(context, self.record, document_session)
        self.assertFalse(granted)
        self.assertNotIn("authorized_clinical_documents", context)

    def test_document_text_is_sent_to_assistant_only_after_explicit_consent(self):
        self.record.allow_professional_document_access = True
        context = obtener_contexto_paciente_asignado(self.booking, self.record)
        document_session = DocumentSession(self.booking, self.record, [ClinicalRecordDocument(
            id=1, clinical_record_id=self.record.id, original_filename="historia.pdf",
            stored_filename="private.pdf", content_type="application/pdf", size_bytes=12,
            extracted_text="Dato clínico del adjunto",
        )])
        granted = assistant._add_authorized_document_context(context, self.record, document_session)
        self.assertTrue(granted)
        self.assertEqual(context["authorized_clinical_documents"][0]["text"], "Dato clínico del adjunto")

    def test_manual_context_includes_document_text_only_after_explicit_consent(self):
        self.record.allow_professional_document_access = True
        document_session = DocumentSession(self.booking, self.record, [ClinicalRecordDocument(
            id=1, clinical_record_id=self.record.id, original_filename="historia.pdf",
            stored_filename="private.pdf", content_type="application/pdf", size_bytes=12,
            extracted_text="Dato clínico del adjunto",
        )])
        with patch.object(assistant, "is_service_active", return_value=True):
            context = assistant.get_context(10, self.user, document_session)
        self.assertTrue(context["document_access_authorized"])
        self.assertEqual(context["authorized_clinical_documents"][0]["text"], "Dato clínico del adjunto")
        self.assertEqual(document_session.added[0].action, "view_context_documents")

    def test_manual_context_excludes_document_text_without_explicit_consent(self):
        self.record.allow_professional_document_access = False
        document_session = DocumentSession(self.booking, self.record, [ClinicalRecordDocument(
            id=1, clinical_record_id=self.record.id, original_filename="historia.pdf",
            stored_filename="private.pdf", content_type="application/pdf", size_bytes=12,
            extracted_text="Dato clínico del adjunto",
        )])
        with patch.object(assistant, "is_service_active", return_value=True):
            context = assistant.get_context(10, self.user, document_session)
        self.assertFalse(context["document_access_authorized"])
        self.assertNotIn("authorized_clinical_documents", context)
        self.assertEqual(document_session.added[0].action, "view_context")


class DocumentSession:
    def __init__(self, booking, record, documents):
        self.booking = booking
        self.record = record
        self.documents = documents
        self.added = []

    def get(self, model, identifier):
        if model is Booking:
            return self.booking if identifier == self.booking.id else None
        if model is ClinicalRecord:
            return self.record if identifier == self.record.id else None
        return None

    def exec(self, _query):
        class Result:
            def __init__(self, documents):
                self.documents = documents

            def all(self):
                return self.documents

            def first(self):
                return None
        return Result(self.documents)

    def add(self, value):
        self.added.append(value)

    def commit(self):
        pass


if __name__ == "__main__":
    unittest.main()