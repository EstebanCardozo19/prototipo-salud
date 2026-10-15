"""Pruebas del contexto conversacional del asistente para familias."""
import unittest
from unittest.mock import patch

from app.services import ai_agent


class FamilyChatHistoryTests(unittest.TestCase):
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