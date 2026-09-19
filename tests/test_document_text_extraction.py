"""Pruebas de extracción segura de texto para adjuntos clínicos."""
import unittest
from unittest.mock import patch

from app.services.document_text_extraction import extract_document_text, is_extracted_text_legible


class DocumentTextExtractionTests(unittest.TestCase):
    def test_unsupported_content_type_is_ignored(self):
        self.assertIsNone(extract_document_text(b"text", "text/plain"))

    def test_image_ocr_failure_does_not_block_document_upload(self):
        with patch("app.services.document_text_extraction._extract_image_text", side_effect=OSError("OCR unavailable")):
            self.assertIsNone(extract_document_text(b"not-an-image", "image/png"))

    def test_pdf_text_is_returned_when_available(self):
        with patch("app.services.document_text_extraction._extract_pdf_text", return_value="Nota clínica"):
            self.assertEqual(extract_document_text(b"pdf", "application/pdf"), "Nota clínica")

    def test_legibility_requires_meaningful_alphanumeric_text(self):
        self.assertTrue(is_extracted_text_legible("Paciente Juan Pérez"))
        self.assertFalse(is_extracted_text_legible(None))
        self.assertFalse(is_extracted_text_legible(" -- .. / "))
        self.assertFalse(is_extracted_text_legible("abc"))


if __name__ == "__main__":
    unittest.main()