# IA y Búsqueda Vectorial

Dos sistemas independientes que trabajan juntos: el **agente conversacional** (SAI) y la **búsqueda semántica** (embeddings locales + pgvector).

---

## Embeddings — `app/services/embedding_service.py`

Genera vectores de 384 dimensiones usando `sentence-transformers` corriendo **localmente** (no requiere API externa).

```python
generar_embedding(texto: str) → list[float]
```

- Modelo: `all-MiniLM-L6-v2` (~90 MB, se descarga en primer uso)
- Carga lazy — el modelo se instancia una vez y se reutiliza
- Vectores normalizados para distancia coseno

**Cuándo se llama:**
1. Al registrar/actualizar un cuidador → genera embedding de `bio + specialties`
2. En `mcp_server.py` → genera embedding de la descripción del paciente para comparar

---

## Servidor MCP — `app/mcp_server.py`

Expone la herramienta de búsqueda como "server MCP" (Model Context Protocol) para que el agente SAI pueda llamarla.

### `buscar_cuidadores_similares(descripcion_paciente, localidad?)`

1. Genera embedding del texto del paciente
2. Ejecuta búsqueda vectorial en PostgreSQL:
   ```sql
   ORDER BY cp.embedding <=> CAST(:embedding AS vector)
   LIMIT 3
   ```
   El operador `<=>` es la distancia coseno de pgvector. El resultado más cercano = más compatible.
3. Si se pasa `localidad`, filtra con `LOWER(cp.location) = LOWER(:localidad)`
4. Retorna JSON: `{ texto: str, profesionales: [{ user_id, full_name, specialties, location, hourly_rate, bio, similitud }] }`

### `get_tool_definitions()`

Retorna el schema OpenAI-tools de `buscar_cuidadores_similares` para pasárselo a SAI.

---

## Agente conversacional — `app/services/ai_agent.py`

Implementa el protocolo de **tool-calling** multi-turno con SAI Applications.

**Modelo**: `gpt-5.6-terra` en `https://sai-library.saiapplications.com`  
**Variable de entorno**: `SAI_API_KEY`

### Flujo de `conversar(mensaje, historial, familiares)`

```
1. Construir system_prompt
   └── SYSTEM_PROMPT base (rol de experto geriátrico)
   └── + bloque de fichas clínicas del familiar (si existen)

2. Primera llamada a SAI
   └── messages = [system, ...historial, user_message]
   └── tools = get_tool_definitions()

3. Si SAI responde con tool_calls:
   └── _ejecutar_tool_call(tc) → buscar_cuidadores_similares(...)
   └── Añadir resultado como mensaje "tool" al historial

4. Segunda llamada a SAI
   └── Genera respuesta narrativa en español

5. Retornar { texto: str, profesionales: list }
```

### `_construir_contexto_familiar(familiares)`

Genera un bloque de texto estructurado con las fichas clínicas:
```
--- FAMILIARES REGISTRADOS ---
Familiar #1: María, 82 años.
  Movilidad: con asistencia.
  Diagnósticos: Alzheimer, Hipertensión.
  Medicamentos: Donepezilo, Losartán.
  Dirección: Cra 15 # 93-60 (piso 3, apartamento, con ascensor).
```

### `_ejecutar_tool_call(tool_call)`

Normaliza los nombres de argumento que el modelo puede enviar (`query`, `description`, `paciente` → `descripcion_paciente`) y ejecuta la función del `TOOL_REGISTRY`.

---

## Endpoint del chat — `app/main.py`

### `POST /api/chat`
- **Auth**: JWT (cualquier rol)
- Carga fichas clínicas del familiar si `role == family`
- Llama `ai_agent.conversar(mensaje, historial, familiares)`
- Retorna `{ respuesta: str, profesionales: list }`

### `POST /api/chat/local`
- **Auth**: JWT
- Versión sin historial para búsqueda semántica directa desde `SearchPanel`
- Parámetros: `{ mensaje, localidad? }`
