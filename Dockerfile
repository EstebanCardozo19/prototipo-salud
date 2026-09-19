FROM python:3.11-slim

WORKDIR /code

# Dependencias del sistema para psycopg2
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev tesseract-ocr tesseract-ocr-spa && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Instalar PyTorch CPU-only primero (mucho más ligero: ~200MB vs ~2.5GB)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Instalar el resto de dependencias
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
