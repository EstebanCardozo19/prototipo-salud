import pytest

from app.services.bogota_locations import (
    BOGOTA_CITY,
    profile_covers_locality,
    validate_bogota_coverage_localities,
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


def test_coverage_localities_are_validated_and_deduplicated_without_accents():
    assert validate_bogota_coverage_localities(["Usaquén", "usaquen", "Suba"]) == ["Usaquén", "Suba"]


def test_coverage_localities_reject_non_bogota_locality():
    with pytest.raises(ValueError, match="localidad válida"):
        validate_bogota_coverage_localities(["Soacha"])


def test_profile_coverage_includes_primary_additional_and_all_bogota():
    class Profile:
        location = "Chapinero"
        coverage_localities = ["Suba"]
        covers_all_bogota = False

    profile = Profile()
    assert profile_covers_locality(profile, "Chapinero")
    assert profile_covers_locality(profile, "Suba")
    assert not profile_covers_locality(profile, "Kennedy")
    profile.covers_all_bogota = True
    assert profile_covers_locality(profile, "Kennedy")