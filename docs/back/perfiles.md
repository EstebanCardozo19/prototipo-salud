# Perfiles de profesionales y admin

## Cuidadores — `app/routers/caregivers_router.py` · `/api/caregivers`

### Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/` | Público | Lista cuidadores con `status=approved`. Parámetros: `location` (ILIKE), `search` (nombre/bio/especialidad) |
| GET | `/me` | caregiver | Perfil propio, incluso si está pendiente o rechazado |
| GET | `/{id}` | Público | Perfil aprobado por ID |
| PUT | `/me` | caregiver | Actualiza bio, location, experience_years, hourly_rate. **Si cambia bio o specialties → regenera embedding** |

### Filtro de búsqueda
`/api/caregivers/?location=Chapinero&search=alzheimer`

- `location` → `ILIKE %valor%` sobre `caregiver_profiles.location`  
- `search` → filtro en Python sobre nombre, bio y especialidades (case-insensitive)

### Regeneración de embedding
Cuando el cuidador actualiza su perfil, si cambió `bio` o `specialties`:
```python
texto = f"{bio} {' '.join(specialties)}"
profile.embedding = generar_embedding(texto)
```
Esto actualiza el vector de 384 dimensiones para que la búsqueda semántica del agente IA refleje el nuevo contenido.

---

## Enfermeros — `app/routers/nurses_router.py` · `/api/nurses`

Estructura idéntica a caregivers. Diferencias:

- Campo `specialty` es un enum estricto (`NurseSpecialty`) en lugar de array libre
- Añade `license_number`, `institution`
- El embedding se genera igual: `bio + specialty`
- `GET /api/nurses/me` devuelve el perfil propio sin depender del listado público.

### Schemas adicionales

| Campo en update | Descripción |
|---|---|
| `specialty` | enum de especialidad |
| `institution` | hospital/clínica de referencia |

---

## Verificación profesional — `app/routers/verification_router.py` · `/api/verification`

Solo accesible para roles `caregiver` y `nurse` (salvo la descarga, que también permite `admin`). La solicitud se crea automáticamente al consultar `GET /me`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/me` | Estado, fechas, motivo de rechazo, documentos cargados y tipos requeridos |
| POST | `/documents/{document_type}` | Carga o reemplaza un archivo usando `multipart/form-data` con el campo `file` y, para certificados o títulos, `document_name` |
| POST | `/submit` | Comprueba requisitos y envía/reenvía la solicitud |
| GET | `/documents/{document_id}/download` | Descarga privada para propietario o administrador |

### Reglas de documentos y envío

| Rol | Tipos requeridos |
|---|---|
| `caregiver` | Ninguno. Puede adjuntar opcionalmente `identity`, `training`, `work_reference` y certificados adicionales. |
| `nurse` | `identity`, `professional_license`, `nursing_degree` |

- Formatos admitidos: `application/pdf`, `image/jpeg` e `image/png`.
- Tamaño máximo: 10 MB por archivo.
- Los documentos `training`, `nursing_degree` y `additional_certificate` requieren un `document_name` no vacío (máximo 150 caracteres).
- Al reemplazar un tipo documental se elimina el archivo anterior del almacenamiento privado.
- Para enfermería, el envío requiere todos los tipos obligatorios; para cuidadores, los soportes son opcionales. En ambos casos el perfil debe tener `location` y `bio`.
- Los documentos se guardan en `private_uploads/verification`; no están expuestos bajo `/uploads`.

## Admin — `app/routers/admin_router.py` · `/api/admin`

Solo accesible con rol `admin`.

| Endpoint | Descripción |
|---|---|
| `GET /users` | Lista todos los usuarios del sistema |
| `GET /profiles/pending` | Solicitudes enviadas y pendientes, con documentos y enlaces de descarga privados |
| `PUT /verifications/{id}/review` | Aprueba o rechaza una solicitud. Body: `status` (`approved`/`rejected`) y `reason` obligatorio al rechazar |

La revisión actualiza tanto la solicitud como el estado del perfil profesional. Un cuidador o enfermero solo aparece en búsquedas públicas cuando su `status = approved`.
