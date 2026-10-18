"""Reglas compartidas para la cobertura exclusiva de Bogotá D.C."""
from typing import Iterable, Optional
import unicodedata


BOGOTA_CITY = "Bogotá D.C."
BOGOTA_LOCALITIES = {
    "usaquen", "chapinero", "santa fe", "san cristobal", "usme",
    "tunjuelito", "bosa", "kennedy", "fontibon", "engativa", "suba",
    "barrios unidos", "teusaquillo", "los martires", "antonio narino",
    "puente aranda", "la candelaria", "rafael uribe uribe", "ciudad bolivar",
    "sumapaz",
}


def normalize_location(value: str) -> str:
    """Normaliza texto para comparaciones geográficas sin depender de tildes."""
    return " ".join(
        "".join(
            char for char in unicodedata.normalize("NFD", value.lower())
            if unicodedata.category(char) != "Mn"
        ).split()
    )


def validate_bogota_city(value: Optional[str]) -> Optional[str]:
    """Acepta únicamente Bogotá D.C. como ciudad de una ficha clínica."""
    if value is None:
        return None
    if normalize_location(value) not in {"bogota", "bogota d.c.", "bogota dc"}:
        raise ValueError("El servicio está disponible únicamente en Bogotá D.C.")
    return BOGOTA_CITY


def validate_bogota_professional_location(value: Optional[str]) -> Optional[str]:
    """Valida una localidad profesional y devuelve el formato canónico."""
    if value is None:
        return None

    locality = value.split(",", 1)[0].strip()
    normalized = normalize_location(locality)
    if not normalized:
        return value
    if normalized not in BOGOTA_LOCALITIES:
        raise ValueError("Seleccione una localidad válida de Bogotá D.C.")
    return locality


def validate_bogota_coverage_localities(value: Optional[Iterable[str]]) -> Optional[list[str]]:
    """Valida y deduplica las localidades de cobertura de un profesional."""
    if value is None:
        return None
    if isinstance(value, (str, bytes)):
        raise ValueError("La cobertura debe ser una lista de localidades de Bogotá D.C.")

    localities: list[str] = []
    seen: set[str] = set()
    for locality in value:
        if not isinstance(locality, str):
            raise ValueError("Cada localidad de cobertura debe ser texto")
        validated = validate_bogota_professional_location(locality)
        if not validated:
            raise ValueError("Seleccione una localidad válida de Bogotá D.C.")
        normalized = normalize_location(validated)
        if normalized not in seen:
            seen.add(normalized)
            localities.append(validated)
    return localities


def profile_covers_locality(profile, locality: Optional[str]) -> bool:
    """Evalúa cobertura sin utilizar las localidades adicionales como marcadores."""
    if not locality:
        return True
    requested = normalize_location(locality)
    if not requested or getattr(profile, "covers_all_bogota", False):
        return True
    locations = [getattr(profile, "location", ""), *(getattr(profile, "coverage_localities", None) or [])]
    return any(normalize_location(item) == requested for item in locations if item)