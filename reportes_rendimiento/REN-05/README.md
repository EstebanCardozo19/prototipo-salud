# REN-05 — Prueba de concurrencia local aislada

Este directorio contiene únicamente evidencia reproducible de REN-05. `docker-compose.ren05.yml` no usa `env_file` ni interpolación de variables y define una base PostgreSQL 16 con pgvector exclusiva (`ren05_db`), un volumen exclusivo (`ren05_pgdata`) y secretos deliberadamente exclusivos de prueba.

Los servicios se publican solamente en loopback: FastAPI en `127.0.0.1:18000` y PostgreSQL en `127.0.0.1:15432`. El archivo `.env` del repositorio no participa en esta ejecución. Los únicos endpoints bajo carga son `GET /api/caregivers/` y `GET /api/nurses/`; ninguno modifica datos.

Cada escenario usa Locust headless durante 30 segundos, con pacing uniforme aleatorio de 0.1 a 0.3 segundos. Los CSV generados por Locust y `results.md` son la fuente de resultados.