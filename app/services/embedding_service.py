"""
Servicio de generación de embeddings usando sentence-transformers (local).
Modelo: all-MiniLM-L6-v2 (384 dimensiones).

En producción el modelo se descarga al construir la imagen y se carga desde
disco, por lo que no se consulta Hugging Face durante una petición.
SAI Applications se usa para el agente conversacional, no para embeddings.
"""
import os

from sentence_transformers import SentenceTransformer

# Carga lazy del modelo. Docker lo guarda en SENTENCE_TRANSFORMERS_HOME durante
# el build y el modo offline evita descargas inesperadas en tiempo de ejecución.
_model: SentenceTransformer | None = None

EMBEDDING_MODEL = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(
            EMBEDDING_MODEL,
            cache_folder=os.getenv("SENTENCE_TRANSFORMERS_HOME"),
            local_files_only=os.getenv("HF_HUB_OFFLINE", "").lower() in {"1", "true", "yes"},
        )
    return _model


def precargar_modelo() -> None:
    """Carga el modelo antes de aceptar tráfico cuando la variable lo habilita."""
    _get_model()


def generar_embedding(texto: str) -> list[float]:
    """
    Genera un vector de embedding a partir de un texto libre.
    Retorna una lista de 384 floats normalizada (distancia coseno).
    """
    model = _get_model()
    embedding = model.encode(texto, normalize_embeddings=True)
    return embedding.tolist()
