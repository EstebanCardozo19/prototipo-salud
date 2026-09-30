# Continuación de auditoría técnica — secciones 6 a 17

**Alcance de esta continuación.** No se modificó ningún archivo. Se revisó nuevamente el estado actual de backend, frontend, modelos y pruebas en `C:\Users\Estba\OneDrive\Documentos\prototipo-app-salud`.

**Validación ejecutada:**

- Pruebas backend: `venv\Scripts\python.exe -m unittest discover -s tests -v`  
  **Resultado: 32 pruebas ejecutadas, OK.**
- Build frontend: se inició `frontend\npm run build` con Vite, pero la terminal fue cerrada por el entorno durante la fase `transforming`; por tanto **no hay resultado final verificable de build exitoso o fallido**.
- No hay cambios pendientes mostrados por `git status --short` en la salida capturada.

---

## 6. SISTEMA DE CONFIABILIDAD Y CONTINUIDAD

### 6.1 Rechazo antes de aceptar

| Elemento | Estado | Evidencia |
|---|---|---|
| Profesional puede rechazar solicitud pendiente | **IMPLEMENTADO** | `PUT /api/bookings/{booking_id}/decide` en `app/routers/bookings_router.py`, función `decide_booking`. |
| Solo puede decidir el profesional asignado | **IMPLEMENTADO** | Valida `booking.professional_user_id != current_user.id`. |
| Solo permite decidir solicitudes `pending` | **IMPLEMENTADO** | Valida `booking.status != BookingStatus.pending`. |
| Estados admitidos para decidir | **IMPLEMENTADO** | Solo `"approved"` o `"rejected"`. |
| Motivo para rechazo | **IMPLEMENTADO** | `BookingDecision` incluye `rejection_reason`; al rechazar se persiste en `Booking.rejection_reason`. |
| Notificación a la familia por rechazo | **IMPLEMENTADO** | El flujo de decisión usa `create_notification(...)` del router de notificaciones. |
| Interfaz de aprobación/rechazo | **IMPLEMENTADO** | Paneles `frontend/src/components/dashboards/CaregiverDashboard.jsx` y `NurseDashboard.jsx` cargan solicitudes entrantes y permiten decidir. |

**Conclusión:** el rechazo previo a la aceptación está diferenciado de una cancelación posterior. El modelo `BookingStatus` contempla ambos valores: `rejected` y `cancelled` en `app/models.py`.

---

### 6.2 Cancelación tras aceptar

| Requisito | Estado | Hallazgo |
|---|---|---|
| Estado `cancelled` en servicios | **PARCIAL** | Existe `BookingStatus.cancelled` en `app/models.py`. También existen etiquetas visuales para dicho estado en calendarios y paneles. |
| Endpoint para cancelar servicio aprobado | **NO IMPLEMENTADO** | No existe `POST`, `PUT`, `PATCH` ni `DELETE` de cancelación en `app/routers/bookings_router.py`. |
| Lógica backend que asigne `BookingStatus.cancelled` | **NO IMPLEMENTADO** | El único flujo de cambio de estado revisado permite `approved`, `rejected` y `completed`; no hay transición a `cancelled`. |
| Botón/interfaz funcional de cancelación | **NO IMPLEMENTADO** | Los paneles muestran la etiqueta `cancelled` si llegara desde backend, pero no hay acción de cancelación conectada. Los textos “Cancelar” encontrados corresponden al cierre de modales, no a cancelar una reserva aceptada. |
| Motivo obligatorio de cancelación | **NO IMPLEMENTADO** | `Booking` solo contiene `rejection_reason`; no hay `cancellation_reason`. |
| Fecha/hora de cancelación | **NO IMPLEMENTADO** | No existe campo `cancelled_at` ni entidad de evento de cancelación. |
| Usuario que canceló | **NO IMPLEMENTADO** | No existe `cancelled_by_user_id`. |
| Notificar a la familia si cancela el profesional | **NO IMPLEMENTADO** | No existe flujo de cancelación que cree una `Notification`. |
| Distinguir rechazo vs. cancelación | **PARCIAL** | La distinción semántica existe en el enum (`rejected` frente a `cancelled`) y en etiquetas frontend, pero solo el rechazo tiene transición, razón y notificación implementadas. |
| Cancelación justificada / no justificada | **NO IMPLEMENTADO** | No hay tipo, motivo, clasificación ni reglas asociadas. |
| Historial de cancelaciones | **NO IMPLEMENTADO** | No hay tabla ni campos de auditoría de cancelaciones. |

### 6.3 Historial de servicios completados

| Requisito | Estado | Evidencia |
|---|---|---|
| Persistencia del estado `completed` | **IMPLEMENTADO** | `BookingStatus.completed` en `app/models.py`. |
| Profesional puede marcar servicio como completado | **IMPLEMENTADO** | `PUT /api/bookings/{booking_id}/complete` en `app/routers/bookings_router.py`. |
| Cierre automático | **IMPLEMENTADO** | `app/services/service_lifecycle.py`, función `complete_expired_services()`: marca como completado un servicio aprobado 30 minutos después de su hora de finalización. |
| Visualización histórica de servicios | **PARCIAL** | Los endpoints de solicitudes/calendario devuelven bookings con estado, y la UI muestra los completados. No existe una vista o entidad de “historial de cumplimiento” separada, consolidada y orientada a confiabilidad. |
| Pruebas de cierre automático | **IMPLEMENTADO** | `tests/test_professional_assistant.py` cubre finalización automática y período de gracia. |

### 6.4 Programa de confiabilidad, continuidad y beneficios por cumplimiento profesional

| Componente | Estado | Hallazgo |
|---|---|---|
| Cálculo de confiabilidad profesional | **NO IMPLEMENTADO** | No existe `ReliabilityScore`, servicio de cálculo ni campos de confiabilidad en perfiles. |
| Porcentaje/puntaje de cumplimiento | **NO IMPLEMENTADO** | No hay porcentaje de servicios cumplidos, cancelados o rechazados. |
| Fórmula de confiabilidad | **NO IMPLEMENTADO** | No existe fórmula documentada ni código que la ejecute. |
| Actualización automática del indicador | **NO IMPLEMENTADO** | No hay trigger, job ni lógica asociada a bookings terminados/cancelados. |
| Manejo de profesional nuevo sin historial | **NO IMPLEMENTADO** | No existe estado de confiabilidad “sin historial”. |
| Distintivo “profesional confiable” | **NO IMPLEMENTADO** | No hay campos ni UI de badge de confiabilidad. |
| Beneficios por buen cumplimiento | **NO IMPLEMENTADO** | No existen entidades, reglas ni UI de beneficios. |
| Mayor visibilidad / prioridad de búsqueda | **NO IMPLEMENTADO** | Los listados de `caregivers_router.py` y `nurses_router.py` no ordenan por confiabilidad; la búsqueda vectorial ordena exclusivamente por similitud coseno. |
| Penalización por cancelaciones | **NO IMPLEMENTADO** | No hay datos de cancelación ni mecanismo de ranking negativo. |

### Dictamen de la funcionalidad prioritaria

> **“Programa de confiabilidad, continuidad y beneficios por cumplimiento profesional”**  
> **Estado: NO IMPLEMENTADO**

Actualmente el repositorio tiene las piezas base de las que podría extraerse parte de la información futura:

- reservas con estado (`Booking`);
- rechazo previo con motivo (`Booking.rejection_reason`);
- servicios completados manual y automáticamente;
- calificaciones de familias a profesionales (`Review`);
- calificaciones de profesionales a familias (`FamilyReview`).

Sin embargo, faltan todas las piezas que lo convierten en un programa integral: cancelación persistida, razón y responsable de cancelación, historial de eventos, indicador de cumplimiento, fórmula, cálculo automático, distintivo, criterios de elegibilidad, beneficios y ordenamiento/penalización en búsqueda.

---

## 7. AGENTE DE INTELIGENCIA ARTIFICIAL

## 7.1 Arquitectura real

Hay dos mecanismos distintos que la interfaz llama “asistente”:

1. **Agente familiar externo, conversacional y con herramienta de búsqueda.**
2. **Asistentes documentales por servicio para familia/profesionales**, con controles de acceso más estrictos.

### Agente familiar

| Aspecto | Implementación real |
|---|---|
| Proveedor | SAI Applications. |
| Endpoint externo | `https://sai-library.saiapplications.com/api/prompt/v1/chat/completions`. |
| Modelo configurado | `gpt-5.6-terra`. |
| Configuración | `app/services/ai_agent.py`: constantes `API_URL`, `API_KEY`, `MODEL`; usa `SAI_API_KEY`, pero tiene un valor por defecto embebido en código. |
| Cliente HTTP | `requests.post(...)`, timeout de 60 segundos, en `_llamar_sai()`. |
| Orquestación | `conversar()` en `app/services/ai_agent.py`: envía mensajes y definiciones de herramientas, recibe `tool_calls`, ejecuta herramientas locales y hace una segunda llamada al modelo. |
| Endpoint backend | `POST /api/chat` en `app/main.py`; usa usuario autenticado y carga sus fichas si es familiar. |
| Alternativa directa | `POST /api/chat/local`, en `app/main.py`: ejecuta búsqueda vectorial local sin SAI. |
| Herramientas disponibles | Una sola: `buscar_cuidadores_similares`. |
| Registro de herramientas | `TOOL_REGISTRY = {"buscar_cuidadores_similares": ...}` en `app/services/ai_agent.py`. |
| Definición de herramienta | `get_tool_definitions()` en `app/mcp_server.py`. |

### Prompt del agente familiar

El `SYSTEM_PROMPT` de `app/services/ai_agent.py` le indica, entre otros aspectos:

- actuar como experto en atención geriátrica domiciliaria en Bogotá;
- identificar localidad y necesidades clínicas;
- usar siempre `buscar_cuidadores_similares` cuando deba buscar;
- incluir la descripción completa de necesidades en `descripcion_paciente`;
- responder en español, de forma empática;
- explicar por qué los resultados son adecuados.

Esto permite respuestas narrativas y explicación de resultados, pero **no equivale a un motor clínico determinístico de recomendación**. La selección estructurada final procede de la herramienta vectorial; el modelo externo decide cuándo invocarla y cómo redactar la respuesta.

---

## 7.2 Búsqueda semántica, embeddings y pgvector

| Aspecto | Estado / evidencia |
|---|---|
| Modelo de embeddings | `all-MiniLM-L6-v2`. |
| Dimensiones | 384. |
| Servicio | `app/services/embedding_service.py`: `EMBEDDING_MODEL`, `EMBEDDING_DIM`, `generar_embedding()`. |
| Ejecución de embeddings | Local mediante `sentence_transformers.SentenceTransformer`; no usa SAI para embeddings. |
| Normalización | `model.encode(texto, normalize_embeddings=True)`. |
| Persistencia vectorial | `CaregiverProfile.embedding` usa `Vector(384)` de pgvector en `app/models.py`. |
| Extensión PostgreSQL | `CREATE EXTENSION IF NOT EXISTS vector` en `app/main.py`, dentro de `lifespan()`. |
| Búsqueda vectorial | `app/mcp_server.py`, función `buscar_cuidadores_similares()`. |
| Métrica | Operador pgvector `<=>`; similitud retornada como `1 - (embedding <=> vector)`. |
| Límite | Máximo 3 resultados. |
| Filtro de actividad | `u.is_active = true`. |
| Filtro de localidad | Si se recibe localidad, usa igualdad case-insensitive: `LOWER(cp.location) = LOWER(:localidad)`. |
| Especialidad, experiencia y tarifa | Se devuelven como metadatos, pero **no filtran ni reordenan** la consulta semántica. |
| Rating | No se selecciona ni retorna en SQL vectorial; por tanto no participa en el resultado del agente. |
| Disponibilidad | No se consulta `Availability` ni reservas existentes. |
| Enfermeros | **No participan**: la consulta usa exclusivamente `caregiver_profiles`. |

### Dictamen de búsqueda semántica

> **Búsqueda semántica: PARCIAL.**

Funciona para cuidadores activos con embedding y puede filtrar por una única localidad textual exacta. No incluye enfermeros, disponibilidad, rating, rango de tarifa, experiencia mínima ni especialidad como filtros de consulta.

---

## 7.3 A. Agente para familiar

### Qué puede hacer hoy

- Recibir texto libre del usuario y un historial conversacional.
- Si el usuario autenticado es familiar, cargar todas sus `ClinicalRecord`.
- Agregar datos de esas fichas al contexto del prompt.
- Usar la herramienta local de búsqueda vectorial de cuidadores.
- Devolver:
  - `respuesta`: texto narrativo generado por SAI;
  - `profesionales`: arreglo estructurado retornado por la herramienta.
- Si el proveedor falla, intentar una búsqueda local con `buscar_cuidadores_similares()`.

### Datos que se envían al proveedor externo

En `app/main.py`, el endpoint `/api/chat` transforma cada ficha clínica del familiar en un objeto con:

- nombre y edad;
- grupo sanguíneo;
- diagnósticos;
- medicamentos;
- alergias;
- movilidad;
- necesidades especiales;
- contacto de emergencia;
- EPS;
- medicina prepagada;
- hospital preferido;
- **dirección exacta**;
- localidad/barrio;
- ciudad;
- piso, tipo de vivienda y ascensor.

Esos datos se pasan a `conversar(..., familiares=familiares)` y se incorporan al `SYSTEM_PROMPT` por `_construir_contexto_familiar()` en `app/services/ai_agent.py`.

**Conclusión importante:** el agente familiar sí utiliza datos clínicos del familiar y envía información altamente sensible al proveedor externo SAI, incluyendo dirección, contacto de emergencia y datos de aseguramiento.

### Límites actuales

| Requisito | Estado |
|---|---|
| Interpreta necesidades descritas en lenguaje natural | **IMPLEMENTADO** mediante el modelo externo y el prompt. |
| Busca cuidadores | **IMPLEMENTADO**. |
| Busca enfermeros | **NO IMPLEMENTADO** en la herramienta semántica. |
| Recomienda con lógica verificable clínica | **PARCIAL**: el modelo redacta la justificación, pero el ranking se basa solo en similitud vectorial de perfiles de cuidadores. |
| Considera disponibilidad real | **NO IMPLEMENTADO**. |
| Considera tarifa, rating, experiencia o especialidad como filtros efectivos | **NO IMPLEMENTADO** en la consulta semántica. |
| Usa fichas clínicas del familiar | **IMPLEMENTADO**, pero con exposición amplia de datos al proveedor externo. |

### Continuación del dictamen

`POST /api/chat` (`app/main.py`) carga todas las fichas `ClinicalRecord` del familiar autenticado y las entrega a `conversar()` en `app/services/ai_agent.py`. SAI puede invocar `buscar_cuidadores_similares()` de `app/mcp_server.py`; `POST /api/chat/local` ejecuta la misma búsqueda sin proveedor externo.

| Capacidad | Estado | Evidencia |
|---|---|---|
| Consulta libre y respuesta narrativa | **IMPLEMENTADO** | `POST /api/chat` y `conversar()`. |
| Búsqueda semántica de cuidadores | **IMPLEMENTADO** | `buscar_cuidadores_similares()`. |
| Contingencia local si falla SAI | **IMPLEMENTADO** | Bloque `except` de `POST /api/chat`. |
| Búsqueda IA de enfermeros | **NO IMPLEMENTADO** | La consulta usa únicamente `caregiver_profiles`. |
| Disponibilidad real en recomendación | **NO IMPLEMENTADO** | No consulta `Availability` ni `Booking`. |
| Ranking por tarifa, rating, experiencia o especialidad | **NO IMPLEMENTADO** | Se devuelven como metadatos, pero no filtran ni ordenan la búsqueda vectorial. |
| Ranking clínico verificable | **PARCIAL** | La similitud vectorial ordena; la justificación depende del modelo externo. |
| Minimización por paciente/finalidad | **NO IMPLEMENTADO** | Se transmiten todas las fichas y campos sensibles. |
| Consentimiento específico para transferencia IA familiar | **NO IMPLEMENTADO** | No existe flujo equivalente al consentimiento documental profesional. |

---

## 7.3 B. Asistente documental para profesional

El asistente profesional se expone mediante `GET /api/professional-assistant/{booking_id}/context` y `POST /api/professional-assistant/{booking_id}/chat` en `app/routers/professional_assistant_router.py`.

| Control o capacidad | Estado | Evidencia |
|---|---|---|
| Acceso solo para cuidador o enfermero | **IMPLEMENTADO** | `require_role(UserRole.caregiver, UserRole.nurse)`. |
| Acceso solo al profesional asignado | **IMPLEMENTADO** | `_authorized_booking_context()` compara el profesional de la reserva. |
| Servicio aprobado y dentro de horario activo | **IMPLEMENTADO** | Requiere `BookingStatus.approved` e `is_service_active()`. |
| Validación ficha-familia-servicio | **IMPLEMENTADO** | Verifica `clinical_record_id` y familia de la reserva. |
| Contexto reducido para cuidador | **IMPLEMENTADO** | Excluye diagnósticos, sangre y listado general de medicamentos. |
| Contexto ampliado para enfermero | **IMPLEMENTADO** | `include_clinical_details` se habilita solo para `nurse`. |
| Exclusión de dirección, contacto y aseguramiento | **IMPLEMENTADO** | `obtener_contexto_paciente_asignado()` no los incorpora. |
| Adjuntos solo con consentimiento familiar | **IMPLEMENTADO** | `allow_professional_document_access`; agrega texto extraído, no binarios. |
| Auditoría sin prompts ni respuestas | **IMPLEMENTADO** | `ProfessionalAssistantAuditLog` almacena metadatos de acceso. |
| Detección de emergencia y alerta | **IMPLEMENTADO** | `EMERGENCY_PATTERN`, notificación y webhook opcional. |
| Diagnóstico, prescripción o ajuste de dosis | **NO IMPLEMENTADO** | El prompt y las limitaciones lo prohíben. |

**Dictamen:** este flujo tiene controles de autorización y minimización superiores al agente familiar. Sin embargo, `conversar_con_contexto_documental()` en `app/services/ai_agent.py` envía el contexto autorizado a SAI; el repositorio no evidencia configuración de retención, contrato con proveedor ni consentimiento específico para esa transferencia.

---

## 8. SEGURIDAD DEL AGENTE Y DATOS CLÍNICOS

| Área | Estado | Evidencia y alcance |
|---|---|---|
| Autenticación y roles | **IMPLEMENTADO** | JWT y dependencias de `app/auth.py`, usadas por routers. |
| Cifrado de adjuntos clínicos | **IMPLEMENTADO** | `encrypt_bytes()` y `decrypt_bytes()` en `app/routers/clinical_router.py`. |
| Cifrado de campos sensibles | **IMPLEMENTADO** | `EncryptedText` y `EncryptedJSON` en `app/security/encryption.py`, referidos desde `app/models.py`. |
| Control de acceso profesional por reserva activa | **IMPLEMENTADO** | `app/routers/professional_assistant_router.py`. |
| Consentimiento documental del profesional | **IMPLEMENTADO** | Campo, API clínica y control de `frontend/src/components/patients/PatientCard.jsx`. |
| Auditoría de asistente profesional | **IMPLEMENTADO** | Tabla `professional_assistant_audit_logs`. |
| Clave SAI solo en entorno | **NO IMPLEMENTADO** | `app/services/ai_agent.py` tiene fallback embebido para `SAI_API_KEY`. |
| Minimización de datos del agente familiar | **NO IMPLEMENTADO** | Envía clínica, contacto, aseguramiento, dirección y vivienda. |
| Consentimiento IA específico para familiar | **NO IMPLEMENTADO** | No se encontró campo ni validación. |
| Auditoría de consultas del agente familiar | **NO IMPLEMENTADO** | No existe equivalente para `/api/chat`. |
| Política de retención/borrado en proveedor IA | **NO IMPLEMENTADO** | No hay configuración ni implementación en el repositorio. |
| Escalamiento de emergencia garantizado | **PARCIAL** | Hay alertas internas; webhook depende de `EMERGENCY_NOTIFICATION_WEBHOOK_URL`. |

La documentación debe separar el recomendador familiar del asistente documental profesional y declarar proveedor, categorías de datos, finalidad, consentimiento, revocación y límites clínicos. Esas garantías no están completas como flujo verificable en el código.

---

## 9. MAPA, UBICACIÓN Y COBERTURA

El componente `frontend/src/components/common/GoogleMap.jsx` se usa desde `frontend/src/components/professionals/SearchPanel.jsx`. Pese al nombre, `frontend/package.json` confirma `leaflet`; la vista de mapa corresponde a Leaflet/OpenStreetMap. Google Maps se usa por separado para Places en `frontend/src/utils/googleMaps.js`, `GooglePlacesAutocomplete.jsx` y `PatientFormModal.jsx`.

| Funcionalidad geográfica | Estado | Evidencia |
|---|---|---|
| Mapa interactivo de búsqueda | **IMPLEMENTADO** | `GoogleMap.jsx`, `SearchPanel.jsx` y dependencia `leaflet`. |
| Cobertura textual por localidad | **IMPLEMENTADO** | Campo `location` y filtros en `/api/caregivers/` y `/api/nurses/`. |
| Dirección y condiciones de vivienda en ficha | **IMPLEMENTADO** | `ClinicalRecord` y schemas de `clinical_router.py`. |
| Autocompletado Places si hay configuración | **PARCIAL** | Cargador Google y respaldo de sugerencias locales; depende de clave externa. |
| Coordenadas persistidas | **NO IMPLEMENTADO** | No hay latitud/longitud en modelos clínicos o perfiles. |
| Geocodificación persistida | **NO IMPLEMENTADO** | No hay endpoint ni campos para guardar resultado. |
| Distancia/radio geoespacial | **NO IMPLEMENTADO** | No hay cálculo ni consulta espacial. |
| Ruta, ETA o navegación | **NO IMPLEMENTADO** | No se encontró integración de direcciones o matriz de distancias. |
| Polígonos de cobertura | **NO IMPLEMENTADO** | La cobertura se expresa solo como texto. |
| Matching por cercanía real | **NO IMPLEMENTADO** | El agente usa embeddings, no coordenadas. |

La ficha guarda dirección exacta, pero el asistente profesional la excluye del contexto. El agente familiar sí la añade al prompt externo. No existe revelación gradual de coordenadas después de aceptar un servicio.

---

## 10. CALIFICACIONES, REPUTACIÓN Y FAMILIAS

| Flujo o regla | Estado | Evidencia |
|---|---|---|
| Familia califica profesional | **IMPLEMENTADO** | `POST /api/bookings/reviews`; modelo `Review`. |
| Profesional califica familia | **IMPLEMENTADO** | `POST /api/bookings/family-reviews`; modelo `FamilyReview`. |
| Reseña solo tras servicio completado | **IMPLEMENTADO** | Validación `BookingStatus.completed` en ambos flujos. |
| Una reseña por actor y servicio | **IMPLEMENTADO** | Consultas previas por `booking_id` y actor. |
| Rating profesional persistido y recalculado | **IMPLEMENTADO** | `_recalc_professional_rating()` actualiza `rating_avg` y `rating_count`. |
| Mostrar reseñas de profesional | **IMPLEMENTADO** | `GET /api/bookings/reviews/{professional_user_id}` y modales frontend. |
| Mostrar reputación de familia al profesional | **IMPLEMENTADO** | Métricas y reseñas familiares se agregan a respuestas de reservas. |
| Moderación de comentarios | **NO IMPLEMENTADO** | No hay estados, cola ni endpoints de moderación. |
| Apelación o disputa | **NO IMPLEMENTADO** | No hay modelo ni endpoint. |
| Edición/eliminación de reseña | **NO IMPLEMENTADO** | Solo existen creación y lectura. |
| Reputación en ranking IA | **NO IMPLEMENTADO** | `mcp_server.py` no selecciona ni ordena por rating. |
| Métrica de confiabilidad/cumplimiento | **NO IMPLEMENTADO** | No hay fórmula, distintivo o historial de cancelaciones aplicado. |

La reputación bidireccional está operativa después de servicios completados. Su uso es informativo en flujos de reserva, no un mecanismo de recomendación IA ni de elegibilidad automatizada.

---

## 11. CHAT, NOTIFICACIONES Y RECORDATORIOS

| Funcionalidad | Estado | Evidencia |
|---|---|---|
| Chat privado familia-profesional | **IMPLEMENTADO** | `GET/POST /api/service-chat/{booking_id}/messages`; `ServiceChatMessage`. |
| Restricción a participantes | **IMPLEMENTADO** | Valida familia o profesional de la reserva. |
| Restricción a reserva aprobada | **IMPLEMENTADO** | `_active_booking_for_participant()` exige `approved`. |
| Persistencia de mensajes | **IMPLEMENTADO** | Tabla `service_chat_messages`. |
| Notificación interna por mensaje | **IMPLEMENTADO** | `create_notification()` tras enviar mensaje. |
| Tiempo real mediante WebSocket/SSE | **NO IMPLEMENTADO** | No se encontraron endpoints WebSocket, SSE ni broker. |
| Adjuntar archivos al chat | **NO IMPLEMENTADO** | El schema acepta solo `content` textual. |
| Centro de notificaciones | **IMPLEMENTADO** | `GET /api/notifications/`, marcar una/todas como leídas. |
| Notificaciones por eventos de reserva | **IMPLEMENTADO** | Routers de reservas, administración y citas llaman `create_notification()`. |
| Suscripción Web Push de profesionales | **IMPLEMENTADO** | `GET /push/public-key` y `POST /push/subscriptions`. |
| Push para familiares | **NO IMPLEMENTADO** | La suscripción exige rol cuidador/enfermero. |
| Recordatorios de medicación durante servicio activo | **IMPLEMENTADO** | `dispatch_due_medication_reminders()` en `app/services/medication_reminders.py`. |
| Idempotencia de recordatorios | **IMPLEMENTADO** | `MedicationReminderDelivery` y restricción única. |
| Push de recordatorio si VAPID configurado | **PARCIAL** | No envía si faltan variables o librería. |
| Ejecución garantizada fuera del proceso web | **PARCIAL** | Hay ciclo de vida en `app/main.py`, pero no cola ni scheduler distribuido. |

El plan asistencial `GET/PUT /api/service-care-plans/{booking_id}` permite documentar medicamentos, protocolo de emergencia y contacto tratante para una reserva aprobada. `POST /api/service-care-plans/{booking_id}/assistant` ofrece orientación documental y genera alertas ante expresiones de emergencia.

---

## 12. MODELO DE DATOS ACTUAL

Los modelos se definen en `app/models.py` y se crean con `SQLModel.metadata.create_all(engine)` en `app/main.py`; existen migraciones ligeras acumulativas sin Alembic.

| Entidad | Propósito y relaciones principales |
|---|---|
| `User` | Cuenta, rol, estado y datos de perfil. |
| `CaregiverProfile` | Experiencia, especialidades, tarifa, localidad, biografía, embedding y rating. |
| `NurseProfile` | Especialidad, licencia, institución, experiencia, tarifa, localidad y rating. |
| `ProfessionalVerification` / `VerificationDocument` | Solicitud y documentos de verificación profesional. |
| `ClinicalRecord` / `ClinicalRecordDocument` | Ficha clínica, vivienda, aseguramiento, adjuntos y texto extraído. |
| `Availability` | Disponibilidad semanal declarada por profesional. |
| `Booking` | Familia, profesional, ficha, fecha/horas, notas, estado y razón de rechazo. |
| `MedicalAppointment` | Citas, recurrencia y acompañamiento profesional opcional. |
| `ServiceChatMessage` | Mensajes asociados a una reserva. |
| `ServiceCarePlan` | Pauta de medicamentos, protocolo y contacto tratante por reserva. |
| `ProfessionalAssistantAuditLog` | Metadatos de acceso del profesional al asistente. |
| `Notification` / `PushSubscription` | Alertas internas y suscripciones push. |
| `MedicationReminderDelivery` | Registro idempotente de entregas de recordatorios. |
| `Review` / `FamilyReview` | Reseñas familia-profesional y profesional-familia. |

| Aspecto del modelo | Estado | Observación |
|---|---|---|
| Relación reserva-ficha clínica | **IMPLEMENTADO** | `Booking.clinical_record_id`; migración en `app/main.py`. |
| Estados pendientes, aprobados, rechazados, completados y cancelados | **IMPLEMENTADO** | Enum `BookingStatus`. |
| Transición backend a cancelado | **NO IMPLEMENTADO** | El estado existe, pero no endpoint/flujo de cancelación. |
| Motivo, actor y fecha de cancelación | **NO IMPLEMENTADO** | No hay campos correspondientes. |
| Coordenadas o geometrías | **NO IMPLEMENTADO** | No existen columnas geográficas. |
| Historial de cambios de reserva | **NO IMPLEMENTADO** | No hay entidad de eventos/auditoría de ciclo de reserva. |
| Unicidad de reseñas a nivel BD | **PARCIAL** | El router impide duplicados, pero los modelos no declaran restricción única. |

---

## 13. ENDPOINTS ACTUALES

Las rutas montadas se verificaron en `app/main.py`. El archivo `app/routers/doctors_router.py` existe, pero no se registra mediante `app.include_router`; por ello sus endpoints no están activos en la aplicación actual.

| Área | Endpoints activos |
|---|---|
| Salud e IA | `GET /health`; `POST /api/chat`; `POST /api/chat/local`. |
| Autenticación | `POST /api/auth/register`; `POST /api/auth/login`; `GET /api/auth/me`. |
| Cuidadores | `GET /api/caregivers/`; `GET /api/caregivers/me`; `GET /api/caregivers/{profile_id}`; `PUT /api/caregivers/me`. |
| Enfermeros | `GET /api/nurses/`; `GET /api/nurses/specialties`; `GET /api/nurses/me`; `GET /api/nurses/{nurse_id}`; `PUT /api/nurses/me`. |
| Fichas clínicas | `POST /api/clinical-records/`; `GET /api/clinical-records/`; `GET /api/clinical-records/{record_id}`; `PUT /api/clinical-records/{record_id}`; `DELETE /api/clinical-records/{record_id}`. |
| Adjuntos clínicos | `GET /api/clinical-records/{record_id}/documents`; `POST /api/clinical-records/{record_id}/documents`; `GET /api/clinical-records/documents/{document_id}/download`; `DELETE /api/clinical-records/documents/{document_id}`. |
| Reservas | `POST /api/bookings/`; `GET /api/bookings/my-requests`; `GET /api/bookings/family-calendar`; `GET /api/bookings/incoming`; `PUT /api/bookings/{booking_id}/decide`; `PUT /api/bookings/{booking_id}/complete`; `GET /api/bookings/calendar/{professional_user_id}`. |
| Disponibilidad | `GET /api/bookings/availability/me`; `POST /api/bookings/availability`; `DELETE /api/bookings/availability/{avail_id}`; `GET /api/bookings/availability/{professional_user_id}`. |
| Reseñas | `POST /api/bookings/reviews`; `GET /api/bookings/reviews/{professional_user_id}`; `POST /api/bookings/family-reviews`; `GET /api/bookings/family-reviews/{family_user_id}`. |
| Citas médicas | `GET /api/appointments/eligible-professionals`; `POST /api/appointments/`; `GET /api/appointments/family`; `GET /api/appointments/professional`; `PUT /api/appointments/{appointment_id}/accompaniment`. |
| Plan asistencial | `GET /api/service-care-plans/{booking_id}`; `PUT /api/service-care-plans/{booking_id}`; `POST /api/service-care-plans/{booking_id}/assistant`. |
| Chat de servicio | `GET /api/service-chat/{booking_id}/messages`; `POST /api/service-chat/{booking_id}/messages`. |
| Asistente profesional | `GET /api/professional-assistant/{booking_id}/context`; `POST /api/professional-assistant/{booking_id}/chat`. |
| Notificaciones | `GET /api/notifications/push/public-key`; `POST /api/notifications/push/subscriptions`; `GET /api/notifications/`; `PUT /api/notifications/{notification_id}/read`; `PUT /api/notifications/read-all`. |
| Verificación profesional | `GET /api/verification/me`; `POST /api/verification/documents/{document_type}`; `POST /api/verification/submit`; `GET /api/verification/documents/{document_id}/download`. |
| Administración | `GET /api/admin/profiles/pending`; `PUT /api/admin/verifications/{verification_id}/review`; `GET /api/admin/users`; `PUT /api/admin/users/{user_id}/toggle-active`. |
| Foto de perfil | `POST /api/upload/profile-photo`; `DELETE /api/upload/profile-photo`. |

| Endpoint o capacidad relevante ausente | Estado | Evidencia |
|---|---|---|
| Cancelar una reserva aprobada | **NO IMPLEMENTADO** | No existe ruta de cancelación en `app/routers/bookings_router.py`. |
| Actualizar/eliminar reseñas | **NO IMPLEMENTADO** | No hay `PUT`, `PATCH` ni `DELETE` para reseñas. |
| Moderar reseñas | **NO IMPLEMENTADO** | No hay endpoints o modelo de moderación. |
| API de ruta, distancia o ETA | **NO IMPLEMENTADO** | No existen routers ni servicios geoespaciales. |
| Canal en tiempo real para chat | **NO IMPLEMENTADO** | No hay WebSocket/SSE. |
| Endpoints de médicos | **NO IMPLEMENTADO** | Router existente sin montaje en `app/main.py`. |

---

## 14. PRUEBAS

La carpeta `tests/` contiene cinco módulos y 32 métodos `test_`. El comando registrado al inicio de este archivo fue `venv\Scripts\python.exe -m unittest discover -s tests -v`, con resultado **32 pruebas ejecutadas, OK**. No se modificaron pruebas ni código de aplicación durante esta auditoría.

| Archivo de prueba | Cobertura verificada |
|---|---|
| `tests/test_clinical_record_medications.py` | Normalización de medicamentos cuando el paciente no los toma y actualización parcial. |
| `tests/test_document_text_extraction.py` | Tipos no soportados, fallo OCR, extracción PDF y legibilidad del texto. |
| `tests/test_encryption.py` | Cifrado/descifrado de texto y archivos, HMAC de email y tipos de columnas cifradas. |
| `tests/test_medication_reminders.py` | Parseo de horarios, despacho en servicio activo e idempotencia de recordatorios. |
| `tests/test_professional_assistant.py` | Ventana de servicio activo, cierre automático, autorización de contexto, emergencias, auditoría y consentimiento documental. |

| Área | Estado | Evidencia / limitación |
|---|---|---|
| Pruebas unitarias de cifrado | **IMPLEMENTADO** | `tests/test_encryption.py`. |
| Pruebas unitarias de extracción documental | **IMPLEMENTADO** | `tests/test_document_text_extraction.py`. |
| Pruebas del asistente profesional y consentimiento | **IMPLEMENTADO** | `tests/test_professional_assistant.py`. |
| Pruebas de recordatorios | **IMPLEMENTADO** | `tests/test_medication_reminders.py`. |
| Pruebas del agente familiar/SAI | **NO IMPLEMENTADO** | No hay test que simule `POST /api/chat`, minimización o fallo del proveedor. |
| Pruebas de búsqueda vectorial pgvector | **NO IMPLEMENTADO** | No hay test de `buscar_cuidadores_similares()` contra PostgreSQL/pgvector. |
| Pruebas de endpoints de autenticación | **NO IMPLEMENTADO** | No se encontraron pruebas de registro, login, JWT o roles. |
| Pruebas de reservas, rechazo y completado | **NO IMPLEMENTADO** | No se encontraron pruebas de `bookings_router.py`. |
| Pruebas de cancelación | **NO IMPLEMENTADO** | No existe el flujo que probar. |
| Pruebas de chat y notificaciones | **NO IMPLEMENTADO** | No se encontraron pruebas de `service_chat_router.py` ni `notifications_router.py`. |
| Pruebas de reseñas y reputación | **NO IMPLEMENTADO** | No se encontraron pruebas de creación, duplicidad, rating o permisos. |
| Pruebas de citas médicas | **NO IMPLEMENTADO** | No se encontraron pruebas de recurrencia o acompañamiento. |
| Pruebas frontend automatizadas | **NO IMPLEMENTADO** | `frontend/package.json` solo declara `dev`, `build` y `preview`; no declara runner de pruebas. |
| Build frontend verificado al cierre | **PARCIAL** | El intento previo de `npm run build` fue interrumpido por el entorno durante `transforming`; no hay resultado final verificable. |

La cobertura existente se concentra en utilidades de seguridad, documentos, recordatorios y asistente profesional. No valida de extremo a extremo los flujos centrales de contratación, búsqueda, IA familiar, chat, notificaciones, calificaciones, calendario o frontend.

---

## 15. FUNCIONALIDADES PARCIALES E INCONSISTENCIAS

| Hallazgo | Estado | Archivos principales | Impacto |
|---|---|---|---|
| `BookingStatus.cancelled` existe sin transición funcional | **PARCIAL** | `app/models.py`; `app/routers/bookings_router.py`; dashboards frontend. | La interfaz puede representar un estado que ningún endpoint asigna. |
| Cancelación sin razón, actor, fecha ni notificación | **NO IMPLEMENTADO** | `app/models.py`; `app/routers/bookings_router.py`. | No hay trazabilidad ni manejo operativo de cancelaciones. |
| El mapa se llama GoogleMap pero usa Leaflet | **PARCIAL** | `frontend/src/components/common/GoogleMap.jsx`; `frontend/package.json`. | El nombre puede inducir a error documental; Google queda limitado a Places/autocompletado. |
| Autocompletado Google depende de configuración externa | **PARCIAL** | `frontend/src/utils/googleMaps.js`; componentes de Places. | Sin clave disponible se usa sugerencia textual local, no geocodificación persistida. |
| Búsqueda IA presenta datos de cuidadores, no enfermeros | **PARCIAL** | `app/mcp_server.py`; `app/services/ai_agent.py`. | El catálogo general tiene enfermeros, pero el agente no los recomienda. |
| Búsqueda IA no valida disponibilidad | **NO IMPLEMENTADO** | `app/mcp_server.py`; `app/models.py`. | Puede recomendar profesionales ocupados o sin disponibilidad compatible. |
| Rating disponible pero no usado por IA | **NO IMPLEMENTADO** | `app/models.py`; `app/mcp_server.py`. | Reputación no mejora el orden de recomendaciones. |
| Agente familiar transmite contexto excesivo | **NO IMPLEMENTADO** | `app/main.py`; `app/services/ai_agent.py`. | Expone al proveedor externo clínica, domicilio, contacto y aseguramiento. |
| Clave SAI fallback embebida | **NO IMPLEMENTADO** | `app/services/ai_agent.py`. | Riesgo de exposición y rotación de secreto insuficiente. |
| Asistente profesional con mejores controles, pero también depende de SAI | **PARCIAL** | `app/routers/professional_assistant_router.py`; `app/services/ai_agent.py`. | La autorización local no cubre retención o tratamiento por proveedor externo. |
| Chat descrito como activo, pero valida solo estado aprobado | **PARCIAL** | `app/routers/service_chat_router.py`. | El comentario/mensaje habla de servicio activo, pero no invoca `is_service_active()`. |
| Plan asistencial tiene la misma diferencia de “activo” | **PARCIAL** | `app/routers/care_plan_router.py`. | Permite acceso mientras esté aprobado, sin validación horaria. |
| Push solo suscribible por profesionales | **PARCIAL** | `app/routers/notifications_router.py`. | La familia recibe notificaciones internas, pero no puede registrar suscripción push. |
| Recordatorios dependen del proceso de aplicación | **PARCIAL** | `app/main.py`; `app/services/medication_reminders.py`. | No hay worker/cola independiente para disponibilidad operacional. |
| Reseñas sin moderación o apelación | **NO IMPLEMENTADO** | `app/models.py`; `app/routers/bookings_router.py`. | Riesgo reputacional sin mecanismo de resolución. |
| Router de médicos no montado | **NO IMPLEMENTADO** | `app/routers/doctors_router.py`; `app/main.py`. | Código de endpoints no queda disponible en runtime. |
| Migraciones sin Alembic | **PARCIAL** | `app/main.py`. | Las alteraciones acumulativas funcionan para algunos campos, pero no hay versionado formal de esquema. |

---

## 16. MATRIZ FINAL DE FUNCIONALIDADES

| FUNCIONALIDAD | ESTADO | FRONTEND | BACKEND | BD | PRUEBAS | ARCHIVOS PRINCIPALES | OBSERVACIÓN |
|---|---|---|---|---|---|---|---|
| Registro, login y sesión JWT | **IMPLEMENTADO** | Formularios y consumo de sesión | Registro, login y `/me` | `users` | **NO IMPLEMENTADO** | `app/routers/auth_router.py`; `app/auth.py`; `frontend/src` | Roles family, caregiver y nurse. |
| Perfiles de cuidadores y enfermeros | **IMPLEMENTADO** | Paneles y tarjetas | CRUD parcial de perfil y listados | `caregiver_profiles`, `nurse_profiles` | **NO IMPLEMENTADO** | `app/routers/caregivers_router.py`; `app/routers/nurses_router.py` | Solo perfiles aprobados se listan públicamente. |
| Verificación de profesionales | **IMPLEMENTADO** | Carga y administración | Documentos, envío y revisión | `professional_verifications`, `verification_documents` | **NO IMPLEMENTADO** | `app/routers/verification_router.py`; `app/routers/admin_router.py` | Incluye notificación de resultado. |
| Fichas clínicas y adjuntos | **IMPLEMENTADO** | Panel familiar y tarjeta de paciente | CRUD, carga, descarga y borrado | `clinical_records`, `clinical_record_documents` | **IMPLEMENTADO** | `app/routers/clinical_router.py`; `tests/test_document_text_extraction.py` | Adjuntos cifrados; texto extraído sujeto a validación. |
| Búsqueda textual de profesionales | **IMPLEMENTADO** | `SearchPanel.jsx` y tarjetas | Listados con filtros | Perfiles y ratings | **NO IMPLEMENTADO** | `frontend/src/components/professionals/SearchPanel.jsx`; routers de perfiles | Filtros por localidad, especialidad y texto según rol. |
| Mapa de búsqueda | **IMPLEMENTADO** | Mapa Leaflet | Sin API geográfica dedicada | No guarda coordenadas | **NO IMPLEMENTADO** | `frontend/src/components/common/GoogleMap.jsx` | Mapa visual, no cálculo geoespacial. |
| Autocompletado de direcciones | **PARCIAL** | Places y fallback local | No persiste geocodificación | Dirección textual | **NO IMPLEMENTADO** | `GooglePlacesAutocomplete.jsx`; `googleMaps.js`; `PatientFormModal.jsx` | Depende de Google API configurada. |
| Matching IA familiar de cuidadores | **PARCIAL** | `ChatPanel.jsx` | SAI, embeddings y fallback local | Vector pgvector de cuidadores | **NO IMPLEMENTADO** | `app/main.py`; `app/services/ai_agent.py`; `app/mcp_server.py` | No incluye enfermeros, disponibilidad ni rating. |
| Protección de datos del agente familiar | **NO IMPLEMENTADO** | Sin consentimiento específico | Envía contexto amplio a SAI | Fichas clínicas | **NO IMPLEMENTADO** | `app/main.py`; `app/services/ai_agent.py` | Incluye domicilio, contacto y aseguramiento. |
| Asistente documental profesional | **IMPLEMENTADO** | `ProfessionalPatientAssistantModal.jsx` | Control por rol, servicio, horario y ficha | Auditoría y plan | **IMPLEMENTADO** | `app/routers/professional_assistant_router.py`; `tests/test_professional_assistant.py` | Contexto minimizado por rol; adjuntos solo con permiso. |
| Disponibilidad profesional | **IMPLEMENTADO** | Dashboards profesionales | CRUD y consulta de disponibilidad | `availability` | **NO IMPLEMENTADO** | `app/routers/bookings_router.py` | No se cruza con recomendación IA. |
| Solicitud, aprobación y rechazo de servicio | **IMPLEMENTADO** | Modales y dashboards | Crear, decidir y notificar | `bookings` | **NO IMPLEMENTADO** | `app/routers/bookings_router.py`; dashboards | Rechazo acepta razón. |
| Completado de servicio | **IMPLEMENTADO** | Paneles y calendarios | Completado manual y ciclo de vida | `bookings` | **IMPLEMENTADO** | `app/services/service_lifecycle.py`; `tests/test_professional_assistant.py` | Incluye cierre automático con período de gracia. |
| Cancelación de servicio | **NO IMPLEMENTADO** | Solo representación visual posible | Sin endpoint | Enum sin trazabilidad | **NO IMPLEMENTADO** | `app/models.py`; `app/routers/bookings_router.py` | No hay flujo de cancelación. |
| Plan asistencial y pauta de medicación | **IMPLEMENTADO** | `ServiceCarePlanModal.jsx` | Lectura/escritura y asistente documental | `service_care_plans` | **NO IMPLEMENTADO** | `app/routers/care_plan_router.py` | Disponible para reserva aprobada; no comprueba horario activo. |
| Recordatorios de medicación | **PARCIAL** | Notificaciones del profesional | Despacho y push opcional | `medication_reminder_deliveries`, planes | **IMPLEMENTADO** | `app/services/medication_reminders.py`; `tests/test_medication_reminders.py` | Depende del proceso y configuración VAPID. |
| Chat de servicio | **PARCIAL** | `ServiceChatModal.jsx` | Mensajes y alerta interna | `service_chat_messages` | **NO IMPLEMENTADO** | `app/routers/service_chat_router.py` | Sin WebSocket/SSE, archivos ni validación horaria real. |
| Centro de notificaciones | **IMPLEMENTADO** | Componentes de notificación | Listar y marcar leídas | `notifications` | **NO IMPLEMENTADO** | `app/routers/notifications_router.py` | Notificaciones internas para usuarios autenticados. |
| Web Push | **PARCIAL** | Registro de suscripción profesional | VAPID y despacho opcional | `push_subscriptions` | **NO IMPLEMENTADO** | `app/routers/notifications_router.py`; `medication_reminders.py` | Solo profesionales y depende de variables VAPID. |
| Reseñas familia a profesional | **IMPLEMENTADO** | `RateServiceModal.jsx` y detalle | Crear, listar y recalcular rating | `reviews`, perfiles | **NO IMPLEMENTADO** | `app/routers/bookings_router.py` | Solo para servicio completado. |
| Reseñas profesional a familia | **IMPLEMENTADO** | Dashboards/solicitudes | Crear y listar | `family_reviews` | **NO IMPLEMENTADO** | `app/routers/bookings_router.py` | Solo para servicio completado. |
| Moderación, apelación y gestión de reseñas | **NO IMPLEMENTADO** | Sin interfaz | Sin endpoints | Sin entidades | **NO IMPLEMENTADO** | `app/models.py`; `app/routers/bookings_router.py` | No hay ciclo de resolución reputacional. |
| Reputación en recomendaciones IA | **NO IMPLEMENTADO** | Sin indicador IA | No ordena por rating | Ratings existentes | **NO IMPLEMENTADO** | `app/mcp_server.py` | El SQL vectorial no selecciona rating. |
| Citas médicas y acompañamiento | **IMPLEMENTADO** | Calendario/panel familiar | Crear, listar y decidir acompañamiento | `medical_appointments` | **NO IMPLEMENTADO** | `app/routers/appointments_router.py` | Incluye recurrencia semanal o mensual. |
| Cobertura por distancia, rutas y ETA | **NO IMPLEMENTADO** | Sin interfaz funcional | Sin servicio geoespacial | Sin coordenadas | **NO IMPLEMENTADO** | `GoogleMap.jsx`; `app/models.py` | Solo hay localidad textual y mapa visual. |
| API de médicos | **NO IMPLEMENTADO** | Sin flujo activo | Router no montado | Modelos/estado no expuestos | **NO IMPLEMENTADO** | `app/routers/doctors_router.py`; `app/main.py` | Las rutas del archivo no se incluyen en FastAPI. |
| Pruebas frontend automatizadas | **NO IMPLEMENTADO** | Sin runner declarado | No aplica | No aplica | **NO IMPLEMENTADO** | `frontend/package.json` | Solo scripts Vite de desarrollo, build y preview. |

**Totales de la matriz:** **16 IMPLEMENTADO**, **7 PARCIAL**, **6 NO IMPLEMENTADO**.

---

## 17. CONCLUSIÓN PARA DOCUMENTACIÓN DEL PROYECTO

### A. Implementado y demostrable hoy

1. Registro, autenticación JWT y control de roles para familiares, cuidadores, enfermeros y administración.
2. Perfiles de cuidadores y enfermeros, con verificación documental y publicación de perfiles aprobados.
3. Gestión de fichas clínicas familiares, adjuntos PDF/imagen cifrados y extracción de texto validada.
4. Búsqueda y filtrado textual de cuidadores y enfermeros, junto con mapa visual de resultados por cobertura textual.
5. Solicitud de servicios vinculada a ficha clínica, aprobación o rechazo por el profesional, notificaciones internas y cierre/completado del servicio.
6. Disponibilidad semanal declarada por profesionales.
7. Chat privado persistido entre los participantes de una reserva aprobada.
8. Plan asistencial por servicio, pauta de medicamentos, protocolo de emergencia y recordatorios idempotentes.
9. Asistente documental para profesional asignado durante el horario activo, con controles de rol, relación de servicio, minimización por rol, consentimiento de adjuntos y auditoría de metadatos.
10. Reseñas bidireccionales posteriores a servicios completados y recálculo de rating profesional.
11. Citas médicas familiares, recurrencia y solicitud de acompañamiento profesional.

### B. Implementado con limitaciones / parcial

1. El recomendador familiar con IA y pgvector funciona para cuidadores, pero no para enfermeros, disponibilidad, tarifa, experiencia, especialidad o rating como criterios efectivos.
2. La búsqueda local de IA tiene contingencia si el proveedor externo falla, pero no sustituye un motor de matching operativo completo.
3. El autocompletado de dirección usa Google Places solo si el entorno está configurado; el respaldo es textual y no persiste coordenadas.
4. El nombre `GoogleMap.jsx` no corresponde a la tecnología usada en el mapa de búsqueda, que es Leaflet/OpenStreetMap.
5. El chat y el plan asistencial limitan acceso a reservas aprobadas, pero el código no verifica que estén dentro del horario activo pese a describirlas como activas.
6. Web Push y recordatorios dependen de configuración VAPID y del proceso de aplicación; no hay worker o scheduler independiente verificable.
7. La auditoría y minimización del asistente profesional son sólidas dentro de la aplicación, pero el contexto autorizado aún se transmite a SAI sin controles de retención/documentación de proveedor evidenciados.

### C. No implementado

1. Flujo de cancelación de reserva: endpoint, motivo, actor, fecha, notificación e historial.
2. Coordenadas persistidas, geocodificación, distancia, radio de cobertura, rutas, ETA y matching geográfico real.
3. Recomendación IA de enfermeros y ordenamiento IA por disponibilidad, reputación, tarifa, experiencia o especialidad.
4. Minimización y consentimiento específico para el envío de datos clínicos/domicilio al agente familiar externo.
5. Retención, borrado, trazabilidad de proveedor y auditoría de consultas del agente familiar.
6. Moderación, apelaciones, edición o eliminación de reseñas.
7. Tiempo real en el chat, adjuntos de chat y suscripción push para familiares.
8. Montaje de las rutas del router de médicos.
9. Pruebas automatizadas de frontend y cobertura de integración para autenticación, reservas, IA familiar, chat, notificaciones, reseñas, citas y pgvector.

### D. Prioridad antes de la entrega

1. **Corregir seguridad del agente:** retirar la clave fallback de `app/services/ai_agent.py`, rotar el secreto expuesto y exigir `SAI_API_KEY` por configuración segura.
2. **Reducir datos del agente familiar:** seleccionar explícitamente una ficha, enviar solo atributos necesarios para recomendación y solicitar consentimiento específico, revocable y trazable antes de transferir datos a SAI.
3. **Completar cancelación de servicios:** modelo de eventos o campos de cancelación, autorización, motivo obligatorio, notificaciones y representación coherente en frontend.
4. **Evitar recomendaciones inviables:** incorporar enfermeros cuando corresponda y filtrar por disponibilidad, localidad/cobertura real y criterios operativos antes de mostrar sugerencias IA.
5. **Asegurar operación de recordatorios:** ejecutar el despacho en un worker/scheduler independiente, monitorizado e idempotente; verificar configuración VAPID en despliegue.
6. **Cerrar brechas reputacionales:** moderación, reporte, apelación y reglas de visibilidad de reseñas antes de usar la reputación como señal de contratación.
7. **Aumentar pruebas:** añadir integración para endpoints críticos, pruebas de autorización y fuga de datos, pruebas del flujo de reserva y cancelación, y pruebas frontend/build reproducibles.
8. **Alinear documentación y comportamiento:** aclarar Leaflet frente a Google Maps, el alcance real de “servicio activo”, el router de médicos no montado y las limitaciones de IA.

### Totales de funcionalidades por estado

Tomando la matriz de la sección 16 como unidad de conteo: 

| ESTADO | TOTAL |
|---|---:|
| **IMPLEMENTADO** | **16** |
| **PARCIAL** | **7** |
| **NO IMPLEMENTADO** | **6** |

La aplicación ya demuestra un prototipo funcional de contratación y coordinación de atención domiciliaria, con especial fortaleza en fichas, control de acceso al asistente profesional, planes de cuidado y reseñas bidireccionales. Antes de presentarla como solución lista para operación con datos clínicos, deben resolverse prioritariamente la exposición del agente familiar, el secreto embebido, cancelaciones, matching operativo y cobertura de pruebas.