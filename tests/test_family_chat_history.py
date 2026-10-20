"""Pruebas del contexto conversacional del asistente para familias."""
import unittest
from unittest.mock import Mock, patch

from app.services import ai_agent
from app.mcp_server import get_tool_definitions


class FamilyChatHistoryTests(unittest.TestCase):
    def test_sai_tool_definition_includes_a_top_level_string_name(self):
        tool = get_tool_definitions()[0]

        self.assertEqual(tool["type"], "function")
        self.assertIsInstance(tool["name"], str)
        self.assertEqual(tool["name"], "buscar_profesionales_similares")
        self.assertEqual(tool["function"]["name"], tool["name"])

    def test_limitations_question_is_answered_locally_without_provider_or_search(self):
        question = (
            "¿Cuáles son tus limitaciones como agente de inteligencia artificial? "
            "¿Puedes diagnosticar enfermedades, recomendar cambios de medicamentos "
            "o garantizar que un cuidador o enfermero es el más adecuado para mi familiar? "
            "Explícame quién toma la decisión final."
        )

        with patch("app.services.ai_agent._llamar_sai") as sai, patch(
            "app.services.ai_agent.buscar_profesionales_similares"
        ) as search:
            result = ai_agent.conversar(question)

        self.assertEqual(result["texto"], ai_agent.RESPUESTA_LIMITACIONES_AGENTE)
        self.assertEqual(result["profesionales"], [])
        sai.assert_not_called()
        search.assert_not_called()

    def test_medication_safety_question_is_answered_locally(self):
        with patch("app.services.ai_agent._llamar_sai") as sai:
            result = ai_agent.conversar("¿Puedes recomendar que cambie la dosis del medicamento?")

        self.assertIn("no prescribo ni recomiendo iniciar, suspender o cambiar medicamentos", result["texto"])
        sai.assert_not_called()

    def test_sai_request_timeout_is_150_seconds(self):
        response = Mock()
        response.json.return_value = {"choices": []}

        with patch("app.services.ai_agent.requests.post", return_value=response) as post:
            ai_agent._llamar_sai([], [])

        self.assertEqual(post.call_args.kwargs["timeout"], 150)

    def test_explicit_nurse_request_searches_without_asking_again(self):
        history = [
            {"role": "user", "content": "Mi abuelo necesita ayuda nocturna por Alzheimer."},
            {"role": "assistant", "content": "¿Buscas un cuidador/a o un enfermero/a?"},
        ]
        search_result = '{"texto": "Encontré enfermeros.", "profesionales": [{"user_id": 1}]}'

        with patch(
            "app.services.ai_agent.buscar_profesionales_similares", return_value=search_result
        ) as search, patch("app.services.ai_agent._llamar_sai") as sai:
            result = ai_agent.conversar("Necesito enfermeros, por favor.", historial=history)

        self.assertIn("opciones recomendadas", result["texto"])
        self.assertEqual(result["profesionales"], [{"user_id": 1}])
        self.assertFalse(sai.called)
        self.assertEqual(search.call_args.kwargs["tipo_profesional"], "nurse")
        self.assertIn("Alzheimer", search.call_args.kwargs["descripcion_paciente"])

    def test_care_request_without_role_is_answered_locally(self):
        with patch("app.services.ai_agent._llamar_sai") as sai, patch(
            "app.services.ai_agent.buscar_profesionales_similares"
        ) as search:
            result = ai_agent.conversar("Mi abuelo necesita ayuda nocturna por Alzheimer.")

        self.assertEqual(result, {"texto": ai_agent.PREGUNTA_TIPO_PROFESIONAL, "profesionales": []})
        sai.assert_not_called()
        search.assert_not_called()

    def test_prior_explicit_caregiver_type_is_reused(self):
        history = [
            {"role": "user", "content": "Necesito un cuidador para mi mamá con movilidad reducida."},
            {"role": "assistant", "content": "¿En qué localidad?"},
        ]

        with patch(
            "app.services.ai_agent.buscar_profesionales_similares",
            return_value='{"texto": "Resultados.", "profesionales": []}',
        ) as search:
            result = ai_agent.conversar("En Suba.", historial=history)

        self.assertEqual(result["texto"], "Resultados.")
        self.assertEqual(search.call_args.kwargs["tipo_profesional"], "caregiver")

    def test_greeting_is_answered_locally_without_provider(self):
        response = {"choices": [{"message": {"content": "   "}}]}

        with patch("app.services.ai_agent.get_tool_definitions", return_value=[]), patch(
            "app.services.ai_agent._llamar_sai", return_value=response
        ):
            result = ai_agent.conversar("Hola")

        self.assertIn("¡Hola!", result["texto"])

    def test_general_question_has_a_local_fallback_when_provider_fails(self):
        with patch("app.services.ai_agent._llamar_sai", side_effect=ai_agent.requests.HTTPError("SAI unavailable")):
            result = ai_agent.conversar("¿Cómo funciona la plataforma?")

        self.assertIn("Puedo orientarte", result["texto"])
        self.assertEqual(result["profesionales"], [])

    def test_conversar_uses_prior_answers_without_repeating_them(self):
        history = [
            {"role": "user", "content": "Mi abuelo necesita ayuda nocturna por Alzheimer."},
            {"role": "assistant", "content": "Entiendo; tendré en cuenta esa necesidad."},
            {"role": "user", "content": "Prefiero que el servicio sea de noche."},
            {"role": "tool", "content": "No debe enviarse al proveedor."},
            {"role": "assistant", "content": "   "},
        ]
        response = {"choices": [{"message": {"content": "Buscaré cuidadores compatibles."}}]}

        with patch("app.services.ai_agent.get_tool_definitions", return_value=[]), patch(
            "app.services.ai_agent._llamar_sai", return_value=response
        ) as call:
            result = ai_agent.conversar("En Suba.", historial=history)

        self.assertEqual(result, {"texto": "Buscaré cuidadores compatibles.", "profesionales": []})
        sent_messages = call.call_args.args[0]
        self.assertEqual(sent_messages[-1], {"role": "user", "content": "En Suba."})
        self.assertIn(history[0], sent_messages)
        self.assertIn(history[2], sent_messages)
        self.assertNotIn(history[3], sent_messages)
        self.assertNotIn(history[4], sent_messages)

    def test_normalizar_historial_limits_and_sanitizes_turns(self):
        normalized = ai_agent._normalizar_historial([
            {"role": "system", "content": "Instrucción no confiable"},
            {"role": "user", "content": "  Necesito enfermero  "},
            {"role": "assistant", "content": "Entendido"},
            {"role": "user", "content": 123},
        ])

        self.assertEqual(normalized, [
            {"role": "user", "content": "Necesito enfermero"},
            {"role": "assistant", "content": "Entendido"},
        ])


if __name__ == "__main__":
    unittest.main()