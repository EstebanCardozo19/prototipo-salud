# Búsqueda de profesionales

Flujo completo: lista de tarjetas → modal de detalle con mapa → solicitar servicio.

---

## `SearchPanel.jsx` — `src/components/professionals/`

Panel principal de búsqueda. Consume `/api/caregivers/` y `/api/nurses/`.

### Estado interno

| Estado | Descripción |
|---|---|
| `caregivers / doctors` | Listas cargadas del API |
| `reviewsMap` | Objeto `{ user_id: reviews[] }` — cargado en paralelo para cada profesional |
| `selectedCity / selectedLocalidad` | Filtros geográficos activos |
| `filters` | `{ gender, specialty, minExp, maxPrice, minRating, sortBy }` |
| `viewMode` | `'list'` o `'map'` |
| `familyRecords` | Fichas del familiar autenticado para chips de ubicación |

### Filtrado (`applyFilters`)

Filtros aplicados en cliente sobre la lista ya cargada:

1. **Ciudad** → busca la ciudad o sus localidades en `profile.location`
2. **Localidad** → coincidencia parcial en `profile.location`
3. **Género** → `guessGender(full_name)`
4. **Especialidad** → búsqueda en `specialties[]` o `specialty` con label traducido
5. **Experiencia mínima** → `experience_years >= filters.minExp`
6. **Precio máximo** → `hourly_rate <= filters.maxPrice`
7. **Rating mínimo** → usa `profile.rating_avg` si existe, sino calcula de `reviewsMap`

**Ordenamiento**: por `rating_avg` del perfil (default), precio asc/desc, experiencia.

### Preferencias de ubicación

Al montar, lee `localStorage('salud_user_prefs')` para `prefCity` y `prefLocality`.  
Escucha el evento `salud:prefsChanged` para actualizar en tiempo real cuando el usuario cambia sus preferencias desde `AccountPanel`.

### Chips de familiares

Si el familiar tiene fichas clínicas con `city` registrada, muestra chips clickeables que auto-filtran la búsqueda a la ciudad/localidad de ese paciente.

---

## `CaregiverCard.jsx` / `NurseCard.jsx`

Wrappers delgados que normalizan datos y los pasan a `ProfessionalCard`.

- Calculan `computedRating`: usa `rating_avg` del perfil si existe, sino promedia `reviews[]`
- Construyen `professionalData` (objeto completo del profesional) para pasarlo al modal de detalle

---

## `ProfessionalCard.jsx`

Tarjeta clickeable con comentarios aislados.

### Comportamiento de click
- **Click en tarjeta** → abre `ProfessionalDetailModal`
- **Click en "Comentarios"** → `e.stopPropagation()` — no abre el modal
- **Click en botones de acción** → `e.stopPropagation()` — no abre el modal

### Comentarios expandibles
Problema resuelto: expandir comentarios antes movía la página entera.  
Solución: el contenedor de comentarios tiene `max-h-[180px] overflow-y-auto` — el scroll ocurre **dentro de la tarjeta**.

### Props clave
| Prop | Descripción |
|---|---|
| `rating / ratingCount` | Para el badge de estrellas |
| `reviews[]` | Para sección expandible de comentarios |
| `professionalData` | Objeto completo para el modal de detalle |
| `professionalUserId / professionalRole` | Para el BookingModal directo |

---

## `ProfessionalDetailModal.jsx`

Modal con información completa del profesional. Se abre al hacer click en la tarjeta.

### Estructura

```
┌─────────────────────────────────────┐
│  HERO (compacto)                    │
│  Avatar · Nombre · Rol · Precio     │
│  Rating con estrellas               │
├──────────────────────────────────────│
│  [Perfil]  [Ubicación]  [Reseñas]   │ ← tabs
├──────────────────────────────────────│
│  CUERPO SCROLLEABLE                 │ ← flex-1 min-h-0
│  (contenido del tab activo)         │
├──────────────────────────────────────│
│  [Cerrar]  [Solicitar servicio]     │ ← footer shrink-0
└─────────────────────────────────────┘
```

**Fix de altura**: `maxHeight: calc(100vh - 80px)` + `overflow-hidden` en el contenedor.  
El footer tiene `shrink-0` — nunca se recorta.

### Tab Perfil
Experiencia, institución, visitas a domicilio, especialidades (chips), bio, link al mapa.

### Tab Ubicación — `ProfessionalMiniMap`
Componente interno. Carga Leaflet dinámicamente (`import('leaflet')`).

1. Parsea `location` en formato `"Localidad, Ciudad"` o `"Ciudad"`
2. Obtiene coords con `getLocalidadCoords()` o `getCityCoords()` de `colombiaGeo.js`
3. Renderiza mapa 200px de alto con marcador coloreado según rol (azul=cuidador, verde=enfermero)
4. Badge de ubicación sobre el mapa

### Tab Reseñas
Card de resumen con `rating_avg` y número de calificaciones, seguido de la lista de reseñas individuales con `StarRating`, nombre, comentario y fecha.

### Booking desde el modal
Botón "Solicitar servicio" abre `BookingModal` con el `professional_user_id` y `role` correctos.
