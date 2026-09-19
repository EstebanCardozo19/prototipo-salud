# Archivos de configuración e infraestructura backend

## `app/database.py`

| Símbolo | Descripción |
|---|---|
| `engine` | SQLAlchemy engine. Lee `DATABASE_URL` del entorno |
| `get_session()` | Generador Depends — abre sesión SQLModel, hace yield, cierra al terminar el request |

```python
DATABASE_URL = "postgresql+psycopg2://user:pass@host:port/db"
```

---

## `app/main.py` — Arranque

- Registra todos los routers con `app.include_router(...)`
- Monta `uploads/` como `StaticFiles` en la ruta `/uploads`
- `lifespan()` al arrancar:
  1. Crea carpeta `uploads/profiles/` si no existe
  2. Ejecuta `CREATE EXTENSION IF NOT EXISTS vector` (pgvector)
  3. `SQLModel.metadata.create_all(engine)` — crea las tablas que no existan

---

## `app/routers/upload_router.py` · `/api/upload`

Gestión de fotos de perfil.

| Endpoint | Auth | Descripción |
|---|---|---|
| `POST /profile-photo` | JWT | Sube imagen. Valida tipo (jpeg/png/webp) y tamaño (máx 5MB). Elimina foto anterior. Guarda como `user_{id}_{uuid}.ext`. Actualiza `User.photo_url` en DB |
| `DELETE /profile-photo` | JWT | Elimina archivo del disco y pone `photo_url = null` en DB |

Las fotos se sirven públicamente en `/uploads/profiles/{filename}`.

---

## Variables de entorno

| Variable | Default (dev) | Descripción |
|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg2://salud_user:salud_secret_2024@localhost:5433/salud_db` | Conexión a PostgreSQL |
| `JWT_SECRET_KEY` | `clave-secreta-cambiar-en-produccion-2024` | Clave de firma JWT |
| `SAI_API_KEY` | — | API key de SAI Applications para el agente IA |

---

## `docker-compose.yml`

| Servicio | Puerto | Notas |
|---|---|---|
| `db` (pgvector/pg16) | 5433:5432 | Volumen `pgdata` persistente |
| `api` (FastAPI) | 8000:8000 | Monta `./app`, `./uploads`. Recarga automática en cambios |
| `frontend` (Vite) | 3000:3000 | Monta `./frontend/src` e `index.html` |

**Volumen crítico para fotos:**
```yaml
api:
  volumes:
    - ./uploads:/code/uploads   # sin esto las fotos se pierden al reiniciar
```

---

## `requirements.txt` — Dependencias principales

| Paquete | Uso |
|---|---|
| `fastapi` | Framework web |
| `sqlmodel` | ORM (SQLAlchemy + Pydantic) |
| `psycopg2-binary` | Driver PostgreSQL |
| `python-jose[cryptography]` | JWT |
| `bcrypt` | Hash de passwords |
| `sentence-transformers` | Embeddings locales |
| `pgvector` | Tipo vector para SQLAlchemy |
| `python-multipart` | Subida de archivos |
| `requests` | Llamadas a SAI API |
| `python-dotenv` | Variables de entorno |
