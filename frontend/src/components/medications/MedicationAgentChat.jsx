import { useState, useRef, useEffect } from 'react';
import Spinner from '../common/Spinner';

/**
 * Agente conversacional para registrar medicamentos en lenguaje natural.
 * Cuando el agente devuelve un medicamento listo, muestra botón de confirmación
 * que llama onCreateMedication(payload) para crearlo directamente.
 */
export default function MedicationAgentChat({ record, token, user, onCreateMedication, onClose }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hola, soy tu asistente de medicamentos para **${record.patient_name}**. 😊\n\nPuedes decirme algo como:\n*"Quiero agregar Ibuprofeno 400mg, tengo 16 pastillas, es cada 6 horas, empecé hoy a las 8am"*\n\nYo calcularé los horarios automáticamente y te confirmaré antes de guardar.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggested, setSuggested] = useState(null);   // payload listo para crear
  const [creating, setCreating] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async e => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    const history = messages.filter(m => m.role !== 'system');
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setSuggested(null);

    try {
      const res = await fetch('/api/medications/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: text,
          record_id: record.id,
          history: history.slice(-8),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error del agente');

      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      if (data.suggested_medication && data.action === 'create_ready') {
        setSuggested(data.suggested_medication);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Lo siento, hubo un problema: ${err.message}. Intenta de nuevo.`,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!suggested) return;
    setCreating(true);
    try {
      await onCreateMedication(suggested);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `✅ ¡Medicamento **${suggested.name}** registrado correctamente!\n\nHorarios: ${(suggested.schedules || []).join(', ')}\n\n¿Deseas registrar otro medicamento?`,
      }]);
      setSuggested(null);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `No pude guardar el medicamento: ${err.message}`,
      }]);
    } finally {
      setCreating(false);
    }
  };

  const handleReject = () => {
    setSuggested(null);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Entendido, no guardé nada. ¿Quieres corregir algo o agregar otro medicamento?',
    }]);
  };

  // Renderiza markdown básico (negrita, cursiva, listas con *)
  const renderText = text => {
    return text
      .split('\n')
      .map((line, i) => {
        const bold = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        const italic = bold.replace(/\*(.+?)\*/g, '<em>$1</em>');
        return <p key={i} className="mb-1 last:mb-0" dangerouslySetInnerHTML={{ __html: italic }} />;
      });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#071426]/60 p-2 sm:p-4 backdrop-blur-sm">
      <div className="flex flex-col w-full max-w-lg max-h-[90vh] rounded-2xl bg-white shadow-2xl overflow-hidden">

        {/* Header */}
        <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5 border-b border-[#dce3eb] shrink-0 bg-gradient-to-r from-[#0040a1] to-[#1a5ccf]">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[20px]">smart_toy</span>
            </div>
            <div className="min-w-0">
              <p className="font-bold text-white text-[15px]">Asistente de medicamentos</p>
              <p className="truncate text-white/70 text-[11px]">{record.patient_name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </header>

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-[#f6f8fb]">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-[13px] leading-5 ${
                msg.role === 'user'
                  ? 'bg-[#0040a1] text-white rounded-tr-sm'
                  : 'bg-white text-[#17324d] shadow-sm border border-[#e8edf2] rounded-tl-sm'
              }`}>
                {renderText(msg.content)}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-[#e8edf2] flex items-center gap-2">
                <Spinner sm />
                <span className="text-[12px] text-[#536779]">Calculando…</span>
              </div>
            </div>
          )}

          {/* Tarjeta de confirmación */}
          {suggested && !loading && (
            <div className="bg-white rounded-2xl border-2 border-[#0040a1]/30 shadow-sm p-4 flex flex-col gap-3">
              <p className="text-[12px] font-bold text-[#0040a1] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px]">check_circle</span>
                Medicamento listo para guardar
              </p>
              <div className="bg-[#f6f8fb] rounded-xl p-3 text-[12px] text-[#17324d] flex flex-col gap-1">
                <p><strong>Medicamento:</strong> {suggested.name}</p>
                <p><strong>Dosis:</strong> {suggested.dose}</p>
                <p><strong>Horarios:</strong> {(suggested.schedules || []).join(', ')}</p>
                {suggested.current_stock && (
                  <p><strong>Stock:</strong> {suggested.current_stock} {suggested.stock_unit}</p>
                )}
                {suggested.treatment_duration_days && (
                  <p><strong>Duración:</strong> {suggested.treatment_duration_days} días</p>
                )}
                {suggested.instructions && (
                  <p><strong>Instrucciones:</strong> {suggested.instructions}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={creating}
                  className="flex-1 h-[36px] bg-[#0040a1] text-white rounded-xl text-[12px] font-bold hover:bg-[#003080] disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {creating ? <Spinner sm /> : <><span className="material-symbols-outlined text-[14px]">save</span> Confirmar y guardar</>}
                </button>
                <button
                  onClick={handleReject}
                  disabled={creating}
                  className="h-[36px] px-4 border border-[#c3c6d6] text-[#536779] rounded-xl text-[12px] font-semibold hover:bg-[#f3f3f6]"
                >
                  Corregir
                </button>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form onSubmit={send} className="flex gap-2 p-3 sm:p-4 border-t border-[#dce3eb] bg-white shrink-0">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
            placeholder="Ej: Ibuprofeno 400mg, 16 pastillas, cada 6h desde las 8am…"
            className="flex-1 rounded-xl border border-[#c3c6d6] px-4 py-2.5 text-[13px] focus:outline-none focus:border-[#0040a1] min-w-0"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="shrink-0 w-10 h-10 rounded-xl bg-[#0040a1] text-white flex items-center justify-center hover:bg-[#003080] disabled:opacity-60 transition-colors"
          >
            {loading ? <Spinner sm /> : <span className="material-symbols-outlined text-[18px]">send</span>}
          </button>
        </form>
      </div>
    </div>
  );
}
