# Pacientes, solicitudes y calificaciones — rol Family

---

## `FamilyPatientPanel.jsx`

Panel principal del familiar con dos tabs.

### Tab "Fichas"
CRUD de fichas clínicas. Máximo 5 por cuenta.

| Acción | Endpoint |
|---|---|
| Crear | `POST /api/clinical-records/` |
| Editar | `PUT /api/clinical-records/{id}` |
| Eliminar | `DELETE /api/clinical-records/{id}` (con modal de confirmación) |

### Tab "Mis solicitudes"
Lista de bookings del familiar cargada de `GET /api/bookings/my-requests`.

- Muestra estado con badge de color (`pending/approved/rejected/completed`)
- Muestra motivo de rechazo si existe
- Si `status=completed` y `!reviewed_by_family` → botón **"Calificar profesional"** que abre `RateServiceModal`
- Si ya calificó → texto "Ya calificaste este servicio"
- **Badge de notificación** en el tab con el conteo de servicios completados pendientes de calificar

---

## `PatientFormModal.jsx` — Formulario de ficha clínica

Formulario con 4 secciones (stepper visual con tabs).

### Sección 1 — Datos básicos
Nombre, edad, tipo de sangre, nivel de movilidad (chips), contacto de emergencia.

### Sección 2 — Condición médica
Diagnósticos, medicamentos, alergias (separados por coma con preview de chips), necesidades especiales.

### Sección 3 — Dirección y ubicación
La más compleja. 4 pasos con indicador de completitud (3 barras que se colorean).

**Paso 1 — Departamento → Ciudad**
- Selector de departamento filtra el selector de ciudad
- Al cambiar ciudad → limpia localidad y barrio

**Paso 2 — Localidad → Barrio**
- Si la ciudad tiene localidades en `colombiaGeo.js` → dropdown de selección
- Campo de barrio con **sugerencias en tiempo real**: filtra `getBarriosForLocalidad(city, localidad)` mientras el usuario escribe. Dropdown con `max-h-[160px]` + `onMouseDown` para evitar que el blur cierre el dropdown antes del click

**Paso 3 — Dirección exacta** (sub-tabs)
- **Constructor**: selecciona tipo de vía (chips), rellena número/cruce/puerta, vista previa en tiempo real `Calle 15 # 93 - 60`
- **Texto libre**: campo manual con validación de formato colombiano (regex), feedback visual (naranja si formato incorrecto, verde si válido). Integra `useGooglePlaces` hook para sugerencias si API key disponible

**Paso 4 — Tipo de vivienda**
Tarjetas seleccionables: Apartamento, Tiene ascensor, Casa/Unifamiliar. Textarea de referencias para el profesional.

### Hook `useGooglePlaces`
Inicializa `maps.places.Autocomplete` sobre el campo de dirección si Google Maps API está disponible. Al seleccionar un lugar extrae `address`, `neighborhood`, `city`, `lat`, `lng`. Restringido a Colombia.

### `handleSubmit`
Compone el payload final:
```js
finalAddress = form.address || builtAddress || null
// Envía: city, neighborhood, sector, address, floor_number, is_apartment, has_elevator, housing_notes
```

### Sección 4 — Seguridad social
EPS (chips), medicina prepagada (chips), hospital preferido.

---

## `PatientCard.jsx`
Tarjeta resumen de un familiar con botones Editar y Eliminar.

---

## `BookingModal.jsx` — Solicitud de servicio

Se abre desde `ProfessionalCard` o `ProfessionalDetailModal`.

**Funcionalidades:**

| Funcionalidad | Detalle |
|---|---|
| **Selector de familiar** | Carga fichas vía `GET /api/clinical-records/`. Al seleccionar → auto-llena `notes` con resumen médico |
| **Multi-día** | El usuario puede añadir varios días. Hace un `POST /api/bookings/` por cada día |
| **Plantillas** | Guarda/carga notas de uso frecuente en `localStorage(TEMPLATES_KEY)` |
| **Validaciones** | `endHour > startHour`, `notes` no vacío, al menos un día |

**Payload por día:**
```json
{
  "professional_user_id": 42,
  "professional_role": "caregiver",
  "date": "2026-09-15",
  "start_hour": 8,
  "end_hour": 14,
  "notes": "Paciente con Alzheimer, 82 años..."
}
```

---

## `RateServiceModal.jsx` — Calificación post-servicio

Reutilizable para ambas direcciones de calificación.

| Prop `role` | Endpoint llamado | Califica a |
|---|---|---|
| `"family"` | `POST /api/bookings/reviews` | Al profesional |
| `"caregiver"` / `"nurse"` | `POST /api/bookings/family-reviews` | Al familiar |

**UX:**
- 5 estrellas interactivas con `StarRating` (tamaño `lg`)
- Etiqueta textual según rating: Muy malo / Malo / Regular / Bueno / ¡Excelente!
- Campo de comentario opcional con contador de caracteres (máx 500)
- Al enviar con éxito → llama `onSuccess()` y el panel padre marca el booking como calificado sin recargar
