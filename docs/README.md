# Documentación — Plataforma Atención Domiciliaria

Portal web para conectar **familias con cuidadores y enfermeros** de adultos mayores en Colombia.
Incluye asistente de IA, sistema de calificaciones bidireccional y gestión clínica.

---

## Estructura de documentación

```
docs/
├── README.md                     ← estás aquí
├── back/
│   ├── auth.md                   ← JWT, login, registro, protección de rutas
│   ├── modelos.md                ← todas las tablas y relaciones de la DB
│   ├── bookings-y-ratings.md     ← reservas, estados, calificaciones
│   ├── perfiles.md               ← cuidadores, enfermeros, verificación y admin
│   ├── fichas-clinicas.md        ← historias clínicas de pacientes
│   ├── ia-y-embeddings.md        ← agente IA, MCP, búsqueda vectorial
│   └── archivos-y-config.md      ← uploads de fotos, DB engine, main.py
└── front/
    ├── estado-y-contextos.md     ← App.jsx, i18n, LangContext
    ├── busqueda-profesionales.md ← SearchPanel, tarjetas, modal con mapa
    ├── pacientes-y-bookings.md   ← fichas clínicas, solicitudes, calificaciones
    ├── dashboards-profesional.md ← paneles de cuidador y enfermero
    ├── cuenta-y-preferencias.md  ← perfil, foto, idioma, seguridad
    └── comunes.md                ← componentes compartidos, helpers, constantes
```

---

## Arquitectura general

```
┌────────────────────────────────────┐
│         BROWSER (React/Vite)       │
│         localhost:3000             │
└──────────────┬─────────────────────┘
               │ proxy /api  /uploads
               ▼
┌────────────────────────────────────┐
│       API FastAPI (Python)         │
│         localhost:8000             │
│                                    │
│  /api/auth        /api/bookings    │
│  /api/caregivers  /api/nurses      │
│  /api/clinical-records             │
│  /api/admin       /api/upload      │
│  /api/verification (documentos privados) │
│  /api/chat  (IA inline)            │
│  /uploads/profiles/* (StaticFiles) │
└──────────────┬─────────────────────┘
               │ SQLAlchemy / psycopg2
               ▼
┌────────────────────────────────────┐
│    PostgreSQL + pgvector :5433     │
│  9 tablas · extensión vector       │
└────────────────────────────────────┘
               ↑
         SAI API externa
    (agente conversacional)
```

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite 5 + Tailwind CSS 3 |
| Backend | FastAPI + SQLModel (Python 3.11) |
| Base de datos | PostgreSQL 16 + pgvector |
| Auth | JWT HS256, 24 h, bcrypt |
| IA conversacional | SAI Applications `gpt-5.6-terra` |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` (local, 384d) |
| Mapas | Leaflet 1.9 + OpenStreetMap |
| Contenedores | Docker + docker-compose |

## Roles

| Rol | Acceso |
|---|---|
| `family` | Buscar profesionales, registrar familiares, solicitar servicios, calificar |
| `caregiver` | Recibir solicitudes, gestionar perfil, marcar servicios completados, calificar familias |
| `nurse` | Igual que caregiver + campos clínicos adicionales |
| `admin` | Ver todos los usuarios, aprobar/rechazar perfiles de profesionales |

## Inicio rápido

```bash
# Backend + DB
docker compose up -d

# Frontend (desarrollo)
cd frontend && npm install && npm run dev

# Endpoints
# http://localhost:3000  → app React
# http://localhost:8000/docs → Swagger UI
```
