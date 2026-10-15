"""Reglas compartidas para la reputación de profesionales."""
from collections.abc import Iterable


def calculate_rating_summary(ratings: Iterable[int]) -> tuple[float | None, int]:
    """Devuelve promedio y cantidad de reseñas.

    Un perfil sin reseñas no tiene una calificación implícita: su promedio es
    ``None`` para que las capas API y UI puedan mostrar "Sin valoraciones".
    """
    values = list(ratings)
    count = len(values)
    return (round(sum(values) / count, 2), count) if count else (None, 0)