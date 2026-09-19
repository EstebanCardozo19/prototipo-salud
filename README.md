# Plataforma Atención Domiciliaria — Fase 1

Plataforma que conecta familias con cuidadores de adultos mayores mediante IA (búsqueda por similitud vectorial).

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.11, FastAPI |
| ORM | SQLModel (sobre SQLAlchemy 2.0) |
| Base de datos | PostgreSQL 16 + pgvector |
| Infraestructura | Docker, Docker Compose |

## Estructura del Proyecto

```
.
├── docker-compose.yml      # Orquestación de servicios
├── Dockerfile              # Imagen de la API
├── requirements.txt        # Dependencias Python
├── seed.py                 # Script de datos semilla
├── .env.example            # Variables de entorno de referencia
└── app/
    ├── __init__.py
    ├── main.py             # Aplicación FastAPI + endpoints
    └── models.py           # Modelos SQLModel + columna vectorial
```

## Paso a Paso para Levantar el Proyecto

### 1. Clonar y configurar variables de entorno

```bash
cp .env.example .env
# Editar .env si deseas cambiar credenciales
```

### 2. Levantar servicios con Docker Compose

```bash
docker compose up -d --build
```

Esto levanta:
- **db** → PostgreSQL 16 con pgvector en puerto `5432`
- **api** → FastAPI con hot-reload en puerto `8000`

### 3. Ejecutar el script de seed

```bash
docker compose exec api python seed.py
```

Esto:
- Crea la extensión `vector` en PostgreSQL
- Crea las tablas `users` y `caregiver_profiles`
- Inserta 15 cuidadores con perfiles y embeddings aleatorios (dim 1536)

### 4. Verificar la API

```bash
# Health check
curl http://localhost:8000/health

# Listar cuidadores
curl http://localhost:8000/api/caregivers

# Obtener cuidador por ID
curl http://localhost:8000/api/caregivers/1
```

### 5. Documentación interactiva

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Verificación administrativa de profesionales

Los perfiles de cuidadores y enfermeros deben completar una verificación antes de aparecer en los listados públicos. Desde su dashboard, el profesional puede cargar documentos, conocer el estado de la solicitud y enviarla nuevamente si fue rechazada.

| Rol | Documentos obligatorios |
|---|---|
| Cuidador | Documento de identidad, certificado de formación y referencia laboral. No se exige tarjeta ni licencia profesional. |
| Enfermero | Documento de identidad, tarjeta/licencia profesional y título de enfermería. |

- Cada archivo admite PDF, JPEG o PNG con tamaño máximo de 10 MB.
- Los archivos se almacenan en `private_uploads/verification`; no se sirven como contenido estático público.
- Solo su propietario autenticado o un administrador puede descargarlos.
- Antes de enviar, el profesional debe tener diligenciadas su localidad y biografía.
- Un administrador aprueba o rechaza las solicitudes. El rechazo exige un motivo y habilita el reenvío tras corregir los documentos.
- Se pueden cargar múltiples certificados, cursos o títulos adicionales. Cada certificado o título debe incluir el nombre con el que se identifica el soporte.

### Endpoints principales

| Método | Ruta | Rol | Uso |
|---|---|---|---|
| GET | `/api/verification/me` | caregiver, nurse | Consulta la solicitud propia y sus documentos |
| POST | `/api/verification/documents/{document_type}` | caregiver, nurse | Carga o reemplaza un documento (`multipart/form-data`, campo `file`) |
| POST | `/api/verification/submit` | caregiver, nurse | Envía o reenvía la solicitud |
| GET | `/api/verification/documents/{document_id}/download` | propietario, admin | Descarga privada autorizada |
| GET | `/api/admin/profiles/pending` | admin | Lista solicitudes enviadas pendientes |
| PUT | `/api/admin/verifications/{verification_id}/review` | admin | Recibe `{ "status": "approved"|"rejected", "reason": "..." }` |

## Consulta de Similitud Vectorial (Ejemplo SQL)

Una vez poblada la base de datos, se puede buscar cuidadores por similitud coseno:

```sql
SELECT cp.id, u.full_name, cp.specialties, cp.location,
       1 - (cp.embedding <=> '[0.1, 0.2, ...]'::vector) AS similarity
FROM caregiver_profiles cp
JOIN users u ON u.id = cp.user_id
ORDER BY cp.embedding <=> '[0.1, 0.2, ...]'::vector
LIMIT 5;
```

En producción, el vector de consulta será generado por un modelo de embeddings (OpenAI `text-embedding-ada-002` o similar) a partir de la descripción de necesidades de la familia.

## Detener el Proyecto

```bash
docker compose down        # Detiene contenedores (datos persisten)
docker compose down -v     # Detiene y elimina volúmenes (borra datos)
```
