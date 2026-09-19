# Bookings y Calificaciones — `app/routers/bookings_router.py`

Funcionalidad más compleja del backend. Gestiona el ciclo completo de un servicio:  
**solicitud → decisión → completado → calificación mutua**.

---

## Estados de un booking

```
PENDING ──► APPROVED ──► COMPLETED   (calificación disponible)
        │
        └──► REJECTED
```

Solo el profesional puede mover el estado. El familiar solo crea.

---

## Endpoints de bookings

### Crear solicitud — `POST /`
- **Auth**: `family`
- Crea booking en estado `pending`
- Valida que el profesional exista y que su `role` coincida con `professional_role` enviado

### Listar mis solicitudes — `GET /my-requests`
- **Auth**: `family`
- Retorna bookings del familiar ordenados por fecha descendente
- Incluye `reviewed_by_family: bool` — indica si ya calificó ese booking

### Solicitudes recibidas — `GET /incoming`
- **Auth**: `caregiver / nurse`
- Retorna bookings donde el profesional es el receptor
- Incluye `reviewed_by_professional: bool`

### Aprobar o rechazar — `PUT /{id}/decide`
- **Auth**: `caregiver / nurse` — solo el receptor del booking
- Acepta `{ status: "approved" | "rejected", rejection_reason? }`
- Solo funciona si el booking está en `pending`

### Completar servicio — `PUT /{id}/complete`
- **Auth**: `caregiver / nurse` — solo el receptor
- Solo funciona si está en `approved`
- Cambia estado a `completed`
- **Habilita la calificación mutua** entre ambas partes

### Calendario — `GET /calendar/{professional_user_id}`
- **Auth**: público
- Retorna bookings `approved` y `completed` de un profesional

---

## Endpoints de disponibilidad

Prefijo: `/api/bookings/availability`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/me` | caregiver/nurse | Ver mis horarios configurados |
| POST | `/` | caregiver/nurse | Crear o actualizar bloque (upsert por día) |
| DELETE | `/{id}` | caregiver/nurse | Eliminar bloque |
| GET | `/{prof_id}` | Público | Ver disponibilidad activa de un profesional |

---

## Endpoints de calificaciones

### Familiar califica profesional — `POST /reviews`
- **Auth**: `family`
- **Validaciones antes de guardar:**
  1. El `booking_id` existe
  2. El booking pertenece a este familiar
  3. El booking está en estado `completed`
  4. El `professional_user_id` coincide con el del booking
  5. No existe ya una review de este familiar para este booking
- Después de guardar → llama `_recalc_professional_rating()`

### Ver reseñas de un profesional — `GET /reviews/{prof_user_id}`
- **Auth**: público
- Ordenado por fecha descendente

### Profesional califica familiar — `POST /family-reviews`
- **Auth**: `caregiver / nurse`
- Mismas validaciones pero en sentido inverso
- Guarda en tabla `family_reviews`

### Ver reseñas de un familiar — `GET /family-reviews/{family_user_id}`
- **Auth**: público

---

## Helper interno — `_recalc_professional_rating()`

Se llama automáticamente cada vez que un familiar envía una nueva reseña.

```python
def _recalc_professional_rating(professional_user_id, session):
    # 1. Carga todas las reviews del profesional
    # 2. Calcula avg = sum(ratings) / count
    # 3. Actualiza rating_avg y rating_count en CaregiverProfile o NurseProfile
    # 4. Hace commit
```

Esto mantiene `rating_avg` siempre actualizado en el perfil,  
evitando calcular el promedio en cada request del frontend.

---

## Schemas Pydantic del router

| Schema | Uso |
|---|---|
| `BookingCreate` | Payload para crear solicitud |
| `BookingResponse` | Respuesta con flags `reviewed_by_family/professional` |
| `BookingDecision` | `{ status, rejection_reason? }` para decide |
| `AvailabilityCreate/Response` | CRUD de horarios |
| `ReviewCreate` | `{ professional_user_id, booking_id, rating, comment? }` |
| `ReviewResponse` | Con `family_name` y `created_at` |
| `FamilyReviewCreate` | `{ family_user_id, booking_id, rating, comment? }` |
| `FamilyReviewResponse` | Con `professional_name` y `created_at` |
