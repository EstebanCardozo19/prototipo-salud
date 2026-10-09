"""
Gestión de medicamentos permanentes del paciente.

Quién puede hacer qué:
  - Familiar (family)   → CRUD completo sobre fichas propias; aprueba/rechaza propuestas.
  - Enfermero (nurse)   → Proponer medicamentos en fichas de pacientes con booking aprobado/completado.
  - Cuidador (caregiver)→ Solo lectura de medicamentos activos del paciente asignado.
  - Admin               → Lectura de cualquier ficha.
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.auth import get_current_user, require_role
from app.database import get_session
from app.models import (
    Booking, BookingStatus, ClinicalRecord,
    MedicationFrequency, MedicationStatus,
    PatientMedication, User, UserRole,
)

router = APIRouter(prefix="/api/medications", tags=["Medicamentos del paciente"])


# ── Schemas ────────────────────────────────────────────────────────────────

class MedicationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    dose: str = Field(min_length=1, max_length=100)
    frequency: MedicationFrequency
    schedules: Optional[List[str]] = Field(default=None, max_length=10)
    instructions: Optional[str] = Field(default=None, max_length=500)
    current_stock: Optional[int] = Field(default=None, ge=0)
    stock_unit: Optional[str] = Field(default=None, max_length=50)
    restock_alert_threshold: Optional[int] = Field(default=None, ge=0)
    treatment_start_date: Optional[str] = Field(default=None, max_length=10)
    treatment_duration_days: Optional[int] = Field(default=None, ge=1)


class MedicationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    dose: Optional[str] = Field(default=None, max_length=100)
    frequency: Optional[MedicationFrequency] = None
    schedules: Optional[List[str]] = Field(default=None, max_length=10)
    instructions: Optional[str] = Field(default=None, max_length=500)
    current_stock: Optional[int] = Field(default=None, ge=0)
    stock_unit: Optional[str] = Field(default=None, max_length=50)
    restock_alert_threshold: Optional[int] = Field(default=None, ge=0)
    treatment_start_date: Optional[str] = Field(default=None, max_length=10)
    treatment_duration_days: Optional[int] = Field(default=None, ge=1)


class StockUpdate(BaseModel):
    current_stock: int = Field(ge=0)


class MedicationResponse(BaseModel):
    id: int
    clinical_record_id: int
    name: str
    dose: str
    frequency: MedicationFrequency
    schedules: Optional[List[str]]
    instructions: Optional[str]
    current_stock: Optional[int]
    stock_unit: Optional[str]
    restock_alert_threshold: Optional[int]
    treatment_start_date: Optional[str]
    treatment_duration_days: Optional[int]
    status: MedicationStatus
    created_by_user_id: int
    proposed_by_user_id: Optional[int]
    approved_by_user_id: Optional[int]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    # calculados
    low_stock: bool = False
    days_remaining: Optional[int] = None


def _enrich(med: PatientMedication) -> MedicationResponse:
    """Añade campos calculados (low_stock, days_remaining)."""
    low_stock = (
        med.current_stock is not None
        and med.restock_alert_threshold is not None
        and med.current_stock <= med.restock_alert_threshold
    )
    days_remaining: Optional[int] = None
    if med.current_stock is not None and med.schedules:
        doses_per_day = len(med.schedules)
        if doses_per_day > 0:
            days_remaining = med.current_stock // doses_per_day
    return MedicationResponse(
        **med.model_dump(),
        low_stock=low_stock,
        days_remaining=days_remaining,
    )


# ── Helpers de autorización ────────────────────────────────────────────────

def _get_own_record(record_id: int, user: User, session: Session) -> ClinicalRecord:
    """Valida que la ficha clínica pertenece al familiar autenticado."""
    record = session.get(ClinicalRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Ficha clínica no encontrada")
    if record.family_user_id != user.id:
        raise HTTPException(status_code=403, detail="No autorizado")
    return record


def _mark_record_as_taking_medications(record: ClinicalRecord, session: Session) -> None:
    """Mantiene sincronizada la ficha con el registro permanente de medicamentos."""
    if not record.takes_medications:
        record.takes_medications = True
        session.add(record)


def _assert_professional_has_access(record_id: int, professional: User, session: Session) -> ClinicalRecord:
    """Verifica que el profesional tiene un servicio aprobado con esta ficha."""
    record = session.get(ClinicalRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Ficha clínica no encontrada")
    booking = session.exec(
        select(Booking).where(
            Booking.clinical_record_id == record_id,
            Booking.professional_user_id == professional.id,
            Booking.status == BookingStatus.approved,
        )
    ).first()
    if not booking:
        raise HTTPException(
            status_code=403,
            detail="Solo puedes ver o proponer medicamentos mientras tengas un servicio aprobado con el paciente.",
        )
    return record


# ── Endpoints para FAMILIA ─────────────────────────────────────────────────

@router.get("/record/{record_id}", response_model=List[MedicationResponse])
def list_medications(
    record_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Lista todos los medicamentos de una ficha. Accesible por familiar, profesional asignado y admin."""
    if current_user.role == UserRole.admin:
        record = session.get(ClinicalRecord, record_id)
        if not record:
            raise HTTPException(status_code=404, detail="Ficha clínica no encontrada")
    elif current_user.role == UserRole.family:
        _get_own_record(record_id, current_user, session)
    else:
        _assert_professional_has_access(record_id, current_user, session)

    meds = session.exec(
        select(PatientMedication).where(PatientMedication.clinical_record_id == record_id)
    ).all()
    return [_enrich(m) for m in meds]


@router.post("/record/{record_id}", response_model=MedicationResponse, status_code=status.HTTP_201_CREATED)
def create_medication(
    record_id: int,
    request: MedicationCreate,
    current_user: User = Depends(require_role(UserRole.family)),
    session: Session = Depends(get_session),
):
    """La familia crea un medicamento activo de inmediato."""
    record = _get_own_record(record_id, current_user, session)
    med = PatientMedication(
        clinical_record_id=record_id,
        created_by_user_id=current_user.id,
        status=MedicationStatus.active,
        **request.model_dump(),
    )
    _mark_record_as_taking_medications(record, session)
    session.add(med)
    session.commit()
    session.refresh(med)
    return _enrich(med)


@router.put("/{medication_id}", response_model=MedicationResponse)
def update_medication(
    medication_id: int,
    request: MedicationUpdate,
    current_user: User = Depends(require_role(UserRole.family)),
    session: Session = Depends(get_session),
):
    """La familia edita un medicamento activo propio."""
    med = session.get(PatientMedication, medication_id)
    if not med:
        raise HTTPException(status_code=404, detail="Medicamento no encontrado")
    _get_own_record(med.clinical_record_id, current_user, session)
    if med.status not in (MedicationStatus.active, MedicationStatus.suspended):
        raise HTTPException(status_code=400, detail="Solo se pueden editar medicamentos activos o suspendidos")
    for key, value in request.model_dump(exclude_unset=True).items():
        setattr(med, key, value)
    session.add(med)
    session.commit()
    session.refresh(med)
    return _enrich(med)


@router.patch("/{medication_id}/stock", response_model=MedicationResponse)
def update_stock(
    medication_id: int,
    request: StockUpdate,
    current_user: User = Depends(require_role(UserRole.family)),
    session: Session = Depends(get_session),
):
    """Actualiza el stock disponible de un medicamento (familiar)."""
    med = session.get(PatientMedication, medication_id)
    if not med:
        raise HTTPException(status_code=404, detail="Medicamento no encontrado")
    _get_own_record(med.clinical_record_id, current_user, session)
    med.current_stock = request.current_stock
    session.add(med)
    session.commit()
    session.refresh(med)
    return _enrich(med)


@router.patch("/{medication_id}/status", response_model=MedicationResponse)
def change_medication_status(
    medication_id: int,
    new_status: MedicationStatus,
    current_user: User = Depends(require_role(UserRole.family)),
    session: Session = Depends(get_session),
):
    """La familia aprueba, rechaza o suspende un medicamento."""
    med = session.get(PatientMedication, medication_id)
    if not med:
        raise HTTPException(status_code=404, detail="Medicamento no encontrado")
    _get_own_record(med.clinical_record_id, current_user, session)

    allowed_transitions = {
        MedicationStatus.proposed:   [MedicationStatus.active, MedicationStatus.rejected],
        MedicationStatus.active:     [MedicationStatus.suspended],
        MedicationStatus.suspended:  [MedicationStatus.active],
    }
    if new_status not in allowed_transitions.get(med.status, []):
        raise HTTPException(
            status_code=400,
            detail=f"No se puede pasar de '{med.status}' a '{new_status}'",
        )
    med.status = new_status
    if new_status == MedicationStatus.active and med.proposed_by_user_id:
        med.approved_by_user_id = current_user.id
    session.add(med)
    session.commit()
    session.refresh(med)
    return _enrich(med)


@router.delete("/{medication_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_medication(
    medication_id: int,
    current_user: User = Depends(require_role(UserRole.family)),
    session: Session = Depends(get_session),
):
    """La familia elimina un medicamento de la ficha."""
    med = session.get(PatientMedication, medication_id)
    if not med:
        raise HTTPException(status_code=404, detail="Medicamento no encontrado")
    _get_own_record(med.clinical_record_id, current_user, session)
    session.delete(med)
    session.commit()


# ── Endpoints para PROFESIONALES (enfermero) ───────────────────────────────

@router.post("/record/{record_id}/propose", response_model=MedicationResponse, status_code=status.HTTP_201_CREATED)
def propose_medication(
    record_id: int,
    request: MedicationCreate,
    current_user: User = Depends(require_role(UserRole.nurse, UserRole.caregiver)),
    session: Session = Depends(get_session),
):
    """El profesional asignado propone un medicamento. Queda en estado 'proposed' hasta que la familia lo apruebe."""
    record = _assert_professional_has_access(record_id, current_user, session)
    med = PatientMedication(
        clinical_record_id=record_id,
        created_by_user_id=current_user.id,
        proposed_by_user_id=current_user.id,
        status=MedicationStatus.proposed,
        **request.model_dump(),
    )
    _mark_record_as_taking_medications(record, session)
    session.add(med)
    session.commit()
    session.refresh(med)
    return _enrich(med)


# ── Agente conversacional de medicamentos ─────────────────────────────────

FREQUENCY_HOURS = {
    MedicationFrequency.every_4h:    4,
    MedicationFrequency.every_6h:    6,
    MedicationFrequency.every_8h:    8,
    MedicationFrequency.every_12h:   12,
    MedicationFrequency.every_24h:   24,
    MedicationFrequency.twice_daily: 12,
    MedicationFrequency.three_daily: 8,
    MedicationFrequency.four_daily:  6,
}

FREQUENCY_LABEL_ES = {
    MedicationFrequency.every_4h:    "cada 4 horas",
    MedicationFrequency.every_6h:    "cada 6 horas",
    MedicationFrequency.every_8h:    "cada 8 horas",
    MedicationFrequency.every_12h:   "cada 12 horas",
    MedicationFrequency.every_24h:   "una vez al día",
    MedicationFrequency.twice_daily: "2 veces al día",
    MedicationFrequency.three_daily: "3 veces al día",
    MedicationFrequency.four_daily:  "4 veces al día",
    MedicationFrequency.as_needed:   "solo si es necesario",
    MedicationFrequency.custom:      "frecuencia personalizada",
}


def _calcular_horarios(hora_inicio: str, frecuencia: MedicationFrequency, intervalo_horas: float | None = None) -> list[str]:
    """Calcula los horarios del día a partir de la hora de inicio y la frecuencia.

    Si se proporciona intervalo_horas se usa directamente (para frecuencias custom o no estándar).
    Para frecuencias estándar se toma el intervalo del mapa FREQUENCY_HOURS.
    """
    from datetime import datetime, timedelta

    # Determinar el intervalo real
    interval: float | None = intervalo_horas or FREQUENCY_HOURS.get(frecuencia)
    if not interval or interval <= 0:
        return []

    # Parsear hora de inicio — acepta "08:00", "8:30", "8am"
    raw = hora_inicio.strip().lower().replace(" ", "")
    parsed = None
    for fmt in ("%H:%M", "%I:%M%p", "%H:%M%p", "%Ih%M", "%I%p", "%H"):
        try:
            parsed = datetime.strptime(raw, fmt)
            break
        except ValueError:
            continue
    if parsed is None:
        # último intento: número puro como hora
        try:
            h = int(raw.replace("h", ""))
            parsed = datetime(2000, 1, 1, h % 24, 0)
        except ValueError:
            return []

    schedules = []
    current = parsed
    # Calcular cuántas dosis caben en 24 horas
    doses_per_day = max(1, int(24 / interval))
    seen = set()
    for _ in range(doses_per_day):
        t_str = current.strftime("%H:%M")
        if t_str in seen:
            break
        seen.add(t_str)
        schedules.append(t_str)
        current += timedelta(hours=interval)

    return schedules


def _calcular_fin_tratamiento(fecha_inicio: str, total_dosis: int, frecuencia: MedicationFrequency) -> str | None:
    """Calcula la fecha de fin y los días de tratamiento."""
    from datetime import datetime, timedelta

    interval = FREQUENCY_HOURS.get(frecuencia)
    if not interval or total_dosis <= 0:
        return None
    try:
        inicio = datetime.strptime(fecha_inicio, "%Y-%m-%d")
    except ValueError:
        return None
    total_horas = total_dosis * interval
    fin = inicio + timedelta(hours=total_horas)
    dias = (fin - inicio).days + (1 if (fin - inicio).seconds > 0 else 0)
    return str(dias)


class MedicationChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    record_id: int
    history: list[dict] = Field(default_factory=list, max_length=10)


class MedicationChatResponse(BaseModel):
    response: str
    suggested_medication: Optional[dict] = None   # payload listo para crear el medicamento
    action: Optional[str] = None                  # "create_ready" | "clarify" | "info"


MEDICATION_AGENT_SYSTEM = """Eres un asistente para registrar medicamentos de pacientes adultos mayores en Colombia.

Tu función: extraer nombre, dosis, frecuencia, hora de inicio, stock y unidad. Luego SIEMPRE usar la herramienta calcular_horarios_medicamento para calcular los horarios — NUNCA calcules horarios tú mismo.

Frecuencias estándar: every_4h, every_6h, every_8h, every_12h, every_24h, twice_daily, three_daily, four_daily.
Frecuencias no estándar (ej: cada 7h, cada 9h, cada 5h): usa frecuencia='custom' e intervalo_horas=N con el número EXACTO que indicó el familiar. No redondees.

REGLA ABSOLUTA: Si el familiar menciona una frecuencia (cada Xh), SIEMPRE llama a la herramienta con ese valor exacto en intervalo_horas. Aunque la frecuencia no sea estándar. Nunca calcules mentalmente.
Otras reglas:
- Responde en español, de forma breve y cálida.
- Si falta nombre, dosis o frecuencia, pregunta solo por lo que falta.
- NO diagnostiques ni recomiendes cambios de dosis.
- Cuando tengas toda la información, usa la herramienta y confirma el resumen antes de crear.
"""

CALCULAR_TOOL = {
    "type": "function",
    "name": "calcular_horarios_medicamento",
    "function": {
        "name": "calcular_horarios_medicamento",
        "description": "Calcula horarios del día para un medicamento dada la hora de inicio y frecuencia. Soporta cualquier intervalo en horas, incluyendo no estándar como 7h o 5h.",
        "parameters": {
            "type": "object",
            "properties": {
                "hora_inicio": {
                    "type": "string",
                    "description": "Hora de inicio en formato HH:MM, ej: '08:00', '20:00'"
                },
                "frecuencia": {
                    "type": "string",
                    "enum": ["every_4h", "every_6h", "every_8h", "every_12h", "every_24h",
                             "twice_daily", "three_daily", "four_daily", "as_needed", "custom"],
                    "description": "Frecuencia estándar. Usa 'custom' para intervalos no estándar."
                },
                "intervalo_horas": {
                    "type": "number",
                    "description": "Intervalo exacto en horas para frecuencias no estándar (ej: 7 para cada 7 horas). Obligatorio cuando frecuencia es 'custom'."
                },
                "total_dosis": {
                    "type": "integer",
                    "description": "Total de dosis disponibles para calcular días de tratamiento"
                },
                "fecha_inicio": {
                    "type": "string",
                    "description": "Fecha inicio YYYY-MM-DD, hoy si no se especifica"
                },
                "nombre": {"type": "string", "description": "Nombre del medicamento"},
                "dosis": {"type": "string", "description": "Dosis por toma, ej: 500 mg"},
                "stock_unit": {"type": "string", "description": "Unidad: pastillas, ml, parches"},
                "instrucciones": {"type": "string", "description": "Instrucciones especiales"}
            },
            "required": ["hora_inicio", "frecuencia"]
        }
    }
}


@router.post("/chat", response_model=MedicationChatResponse)
def medication_chat(
    request: MedicationChatRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Agente conversacional para registrar medicamentos en lenguaje natural."""
    import os, json, requests as http
    from app.services.service_lifecycle import _localized_now

    # Validar acceso a la ficha
    record = session.get(ClinicalRecord, request.record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Ficha no encontrada")
    if current_user.role == UserRole.family and record.family_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")
    if current_user.role in (UserRole.nurse, UserRole.caregiver):
        _assert_professional_has_access(request.record_id, current_user, session)

    # Fecha y hora actual del servidor (Colombia UTC-5)
    now = _localized_now()
    DIAS_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
    MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    dia_semana = DIAS_ES[now.weekday()]
    mes_nombre = MESES_ES[now.month - 1]
    fecha_actual = now.strftime("%Y-%m-%d")
    hora_actual  = now.strftime("%H:%M")

    # Calcular fechas de referencia útiles
    from datetime import timedelta
    ayer       = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    manana     = (now + timedelta(days=1)).strftime("%Y-%m-%d")
    # Día de la semana pasado (ej: "el martes pasado")
    dias_ref = {}
    for offset in range(1, 8):
        d = now - timedelta(days=offset)
        dias_ref[DIAS_ES[d.weekday()]] = d.strftime("%Y-%m-%d")

    fecha_context = (
        f"FECHA Y HORA ACTUAL: {dia_semana} {now.day} de {mes_nombre} de {now.year}, {hora_actual} (hora Colombia).\n"
        f"Fechas de referencia: hoy={fecha_actual}, ayer={ayer}, mañana={manana}.\n"
        f"Días recientes: { ', '.join(f'{d}={v}' for d, v in dias_ref.items()) }.\n"
        "Usa estas fechas cuando el usuario diga 'hoy', 'ayer', 'mañana' o nombre un día de la semana."
    )

    # Contexto del paciente para el agente
    patient_context = (
        f"Paciente: {record.patient_name}, {record.patient_age} años. "
        f"Alergias conocidas: {', '.join(record.allergies or []) or 'ninguna registrada'}."
    )

    api_url = "https://sai-library.saiapplications.com/api/prompt/v1/chat/completions"
    api_key = os.getenv("SAI_API_KEY", "")
    headers = {
        "accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    system_content = (
        MEDICATION_AGENT_SYSTEM
        + f"\n\n{fecha_context}"
        + f"\n\nCONTEXTO DEL PACIENTE:\n{patient_context}"
    )
    messages = [{"role": "system", "content": system_content}]
    for item in request.history[-8:]:
        if item.get("role") in ("user", "assistant") and isinstance(item.get("content"), str):
            messages.append({"role": item["role"], "content": item["content"][:800]})
    messages.append({"role": "user", "content": request.message})

    import re as _re

    def call_sai(msgs, tools, force_tool=False):
        # SAI solo soporta tool_choice "auto" — no soporta forzar herramienta específica
        resp = http.post(api_url, headers=headers, json={
            "model": "gpt-5.6-terra",
            "messages": msgs,
            "tools": tools,
            "tool_choice": "auto",
            "max_tokens": 800,
        }, timeout=30)
        resp.raise_for_status()
        return resp.json()

    # Si hay suficiente info, inyectar un recordatorio justo antes del mensaje del usuario
    # para reforzar que debe usar la herramienta (SAI no soporta force tool_choice)
    msg_lower = request.message.lower()
    has_freq = any(w in msg_lower for w in ("hora", "horas", "vez", "veces", "diario", "día", "dia"))
    has_time = bool(_re.search(r"\d{1,2}(:\d{2})?\s*(am|pm|h\b)", msg_lower))
    history_text = " ".join(m.get("content", "") for m in request.history[-4:]).lower()
    has_med_info = any(w in history_text for w in ("mg", "ml", "pastilla", "cápsula", "capsula", "ampolla", "parche"))
    force = has_freq and (has_time or has_med_info)

    if force:
        messages.insert(-1, {
            "role": "system",
            "content": "RECORDATORIO: el mensaje siguiente contiene frecuencia y hora. Debes llamar a la herramienta calcular_horarios_medicamento con intervalo_horas exacto. No calcules mentalmente."
        })

    try:
        data = call_sai(messages, [CALCULAR_TOOL])
    except Exception as e:
        import logging
        log = logging.getLogger(__name__)
        # Capturar el body de respuesta si es un HTTPError
        resp_body = ""
        if hasattr(e, "response") and e.response is not None:
            try:
                resp_body = e.response.text[:500]
            except Exception:
                pass
        log.warning("SAI error en medication_chat: %s | body: %s", str(e), resp_body)
        return MedicationChatResponse(
            response=(
                "El asistente de IA no está disponible en este momento. "
                "Puedes registrar el medicamento manualmente usando el botón 'Agregar' — "
                "ingresa nombre, dosis, frecuencia y hora de inicio y el sistema calculará los horarios automáticamente."
            ),
            action="clarify",
        )

    choice = data["choices"][0]["message"]
    tool_calls = choice.get("tool_calls")

    # Si el agente calculó horarios en texto sin usar la herramienta, forzamos segunda llamada
    if not tool_calls:
        content = choice.get("content", "")
        manual_calc = bool(_re.search(r"\d{1,2}:\d{2}", content)) and any(
            w in content.lower() for w in ("hora", "horario", "calcul", "discrepan")
        )
        if manual_calc:
            messages.append({"role": "assistant", "content": content})
            messages.append({
                "role": "user",
                "content": "Por favor usa la herramienta calcular_horarios_medicamento con el intervalo_horas exacto indicado. No calcules horarios tú mismo.",
            })
            try:
                data = call_sai(messages, [CALCULAR_TOOL])
                choice = data["choices"][0]["message"]
                tool_calls = choice.get("tool_calls")
            except Exception:
                pass

    if not tool_calls:
        return MedicationChatResponse(
            response=choice.get("content", ""),
            action="clarify",
        )

    # Ejecutar la herramienta localmente
    messages.append(choice)
    suggested = None

    for tc in tool_calls:
        fn = tc.get("function", tc)
        try:
            args = json.loads(fn.get("arguments", "{}"))
        except json.JSONDecodeError:
            args = {}

        hora_inicio = args.get("hora_inicio", "08:00")
        frecuencia_str = args.get("frecuencia", "every_8h")
        intervalo_horas = args.get("intervalo_horas")  # puede ser None para frecuencias estándar
        try:
            frecuencia = MedicationFrequency(frecuencia_str)
        except ValueError:
            frecuencia = MedicationFrequency.custom

        horarios = _calcular_horarios(hora_inicio, frecuencia, intervalo_horas)
        from datetime import date
        fecha_inicio = args.get("fecha_inicio") or date.today().isoformat()
        total_dosis = args.get("total_dosis")
        # Calcular días: usar intervalo_horas si es custom
        interval_for_days = intervalo_horas or FREQUENCY_HOURS.get(frecuencia)
        dias = None
        if total_dosis and interval_for_days:
            from datetime import datetime as _dt, timedelta as _td
            total_horas = int(total_dosis) * interval_for_days
            dias = str(max(1, int(total_horas / 24) + (1 if total_horas % 24 > 0 else 0)))

        tool_result = {
            "horarios_calculados": horarios,
            "frecuencia_label": FREQUENCY_LABEL_ES.get(frecuencia, frecuencia_str),
            "intervalo_horas_usado": intervalo_horas or FREQUENCY_HOURS.get(frecuencia),
            "dias_tratamiento": dias,
            "fecha_inicio": fecha_inicio,
        }

        # Construir el payload sugerido para crear el medicamento
        if args.get("nombre") and args.get("dosis"):
            suggested = {
                "name": args["nombre"],
                "dose": args["dosis"],
                "frequency": frecuencia_str,
                "schedules": horarios,
                "instructions": args.get("instrucciones") or None,
                "current_stock": int(total_dosis) if total_dosis else None,
                "stock_unit": args.get("stock_unit") or "pastillas",
                "restock_alert_threshold": None,
                "treatment_start_date": fecha_inicio,
                "treatment_duration_days": int(dias) if dias else None,
            }

        messages.append({
            "role": "tool",
            "tool_call_id": tc.get("id", "call_001"),
            "content": json.dumps(tool_result, ensure_ascii=False),
        })

    # Segunda llamada: SAI genera la respuesta final con los horarios calculados
    try:
        data2 = call_sai(messages, [CALCULAR_TOOL])
        final_text = data2["choices"][0]["message"].get("content", "")
    except Exception:
        final_text = f"Calculé los horarios: {', '.join(horarios)}. ¿Confirmas que quieres registrar este medicamento?"

    return MedicationChatResponse(
        response=final_text,
        suggested_medication=suggested,
        action="create_ready" if suggested else "clarify",
    )
