import pytest

from app.services.bogota_locations import (
    BOGOTA_CITY,
    validate_bogota_city,
    validate_bogota_professional_location,
)


@pytest.mark.parametrize("value", ["Bogotá", "Bogota", "Bogotá D.C.", "Bogota DC"])
def test_validate_bogota_city_accepts_and_canonicalizes_bogota(value):
    assert validate_bogota_city(value) == BOGOTA_CITY


def test_validate_bogota_city_rejects_another_city():
    with pytest.raises(ValueError, match="únicamente en Bogotá"):
        validate_bogota_city("Soacha")


def test_validate_bogota_professional_location_accepts_bogota_locality():
    assert validate_bogota_professional_location("Usaquén, Bogotá D.C.") == "Usaquén"


def test_validate_bogota_professional_location_rejects_non_bogota_location():
    with pytest.raises(ValueError, match="localidad válida"):
        validate_bogota_professional_location("Soacha, Cundinamarca")