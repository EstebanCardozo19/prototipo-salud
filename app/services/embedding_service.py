"""
Servicio de generación de embeddings usando sentence-transformers (local).
Modelo: all-MiniLM-L6-v2 (384 dimensiones).

Se usa localmente porque es rápido, confiable y no depende de una API externa.
SAI Applications se usa para el agente conversacional, no para embeddings.
"""
from sentence_transformers import SentenceTransformer

# Carga lazy del modelo (se descarga la primera vez, ~90MB)
_model: SentenceTransformer | None = None

EMBEDDING_MODEL = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


def generar_embedding(texto: str) -> list[float]:
    """
    Genera un vector de embedding a partir de un texto libre.
    Retorna una lista de 384 floats normalizada (distancia coseno).
    """
    model = _get_model()
    embedding = model.encode(texto, normalize_embeddings=True)
    return embedding.tolist()
