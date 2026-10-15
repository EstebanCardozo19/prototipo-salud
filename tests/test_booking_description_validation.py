"""Contrato de la descripción autorizada en solicitudes de servicio."""
import unittest

from app.routers.bookings_router import BookingCreate


class BookingDescriptionValidationTests(unittest.TestCase):
    def test_preserves_the_family_multiline_description_without_adding_clinical_data(self):
        authorized_description = (
            "Requiere acompañamiento para las comidas.\n"
            "Por favor ayudar con la movilidad dentro de casa."
        )

        request = BookingCreate(
            professional_user_id=2,
            professional_role="caregiver",
            clinical_record_id=3,
            date="2099-10-10",
            start_hour=8,
            end_hour=12,
            notes=authorized_description,
        )

        self.assertEqual(request.notes, authorized_description)
        self.assertNotIn("medicamento", request.notes.lower())


if __name__ == "__main__":
    unittest.main()