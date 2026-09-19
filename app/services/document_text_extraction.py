"""Extracción privada de texto de documentos clínicos adjuntos.

El resultado se cifra al persistir mediante ``ClinicalRecordDocument.extracted_text``.
Los fallos de OCR no bloquean la carga del documento original.
"""
from io import BytesIO


MAX_EXTRACTED_TEXT_LENGTH = 24_000
MINIMUM_LEGIBLE_ALPHANUMERIC_CHARACTERS = 8


def _clean_text(value: str) -> str:
    return " ".join(value.split())[:MAX_EXTRACTED_TEXT_LENGTH]


def is_extracted_text_legible(value: str | None) -> bool:
    """Indica si el resultado de extracción contiene texto clínico utilizable.

    El OCR puede devolver espacios, puntuación o unas pocas letras de ruido cuando
    la foto está desenfocada, muy oscura o el PDF solo contiene imágenes ilegibles.
    No se intenta interpretar ni validar el contenido médico: únicamente se exige
    una cantidad mínima de caracteres alfanuméricos para permitir la carga.
    """
    if not value:
        return False
    return sum(character.isalnum() for character in value) >= MINIMUM_LEGIBLE_ALPHANUMERIC_CHARACTERS


def _extract_pdf_text(content: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(BytesIO(content))
    return _clean_text("\n".join(page.extract_text() or "" for page in reader.pages))


def _extract_image_text(content: bytes) -> str:
    from PIL import Image, ImageOps
    import pytesseract

    with Image.open(BytesIO(content)) as image:
        prepared = ImageOps.grayscale(image)
        return _clean_text(pytesseract.image_to_string(prepared, lang="spa+eng"))


def extract_document_text(content: bytes, content_type: str) -> str | None:
    """Devuelve texto de PDF o imagen; ``None`` cuando no puede extraerse.

    En los PDF escaneados se intenta OCR de sus páginas si PyMuPDF está disponible.
    PyMuPDF no es una dependencia obligatoria: los PDF con capa de texto siguen
    siendo compatibles mediante pypdf.
    """
    try:
        if content_type == "application/pdf":
            text = _extract_pdf_text(content)
            if text:
                return text
            try:
                import fitz
                import pytesseract
                from PIL import Image

                document = fitz.open(stream=content, filetype="pdf")
                pages = []
                for page in document:
                    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                    image = Image.open(BytesIO(pixmap.tobytes("png")))
                    pages.append(pytesseract.image_to_string(image, lang="spa+eng"))
                return _clean_text("\n".join(pages)) or None
            except (ImportError, OSError, RuntimeError):
                return None
        if content_type in {"image/jpeg", "image/png"}:
            return _extract_image_text(content) or None
    except Exception:
        # Archivo corrupto, PDF protegido o motor OCR no disponible: el archivo
        # se conserva y la familia puede volver a cargar una versión legible.
        return None
    return None