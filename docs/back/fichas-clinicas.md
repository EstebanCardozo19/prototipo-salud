# Fichas clínicas — `app/routers/clinical_router.py` · `/api/clinical-records`

Historia clínica de los pacientes/familiares a cargo de un usuario `family`.

## Reglas de negocio

- Solo accesible para rol `family` (excepto GET por ID que admite `admin`)
- Máximo **5 fichas por cuenta**
- Cada ficha pertenece a un único `family_user_id`

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/` | family | Crea ficha. Verifica que no supere 5 |
| GET | `/` | family | Lista todas las fichas propias |
| GET | `/{id}` | family / admin | Obtiene ficha por ID. Verifica ownership |
| PUT | `/{id}` | family | Actualiza cualquier campo (todos opcionales en update) |
| DELETE | `/{id}` | family | Elimina ficha. Verifica ownership |

## Datos que almacena

Ver [modelos.md — clinical_records](./modelos.md#clinical_records) para el detalle completo de campos.

Los más relevantes para la funcionalidad:

- **Datos médicos**: diagnoses, medications, allergies, mobility_level, special_needs
- **Ubicación estructurada**: city, neighborhood (localidad), sector (barrio), address (formato colombiano), datos de vivienda
- **Admin sanitario**: EPS, medicina prepagada, hospital preferido

## Uso en el sistema

Las fichas se usan en tres lugares:

1. **BookingModal** — Al seleccionar un familiar, auto-llena el campo `notes` con un resumen de diagnósticos, medicamentos y movilidad
2. **AI Agent** — `main.py` carga las fichas del familiar autenticado y las inyecta en el system prompt del agente para personalizar las recomendaciones
3. **SearchPanel** — `getFamilyLocations()` extrae las ciudades/localidades de las fichas para centrar el mapa y mostrar chips de acceso rápido

## Migración del campo `sector`

El campo `sector` (barrio específico) fue añadido posteriormente via:
```sql
ALTER TABLE clinical_records ADD COLUMN IF NOT EXISTS sector VARCHAR(100);
```
No requirió recrear la tabla.
