# Dashboards del profesional

---

## `ProfessionalPanel.jsx`

Wrapper que decide qué dashboard renderizar:
```jsx
user.role === 'caregiver' → <CaregiverDashboard />
user.role === 'nurse'     → <NurseDashboard />
```

---

## `CaregiverDashboard.jsx` / `NurseDashboard.jsx`

Misma estructura para ambos. Dos tabs.

### Tab "Mi Perfil"

**Card de rating** (siempre visible):
- Número grande con `rating_avg` del perfil
- `StarRating` de solo lectura
- Conteo de calificaciones
- Mensaje "Empieza con 5★" si aún no tiene calificaciones

**Datos del perfil** (vista):
- Nombre, localidad, experiencia, tarifa, bio, estado de aprobación
- NurseDashboard añade: especialidad, licencia, institución, visitas a domicilio

**Reseñas recibidas** (si existen):
- Cargadas de `GET /api/bookings/reviews/{user_id}` al montar
- Lista con nombre del familiar, `StarRating`, comentario y fecha

**Formulario de edición** (al hacer click en "Editar perfil"):
- Ciudad + Localidad via selectores de `colombiaGeo.js`
- Años de experiencia, tarifa
- Bio (textarea)
- NurseDashboard añade institución y toggle de visitas a domicilio
- `PUT /api/caregivers/me` o `PUT /api/nurses/me`

**Verificación profesional** (debajo de los datos del perfil):
- Consulta `GET /api/verification/me` al montar el dashboard.
- Muestra el estado de la solicitud: borrador, en revisión, verificado o requiere corrección.
- Muestra el motivo indicado por el administrador al rechazarla.
- Permite cargar y reemplazar documentos con `POST /api/verification/documents/{document_type}` usando `FormData`, con el campo `file` y `document_name` para certificados o títulos. El selector se deshabilita hasta diligenciar ese nombre.
- Valida en el navegador PDF/JPEG/PNG y máximo 10 MB; el backend repite estas validaciones.
- Para enfermeros permite enviar o reenviar mediante `POST /api/verification/submit` cuando todos los documentos requeridos están cargados. Para cuidadores, los documentos son opcionales y puede enviarse con localidad y biografía completas.
- Mientras la solicitud está pendiente o aprobada, los documentos se muestran como enlaces privados y no se pueden modificar desde la interfaz. Una solicitud rechazada permite corregirlos y reenviarla.
- El backend también exige que el perfil tenga localidad y biografía, por lo que el profesional debe guardar esos datos antes de enviar.

### Tab "Mis Servicios"

Cargado de `GET /api/bookings/incoming` al entrar al tab.

**Acciones disponibles por estado del booking:**

| Estado | Acciones |
|---|---|
| `pending` | Botón **Aprobar** (`PUT /{id}/decide {status:"approved"}`) + Botón **Rechazar** |
| `approved` | Botón **Marcar completado** (`PUT /{id}/complete`) |
| `completed` + no calificado | Botón **Calificar familiar** → abre `RateServiceModal` |
| `completed` + ya calificado | Badge verde "Familiar calificado" |

Al completar → actualiza el estado del booking en el estado local sin recargar.  
Al calificar → marca `reviewed_by_professional: true` en el estado local.

---

## `AdminDashboard.jsx`

Solo para rol `admin`.

- Lista todos los usuarios del sistema
- Muestra solicitudes enviadas de cuidadores/enfermeros pendientes de revisión y sus enlaces de documentos privados
- Botones Aprobar / Rechazar que llaman a `PUT /api/admin/verifications/{verification_id}/review`; el rechazo solicita un motivo obligatorio
