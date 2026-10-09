# Componentes y utilidades compartidas

---

## Componentes comunes — `src/components/common/`

### `StarRating.jsx`

Estrellas 1-5 reutilizables en toda la app.

| Prop | Default | Descripción |
|---|---|---|
| `value` | 5 | Rating actual (acepta decimales, redondea al mostrar) |
| `onChange` | — | Si se pasa → interactivo. Si no → solo lectura |
| `size` | `'md'` | `'sm'` / `'md'` / `'lg'` |
| `showValue` | false | Muestra el número junto a las estrellas |
| `count` | — | Número de reseñas (muestra entre paréntesis) |
| `readOnly` | false | Fuerza solo lectura aunque `onChange` exista |

Usado en: `ProfessionalCard`, `ProfessionalDetailModal`, `CaregiverDashboard`, `NurseDashboard`, `RateServiceModal`.

### `Spinner.jsx`

Indicador de carga. Prop `sm` para tamaño inline pequeño.

### `TopBar.jsx`

Barra de navegación superior.
- Items de nav dependen del `user.role`
- No tiene toggle de idioma (movido a Preferencias)
- Muestra nombre del usuario y rol

### `AuthScreen.jsx`

Login y registro. Tabs para alternar entre ambos formularios.  
Al hacer login exitoso llama `onLogin(user, token)` hacia `App.jsx`.

### `MainScreen.jsx`

Shell post-login. Controla `activeNav` y renderiza el panel activo.

### `GoogleMap.jsx` (InteractiveMap)

Mapa Leaflet completo para la vista de búsqueda (no el mini-mapa del modal).

| Prop | Descripción |
|---|---|
| `city / localidad` | Centra el mapa |
| `professionals[]` | Dibuja marcadores de profesionales (posiciones aproximadas en círculo) |
| `patientLocation` | Marcador rojo del hogar familiar |
| `onSelectProfessional` | Callback al hacer click en un marcador |

Carga Leaflet dinámicamente. Limpia y redibuja marcadores cuando cambian los datos.

### `GooglePlacesAutocomplete.jsx`

Campo de dirección con autocompletado.
- Si Google Maps API disponible → usa `maps.places.Autocomplete` (Colombia)
- Fallback sin API key → filtra `getLocalidadesForCity()` de colombiaGeo
- Callback `onPlaceSelected({ address, neighborhood, city, lat, lng })`

---

## Utilidades — `src/utils/helpers.js`

| Función | Descripción |
|---|---|
| `getSpecialtyLabel(key, lang)` | Traduce clave de especialidad |
| `getRoleLabel(role, lang)` | Traduce rol de usuario |
| `getMobilityLabel(value, lang)` | Traduce nivel de movilidad |
| `getEpsList(lang)` | Array de EPSs en el idioma activo |
| `getPrepaidList(lang)` | Array de medicinas prepagadas |
| `parseList(val)` | String `"a, b, c"` → `["a","b","c"]` (también pasa arrays) |
| `joinList(arr)` | `["a","b","c"]` → `"a, b, c"` |
| `guessGender(name)` | Detecta género por primer nombre (lista de prefijos femeninos en español) → `'F'` o `'M'` |

---

## Constantes — `src/constants/index.js`

| Constante | Descripción |
|---|---|
| `SPECIALTIES_KEYS` | Claves de especialidades de enfermería |
| `SPECIALTIES` | Mapa clave → label ES |
| `MOBILITY_OPTIONS_KEYS` | Opciones de nivel de movilidad |
| `BLOOD_TYPES` | `['A+', 'A-', 'B+', ...]` |
| `EMPTY_PATIENT` | Objeto vacío para inicializar `PatientFormModal` |
| `TEMPLATES_KEY` | Clave localStorage para plantillas en `BookingModal` |
| `INPUT_CLASS` / `LABEL_CLASS` | Clases Tailwind reutilizables para inputs y labels |

Re-exporta todo de `colombiaGeo.js`.

---

## Catálogo geográfico — `src/constants/colombiaGeo.js`

Base de datos estática de Colombia para los selectores de ubicación.

| Símbolo | Descripción |
|---|---|
| `COLOMBIA_GEO` | Catálogo de ciudades, coordenadas y localidades/comunas; los selectores se limitan a Bogotá y municipios cercanos mediante `SERVICE_CITIES` |
| `BARRIOS_POR_LOCALIDAD` | Barrios por ciudad→localidad (Bogotá completo + 4 ciudades más) |
| `getCitiesList()` | Array de ciudades |
| `getDepartmentsList()` | Departamentos únicos |
| `getCitiesForDepartment(dept)` | Ciudades de un departamento |
| `getLocalidadesForCity(city)` | Localidades de una ciudad |
| `getBarriosForLocalidad(city, loc)` | Barrios de una localidad (búsqueda parcial) |
| `getCityCoords(city)` | `{lat, lng}` de ciudad |
| `getLocalidadCoords(city, loc)` | `{lat, lng}` de localidad |
| `getFamilyLocations(records)` | Extrae ubicaciones únicas de fichas clínicas |

---

## ChatPanel — `src/components/chat/ChatPanel.jsx`

Chat conversacional con el asistente IA.

- Mantiene historial de mensajes en estado local
- `POST /api/chat { mensaje, historial }`
- Si la respuesta incluye `profesionales[]` → renderiza tarjetas de profesionales sugeridos
- El agente ya tiene acceso a las fichas del familiar (las carga el backend, no el frontend)
