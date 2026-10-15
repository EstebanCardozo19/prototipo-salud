FROM python:3.11-slim

WORKDIR /code

# El modelo de embeddings se conserva dentro de la imagen para que las
# solicitudes en producción no necesiten descargarlo desde Hugging Face.
ENV HF_HOME=/opt/huggingface \
    SENTENCE_TRANSFORMERS_HOME=/opt/sentence-transformers

# Dependencias del sistema para psycopg2
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev tesseract-ocr tesseract-ocr-spa && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Instalar PyTorch CPU-only primero (mucho más ligero: ~200MB vs ~2.5GB)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Instalar el resto de dependencias
RUN pip install --no-cache-dir -r requirements.txt

# Descargar el modelo usado por la búsqueda semántica durante el build, antes
# de que exista tráfico de usuarios. El contenedor podrá usarlo sin red.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2', cache_folder='/opt/sentence-transformers')"

ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    PRELOAD_EMBEDDING_MODEL=true

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
