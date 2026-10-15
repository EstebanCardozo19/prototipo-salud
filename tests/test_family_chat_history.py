"""Pruebas del contexto conversacional del asistente para familias."""
import unittest
from unittest.mock import patch

from app.services import ai_agent


class FamilyChatHistoryTests(unittest.TestCase):
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

        self.assertEqual(result["texto"], "Encontré enfermeros.")
        self.assertEqual(result["profesionales"], [{"user_id": 1}])
        self.assertFalse(sai.called)
        self.assertEqual(search.call_args.kwargs["tipo_profesional"], "nurse")
        self.assertIn("Alzheimer", search.call_args.kwargs["descripcion_paciente"])

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

    def test_empty_provider_content_has_a_useful_fallback_message(self):
        response = {"choices": [{"message": {"content": "   "}}]}

        with patch("app.services.ai_agent.get_tool_definitions", return_value=[]), patch(
            "app.services.ai_agent._llamar_sai", return_value=response
        ):
            result = ai_agent.conversar("Hola")

        self.assertEqual(
            result["texto"],
            "Cuéntame qué tipo de apoyo necesita tu familiar para orientarte.",
        )

    def test_conversar_uses_prior_answers_without_repeating_them(self):
        history = [
            {"role": "user", "content": "Mi abuelo necesita ayuda nocturna por Alzheimer."},
            {"role": "assistant", "content": "¿Buscas un cuidador/a o un enfermero/a?"},
            {"role": "user", "content": "Un cuidador, por favor."},
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