"""Validación del contrato estructurado de filtros para el chat familiar."""
import unittest

from pydantic import ValidationError

from app.main import ChatRequest, chat_search_description


class ChatSearchFilterTests(unittest.TestCase):
    def test_accepts_valid_bogota_locality_and_exact_schedule(self):
        request = ChatRequest(
            mensaje="Necesito una cuidadora.",
            localidad="Suba",
            fecha_servicio="2099-01-05",
            hora_inicio=9,
            hora_fin=12,
        )

        self.assertEqual(request.localidad, "Suba")
        self.assertEqual(request.fecha_servicio, "2099-01-05")

    def test_rejects_schedule_with_missing_values(self):
        with self.assertRaises(ValidationError):
            ChatRequest(mensaje="Necesito un enfermero.", fecha_servicio="2099-01-05")

    def test_rejects_non_bogota_locality(self):
        with self.assertRaises(ValidationError):
            ChatRequest(mensaje="Necesito un cuidador.", localidad="Soacha")

    def test_rejects_zero_duration_schedule(self):
        with self.assertRaises(ValidationError):
            ChatRequest(
                mensaje="Necesito una enfermera.",
                fecha_servicio="2099-01-05",
                hora_inicio=9,
                hora_fin=9,
            )

    def test_direct_catalog_description_keeps_exact_schedule(self):
        request = ChatRequest(
            mensaje="Necesito una cuidadora.",
            fecha_servicio="2099-01-05",
            hora_inicio=9,
            hora_fin=12,
        )

        self.assertEqual(
            chat_search_description(request),
            "Necesito una cuidadora. Servicio el 2099-01-05 de 9 a 12.",
        )


if __name__ == "__main__":
    unittest.main()