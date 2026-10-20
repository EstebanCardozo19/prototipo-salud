"""Pruebas de comportamiento determinista del recomendador familiar."""
import json
import unittest
from unittest.mock import patch

from app.models import Availability, CaregiverProfile, DayOfWeek, NurseProfile, NurseSpecialty, User, UserRole
from app.mcp_server import calcular_compatibilidad
from app.services import ai_agent


class RecommendationAgentConversationTests(unittest.TestCase):
    def test_greeting_does_not_call_catalog_or_provider(self):
        with patch("app.services.ai_agent.buscar_profesionales_similares") as search, patch("app.services.ai_agent._llamar_sai") as provider:
            result = ai_agent.conversar("Hola")
        self.assertIn("¡Hola!", result["texto"])
        self.assertEqual(result["profesionales"], [])
        search.assert_not_called()
        provider.assert_not_called()

    def test_follow_up_uses_the_real_profile_named_in_question(self):
        profile = {"full_name": "Rosa Helena Flores Vega", "role": "nurse", "hourly_rate": 75000.0, "location": "Suba", "experience_years": 9, "specialty_display": "geriatrics", "specialties": ["geriatrics"], "rating_count": 3, "rating_avg": 4.7}
        history = [{"role": "user", "content": "Muéstrame enfermeros."}, {"role": "assistant", "content": "Encontré opciones."}]
        with patch("app.services.ai_agent.buscar_profesional_por_nombre", return_value=[profile]) as lookup, patch("app.services.ai_agent.buscar_profesionales_similares") as search:
            result = ai_agent.conversar("¿Cuál es la tarifa y experiencia de Rosa Helena Flores Vega?", historial=history)
        self.assertIn("$75,000/h", result["texto"])
        self.assertIn("9 años", result["texto"])
        self.assertEqual(result["profesionales"], [profile])
        lookup.assert_called_once_with("Rosa Helena Flores Vega")
        search.assert_not_called()

    def test_next_request_preserves_type_and_advances_page(self):
        history = [{"role": "user", "content": "Necesito enfermeros para mi abuelo."}, {"role": "assistant", "content": "Página 1."}]
        payload = json.dumps({"texto": "Encontré 8 enfermeros.", "profesionales": [{"user_id": 7}], "page": 2})
        with patch("app.services.ai_agent.buscar_profesionales_similares", return_value=payload) as search:
            result = ai_agent.conversar("Muéstrame los siguientes", historial=history)
        self.assertEqual(search.call_args.kwargs["tipo_profesional"], "nurse")
        self.assertEqual(search.call_args.kwargs["page"], 2)
        self.assertEqual(result["profesionales"], [{"user_id": 7}])

    def test_explicit_locality_is_passed_to_deterministic_catalog(self):
        payload = json.dumps({"texto": "Encontré enfermeros.", "profesionales": []})
        with patch("app.services.ai_agent.buscar_profesionales_similares", return_value=payload) as search:
            ai_agent.conversar("Necesito enfermeros.", localidad="Chapinero")
        self.assertEqual(search.call_args.kwargs["localidad"], "Chapinero")

    def test_explicit_caregiver_request_explains_why_each_profile_is_recommended(self):
        payload = json.dumps({
            "texto": "Encontré cuidadores.",
            "profesionales": [{
                "full_name": "Ana Torres",
                "compatibility_criteria": [
                    "coincide con necesidades y especialidad registradas",
                    "8 años de experiencia",
                    "tiene disponibilidad publicada compatible",
                ],
            }],
            "page": 1,
        })
        message = (
            "Necesito un cuidador para un adulto mayor que presenta deterioro cognitivo, "
            "problemas de memoria y episodios de desorientación. Busco una persona con "
            "experiencia atendiendo casos similares. ¿Qué cuidadores disponibles me recomiendas y por qué?"
        )

        with patch("app.services.ai_agent.buscar_profesionales_similares", return_value=payload) as search, patch(
            "app.services.ai_agent._llamar_sai"
        ) as provider:
            result = ai_agent.conversar(message)

        self.assertEqual(search.call_args.kwargs["tipo_profesional"], "caregiver")
        self.assertIn("Ana Torres", result["texto"])
        self.assertIn("coincide con necesidades y especialidad registradas", result["texto"])
        self.assertIn("8 años de experiencia", result["texto"])
        self.assertIn("por qué", result["texto"].lower())
        self.assertEqual(result["profesionales"][0]["full_name"], "Ana Torres")
        provider.assert_not_called()


class CompatibilityScoreTests(unittest.TestCase):
    def setUp(self):
        self.nurse = NurseProfile(user_id=1, specialty=NurseSpecialty.neurology, license_number="RN-1", experience_years=8, bio="Experiencia en Alzheimer y neurología.", location="Suba", hourly_rate=80000, rating_avg=4.5, rating_count=10)
        self.availability = [Availability(professional_user_id=1, day_of_week=DayOfWeek.monday, start_hour=8, end_hour=18, is_active=True)]

    def test_same_inputs_produce_same_documented_percentage(self):
        first = calcular_compatibilidad(self.nurse, "nurse", "Adulto con Alzheimer necesita enfermero el lunes", "Suba", self.availability)
        second = calcular_compatibilidad(self.nurse, "nurse", "Adulto con Alzheimer necesita enfermero el lunes", "Suba", self.availability)
        self.assertEqual(first, second)
        # 40 necesidades + 16 experiencia + 20 ubicación + 10 disponibilidad
        # + 9 por una valoración de 4.5/5 = 95.
        self.assertEqual(first[0], 95)
        self.assertIn("cubre la localidad solicitada", first[1])

    def test_score_changes_only_when_a_real_criterion_changes(self):
        without_availability = calcular_compatibilidad(self.nurse, "nurse", "Adulto con Alzheimer necesita enfermero el lunes", "Suba", [])
        with_availability = calcular_compatibilidad(self.nurse, "nurse", "Adulto con Alzheimer necesita enfermero el lunes", "Suba", self.availability)
        self.assertEqual(with_availability[0] - without_availability[0], 10)


if __name__ == "__main__":
    unittest.main()