"""Regresiones deterministas para los criterios académicos del agente."""
import json
import unittest
from unittest.mock import MagicMock, patch

from app.models import Availability, Booking, BookingStatus, CaregiverProfile, DayOfWeek, ProfileStatus, User, UserRole
from app.mcp_server import _is_schedule_available, _requested_schedule, buscar_profesionales_similares, calcular_compatibilidad
from app.routers import care_plan_router
from app.services import ai_agent


class AgentAcademicCriteriaTests(unittest.TestCase):
    def setUp(self):
        self.caregiver = CaregiverProfile(
            id=2, user_id=7, experience_years=6,
            specialties=["deterioro cognitivo", "acompañamiento"],
            location="Suba", coverage_localities=["Usaquén"],
            bio="Experiencia registrada en memoria, desorientación y apoyo cotidiano.",
            hourly_rate=50000, status=ProfileStatus.approved,
        )
        self.availability = [Availability(
            professional_user_id=7, day_of_week=DayOfWeek.monday,
            start_hour=8, end_hour=17, is_active=True,
        )]

    def test_cognitive_decline_uses_only_registered_compatibility_reasons(self):
        score, criteria = calcular_compatibilidad(
            self.caregiver, "caregiver",
            "Adulto mayor con deterioro cognitivo, memoria y desorientación", "Usaquén", self.availability,
        )
        self.assertGreater(score, 0)
        self.assertIn("coincide con necesidades y especialidad registradas", criteria)
        self.assertIn("cubre la localidad solicitada", criteria)

    def test_explicit_schedule_requires_complete_published_coverage_and_no_approved_conflict(self):
        schedule = _requested_schedule("Necesito cuidador el 2099-01-05 de 9 a 12")
        self.assertEqual(schedule, ("2099-01-05", 9, 12))
        self.assertTrue(_is_schedule_available(schedule, self.availability, []))
        conflict = Booking(
            professional_user_id=7, family_user_id=1, professional_role="caregiver",
            date="2099-01-05", start_hour=10, end_hour=13, status=BookingStatus.approved,
        )
        self.assertFalse(_is_schedule_available(schedule, self.availability, [conflict]))
        self.assertFalse(_is_schedule_available(("2099-01-05", 17, 20), self.availability, []))

    def test_reliability_question_does_not_invent_an_indicator(self):
        result = ai_agent.conversar("¿Cuál es el porcentaje de confiabilidad de los cuidadores?")
        self.assertIn("no tiene un indicador de confiabilidad", result["texto"])
        self.assertEqual(result["profesionales"], [])

    def test_general_care_without_explicit_role_is_handled_by_the_agent(self):
        response = {"choices": [{"message": {"content": ai_agent.PREGUNTA_TIPO_PROFESIONAL}}]}
        with patch("app.services.ai_agent._llamar_sai", return_value=response) as sai:
            result = ai_agent.conversar("Mi abuelo requiere acompañamiento, movilidad y ayuda con la alimentación.")
        self.assertEqual(result, {"texto": ai_agent.PREGUNTA_TIPO_PROFESIONAL, "profesionales": []})
        sai.assert_called_once()

    def test_catalog_queries_eligible_profiles_when_embedding_is_available(self):
        user = User(id=7, email="caregiver@example.test", password_hash="x", full_name="Cuidador Aprobado", role=UserRole.caregiver)
        session = MagicMock()
        session.exec.return_value.all.return_value = []
        session_context = MagicMock()
        session_context.__enter__.return_value = session

        with patch("app.mcp_server.generar_embedding", return_value=[0.1] * 384), patch(
            "app.mcp_server.Session", return_value=session_context
        ), patch("app.mcp_server._profiles", return_value=[(self.caregiver, user)]):
            result = json.loads(buscar_profesionales_similares("Necesito un cuidador para mi abuelo", "caregiver"))

        self.assertEqual(result["total"], 1)
        self.assertEqual(result["profesionales"][0]["full_name"], "Cuidador Aprobado")


class DocumentaryMedicationSafetyTests(unittest.TestCase):
    def test_incomplete_schedule_never_returns_or_infers_a_dose(self):
        family = User(id=1, email="family@example.test", password_hash="x", full_name="Familia", role=UserRole.family)
        booking = Booking(
            id=4, family_user_id=1, professional_user_id=7, professional_role="caregiver",
            date="2099-01-05", start_hour=8, end_hour=17, status=BookingStatus.approved,
        )

        class Result:
            def first(self):
                return type("Plan", (), {
                    "medication_schedule": [{"medication": "Medicamento registrado", "dosage": "", "time": "08:00"}],
                    "emergency_protocol": None,
                    "treating_physician_contact": None,
                })()

        class Session:
            def get(self, model, identifier):
                return booking if identifier == booking.id else None

            def exec(self, _query):
                return Result()

        with patch.object(care_plan_router, "_active_booking_for_participant", return_value=booking):
            response = care_plan_router.ask_documentary_assistant(
                4, care_plan_router.AssistantRequest(message="¿Cuál es la dosis del medicamento?"), family, Session(),
            )
        self.assertIn("no existe una pauta autorizada completa", response.response)
        self.assertNotIn("Medicamento registrado:", response.response)


if __name__ == "__main__":
    unittest.main()