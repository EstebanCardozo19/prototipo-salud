"""
Cliente IA / Orquestador.
Conecta la API de SAI Applications (gpt-5.6-terra) con el servidor MCP local.

Flujo:
1. Lee las herramientas del servidor MCP (get_tool_definitions)
2. Envía mensaje del usuario a SAI con las tool definitions
3. Si SAI responde con tool_calls, ejecuta la herramienta localmente
4. Reenvía el resultado a SAI para generar la respuesta final

Uso: python -m app.services.ai_agent
"""
import os
import json
import requests

from app.mcp_server import buscar_cuidadores_similares, get_tool_definitions

# Configuración de la API de SAI Applications
API_URL = "https://sai-library.saiapplications.com/api/prompt/v1/chat/completions"
API_KEY = os.getenv("SAI_API_KEY", "/cUlRFrje0eXPKWwaOs2IA")
MODEL = "gpt-5.6-terra"

SYSTEM_PROMPT = (
    "Eres un experto en atención geriátrica domiciliaria en Bogotá. "
    "Escucha a las familias, identifica la localidad y necesidades clínicas, "
    "y usa la herramienta buscar_cuidadores_similares para encontrar profesionales. "
    "IMPORTANTE: cuando uses la herramienta, SIEMPRE incluye el campo 'descripcion_paciente' "
    "con la descripción completa de las necesidades del paciente extraída de la conversación. "
    "Responde siempre en español, de forma empática y profesional. "
    "Cuando presentes los resultados, resalta por qué cada profesional es una buena opción "
    "según las necesidades descritas."
)

HEADERS = {
    "accept": "application/json",
    "Content-Type": "application/json",
    "Authorization": f"Bearer {API_KEY}",
}

# Mapa de funciones disponibles (nombre -> callable)
TOOL_REGISTRY = {
    "buscar_cuidadores_similares": buscar_cuidadores_similares,
}


def _llamar_sai(messages: list[dict], tools: list[dict]) -> dict:
    """Envía petición a la API de SAI Applications."""
    payload = {
        "model": MODEL,
        "messages": messages,
        "tools": tools,
        "tool_choice": "auto",
        "max_tokens": 1000,
    }

    response = requests.post(API_URL, headers=HEADERS, json=payload, timeout=60)
    response.raise_for_status()
    return response.json()


def _ejecutar_tool_call(tool_call: dict) -> str:
    """Ejecuta una herramienta local a partir del tool_call de SAI."""
    function_info = tool_call.get("function", tool_call)
    function_name = function_info.get("name", tool_call.get("name"))
    arguments_raw = function_info.get("arguments", "{}")

    if isinstance(arguments_raw, str):
        try:
            arguments = json.loads(arguments_raw)
        except json.JSONDecodeError:
            arguments = {}
    else:
        arguments = arguments_raw if isinstance(arguments_raw, dict) else {}

    func = TOOL_REGISTRY.get(function_name)
    if func is None:
        return f"Error: Herramienta '{function_name}' no encontrada."

    # Normalizar nombres de argumento alternativos que el modelo puede enviar
    if function_name == "buscar_cuidadores_similares":
        # El modelo a veces usa 'query', 'description', 'paciente' en lugar de 'descripcion_paciente'
        for alias in ("query", "description", "paciente", "descripcion", "texto"):
            if alias in arguments and "descripcion_paciente" not in arguments:
                arguments["descripcion_paciente"] = arguments.pop(alias)
        # Si sigue sin el argumento requerido, usar el mensaje original
        if "descripcion_paciente" not in arguments:
            arguments["descripcion_paciente"] = "cuidador general para adulto mayor"

    try:
        return func(**arguments)
    except TypeError as e:
        return f"Error al ejecutar herramienta: {e}"


def _construir_contexto_familiar(familiares: list[dict]) -> str:
    """Genera un bloque de texto con las fichas de los familiares para inyectar al system prompt."""
    if not familiares:
        return ""
    lines = ["\n\n--- FAMILIARES REGISTRADOS POR ESTA FAMILIA ---"]
    for i, f in enumerate(familiares, 1):
        lines.append(f"\nFamiliar #{i}: {f.get('patient_name', 'Sin nombre')}, {f.get('patient_age', '?')} años.")
        if f.get("blood_type"):
            lines.append(f"  Tipo de sangre: {f['blood_type']}.")
        if f.get("mobility_level"):
            mob = {"independiente": "movilidad independiente", "asistida": "movilidad con asistencia",
                   "postrado": "postrado en cama", "silla_ruedas": "en silla de ruedas"}.get(f["mobility_level"], f["mobility_level"])
            lines.append(f"  Movilidad: {mob}.")
        if f.get("diagnoses"):
            lines.append(f"  Diagnósticos: {', '.join(f['diagnoses'])}.")
        if f.get("medications"):
            lines.append(f"  Medicamentos: {', '.join(f['medications'])}.")
        if f.get("allergies"):
            lines.append(f"  Alergias: {', '.join(f['allergies'])}.")
        if f.get("special_needs"):
            lines.append(f"  Necesidades especiales: {f['special_needs']}")
        if f.get("eps"):
            lines.append(f"  EPS: {f['eps']}.")
        if f.get("prepaid_medicine"):
            lines.append(f"  Medicina prepagada: {f['prepaid_medicine']}.")
        if f.get("preferred_hospital"):
            lines.append(f"  Hospital preferido: {f['preferred_hospital']}.")
        addr_parts = [f.get("address"), f.get("neighborhood"), f.get("city")]
        addr = ", ".join(p for p in addr_parts if p)
        if addr:
            extra = []
            if f.get("floor_number"):
                extra.append(f"piso {f['floor_number']}")
            if f.get("is_apartment"):
                extra.append("apartamento")
            if f.get("has_elevator"):
                extra.append("con ascensor")
            if extra:
                addr += f" ({', '.join(extra)})"
            lines.append(f"  Dirección: {addr}.")
        if f.get("emergency_contact"):
            lines.append(f"  Contacto emergencia: {f['emergency_contact']}.")
    lines.append("\nUsa esta información para personalizar tus recomendaciones cuando el familiar mencione a uno de ellos.")
    lines.append("---")
    return "\n".join(lines)


def conversar(mensaje_usuario: str, historial: list[dict] = None, familiares: list[dict] = None) -> dict:
    """
    Procesa un mensaje del usuario y retorna { texto, profesionales }.

    Args:
        mensaje_usuario: Texto del usuario.
        historial: Lista de mensajes previos [{"role": ..., "content": ...}].
        familiares: Lista de fichas clínicas del familiar autenticado.

    Returns:
        dict con 'texto' (respuesta narrativa de SAI) y 'profesionales' (lista estructurada)
    """
    import json as _json

    tools = get_tool_definitions()
    if historial is None:
        historial = []

    # Enriquecer el system prompt con el contexto de familiares si existe
    contexto_familiar = _construir_contexto_familiar(familiares or [])
    system_content = SYSTEM_PROMPT + contexto_familiar

    messages = [{"role": "system", "content": system_content}]
    messages.extend(historial)
    messages.append({"role": "user", "content": mensaje_usuario})

    response_data = _llamar_sai(messages, tools)
    choice = response_data["choices"][0]
    assistant_message = choice["message"]
    tool_calls = assistant_message.get("tool_calls")

    if not tool_calls:
        return {"texto": assistant_message.get("content", ""), "profesionales": []}

    messages.append(assistant_message)
    profesionales_acumulados = []

    for tc in tool_calls:
        tool_call_id = tc.get("id", "call_001")
        result = _ejecutar_tool_call(tc)

        # Extraer profesionales del JSON devuelto por la herramienta
        try:
            parsed = _json.loads(result)
            profesionales_acumulados.extend(parsed.get("profesionales", []))
            # Pasar solo el texto al contexto de SAI para que genere una respuesta legible
            tool_content = parsed.get("texto", result)
        except (_json.JSONDecodeError, AttributeError):
            tool_content = result

        messages.append({
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": tool_content,
        })

    # Segunda llamada: SAI genera la respuesta narrativa
    second_response = _llamar_sai(messages, tools)
    final_text = second_response["choices"][0]["message"].get("content", "")

    return {"texto": final_text, "profesionales": profesionales_acumulados}


def main():
    """Modo interactivo por consola."""
    print("=" * 60)
    print("  Asistente de Atención Domiciliaria - Bogotá")
    print("  (Escribe 'salir' para terminar)")
    print("=" * 60)

    historial = []

    while True:
        print()
        mensaje = input("👨‍👩‍👧 Familia: ").strip()
        if not mensaje or mensaje.lower() in ("salir", "exit", "quit"):
            print("\nGracias por usar nuestro servicio. ¡Hasta pronto!")
            break

        try:
            respuesta = conversar(mensaje, historial)
            print(f"\n🤖 Asistente: {respuesta}")

            # Mantener historial para multi-turno
            historial.append({"role": "user", "content": mensaje})
            historial.append({"role": "assistant", "content": respuesta})

        except requests.exceptions.HTTPError as e:
            print(f"\n❌ Error de API: {e}")
            print("   Verifica tu SAI_API_KEY en las variables de entorno.")
        except Exception as e:
            print(f"\n❌ Error: {e}")


if __name__ == "__main__":
    main()
