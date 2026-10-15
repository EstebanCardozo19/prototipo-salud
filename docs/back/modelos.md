# Modelos de base de datos — `app/models.py`

Todas las tablas usan **SQLModel** (SQLAlchemy + Pydantic).  
La DB se crea automáticamente al arrancar via `SQLModel.metadata.create_all(engine)`.

---

## Tablas y campos clave

### `users`
Usuarios base del sistema.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | PK int | — |
| `email` | varchar(255) | único, indexado |
| `password_hash` | varchar(255) | bcrypt |
| `full_name` | varchar(150) | — |
| `role` | enum | `family / caregiver / nurse / admin` |
| `is_active` | bool | default `true` |
| `photo_url` | varchar(500) | ruta relativa `/uploads/profiles/...` |

---

### `caregiver_profiles`
Perfil extendido del cuidador (1-a-1 con users).

| Campo | Tipo | Notas |
|---|---|---|
| `user_id` | FK users | único |
| `specialties` | JSON `[]string` | array de strings |
| `hourly_rate` | float | tarifa por hora |
| `location` | varchar(100) | formato `"Localidad, Ciudad"` |
| `bio` | varchar(500) | texto libre |
| `status` | enum | `pending / approved / rejected` |
| `embedding` | vector(384) | pgvector — generado de bio+specialties |
| `rating_avg` | float nullable | `null` sin reseñas; promedio real recalculado al recibir reseña |
| `rating_count` | int | default 0 |

---

### `nurse_profiles`
Perfil de enfermero (1-a-1 con users).

Igual que `caregiver_profiles`, añade:

| Campo | Tipo | Notas |
|---|---|---|
| `specialty` | enum | `general / geriatrics / neurology / ...` (12 valores) |
| `license_number` | varchar(50) | número de licencia |
| `institution` | varchar(200) | institución de referencia |
| `rating_avg` | float nullable | `null` sin reseñas; promedio real de las reseñas |
| `rating_count` | int | default 0 |

> **Nota**: `caregiver_profiles.specialties` es un array libre (JSON), mientras que `nurse_profiles.specialty` es un enum estricto.

---

### `clinical_records`
Historia clínica de un familiar/paciente. Un usuario `family` puede tener hasta 5.

**Datos médicos:**

| Campo | Tipo |
|---|---|
| `patient_name` | varchar(150) |
| `patient_age` | int |
| `blood_type` | varchar(10) |
| `diagnoses / medications / allergies` | JSON `[]string` |
| `mobility_level` | varchar(50) — `independiente/asistida/postrado/silla_ruedas` |
| `special_needs` | varchar(1000) |
| `emergency_contact` | varchar(255) |

**Dirección estructurada:**

| Campo | Tipo | Notas |
|---|---|---|
| `city` | varchar(100) | ciudad colombiana |
| `neighborhood` | varchar(100) | localidad/comuna |
| `sector` | varchar(100) | barrio específico |
| `address` | varchar(300) | formato `Calle 15 # 93 - 60` |
| `floor_number` | int | null = planta baja |
| `is_apartment / has_elevator` | bool | — |
| `housing_notes` | varchar(500) | referencias para el profesional |

**Administrativo:** `eps`, `prepaid_medicine`, `preferred_hospital`

---

### `bookings`
Solicitud de servicio de familia hacia profesional.

| Campo | Tipo | Notas |
|---|---|---|
| `family_user_id` | FK users | quien solicita |
| `professional_user_id` | FK users | quien presta el servicio |
| `professional_role` | varchar(20) | `"caregiver"` o `"nurse"` |
| `date` | varchar(10) | `YYYY-MM-DD` |
| `start_hour / end_hour` | int | 0-23 |
| `notes` | varchar(500) | descripción de necesidades |
| `status` | enum | `pending → approved/rejected` o `approved → completed` |
| `rejection_reason` | varchar(300) | solo si rejected |

---

### `availability`
Horario disponible de un profesional por día.

| Campo | Notas |
|---|---|
| `professional_user_id` | FK users |
| `day_of_week` | enum `monday...sunday` |
| `start_hour / end_hour` | int 0-23 |
| `is_active` | bool |

Un profesional tiene un único slot por día (upsert en el endpoint).

---

### `reviews`
Calificación de **familia → profesional**. Solo tras booking completado.

| Campo | Notas |
|---|---|
| `family_user_id` | FK users |
| `professional_user_id` | FK users |
| `booking_id` | FK bookings — **obligatorio**, previene duplicados |
| `rating` | int 1-5 |
| `comment` | varchar(500) |

---

### `family_reviews`
Calificación de **profesional → familia**. Solo tras booking completado.

| Campo | Notas |
|---|---|
| `professional_user_id` | FK users |
| `family_user_id` | FK users |
| `booking_id` | FK bookings — **obligatorio** |
| `rating` | int 1-5 |
| `comment` | varchar(500) |

---

## Relaciones

```
users (1) ──── (0/1) caregiver_profiles
users (1) ──── (0/1) nurse_profiles
users (1) ──── (0..5) clinical_records
users (1) ──── (n) bookings  [como family_user_id]
users (1) ──── (n) bookings  [como professional_user_id]
users (1) ──── (n) reviews   [como family_user_id]
users (1) ──── (n) reviews   [como professional_user_id]
bookings (1) ── (0/1) reviews
bookings (1) ── (0/1) family_reviews
```

## Enums definidos en el modelo

| Enum | Valores |
|---|---|
| `UserRole` | `family, caregiver, nurse, admin` |
| `ProfileStatus` | `pending, approved, rejected` |
| `BookingStatus` | `pending, approved, rejected, completed, cancelled` |
| `DayOfWeek` | `monday … sunday` |
| `NurseSpecialty` | `general, geriatrics, neurology, cardiology, pulmonology, psychiatry, physiatry, palliative, internal_medicine, endocrinology, nephrology, orthopedics` |
