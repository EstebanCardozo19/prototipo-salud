import { useEffect, useRef, useState } from 'react';
import Spinner from '../common/Spinner';

const QUICK_QUESTIONS = [
  'Resume la información relevante para esta visita.',
  '¿Qué alergias están registradas?',
  '¿Qué medicamentos y horarios están documentados?',
  '¿Cuál es el protocolo registrado para emergencias?',
];

function List({ title, values, empty = 'No registrado' }) {
  return <div><p className="text-[11px] font-bold uppercase tracking-wide text-[#52677b]">{title}</p><p className="mt-1 text-[13px] text-[#263f55]">{values?.length ? values.join(', ') : empty}</p></div>;
}

export default function ProfessionalPatientAssistantModal({ booking, token, onClose }) {
  const [context, setContext] = useState(null);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, asking]);

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError('');
      try {
        const res = await fetch(`/api/professional-assistant/${booking.id}/context`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'No fue posible cargar el contexto autorizado.');
        setContext(await res.json());
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    };
    load();
  }, [booking.id, token]);

  const ask = async (event, preset) => {
    event?.preventDefault();
    const message = (preset || question).trim();
    if (!message || asking) return;
    setAsking(true); setError('');
    const history = messages.map(item => ({
      role: item.sender === 'user' ? 'user' : 'assistant',
      content: item.text,
    })).slice(-12);
    setMessages(previous => [...previous, { id: `user-${Date.now()}`, sender: 'user', text: message }]);
    setQuestion('');
    try {
      const res = await fetch(`/api/professional-assistant/${booking.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message, history }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'No fue posible consultar el asistente.');
      const data = await res.json();
      setMessages(previous => [...previous, {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: data.response,
        limitations: data.limitations || [],
      }]);
      setContext(data.context || context);
    } catch (err) { setError(err.message); }
    finally { setAsking(false); }
  };

  const patient = context?.patient;
  const authorizedDocuments = context?.authorized_clinical_documents || [];
  return <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#071426]/60 p-4 backdrop-blur-sm">
    <section className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" aria-modal="true" role="dialog" aria-label="Asistente del paciente">
      <header className="flex items-start justify-between border-b border-[#dce3eb] px-6 py-4">
        <div><h2 className="flex items-center gap-2 text-[18px] font-bold text-[#17324d]"><span className="material-symbols-outlined text-[#0040a1]">clinical_notes</span>Asistente documental del paciente</h2><p className="mt-1 text-[12px] text-[#5d6875]">{booking.patient_name || 'Paciente'} · Servicio del {booking.date}</p></div>
        <button onClick={onClose} className="rounded-lg p-1 text-[#536779] hover:bg-[#edf2f6]" aria-label="Cerrar"><span className="material-symbols-outlined">close</span></button>
      </header>
      {loading ? <div className="flex justify-center p-16"><Spinner /></div> : <div className="overflow-y-auto p-6">
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] leading-5 text-amber-900"><b>Uso seguro:</b> consulta únicamente datos documentados del servicio. Este asistente no diagnostica, prescribe ni ajusta tratamientos. Ante una emergencia, activa el protocolo y llama al 123; no esperes una respuesta del chat.</div>
        {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}
        {patient && <section className="mb-5 grid gap-4 rounded-2xl border border-[#d5e3ef] bg-[#f7fbff] p-4 sm:grid-cols-2">
          <div><p className="text-[11px] font-bold uppercase tracking-wide text-[#52677b]">Paciente</p><p className="mt-1 text-[14px] font-bold text-[#17324d]">{patient.name} · {patient.age} años</p><p className="mt-1 text-[13px] text-[#263f55]">Movilidad: {patient.mobility_level || 'No registrada'}</p></div>
          <List title="Alergias" values={patient.allergies} empty="Ninguna registrada" />
          {patient.diagnoses && <List title="Diagnósticos registrados" values={patient.diagnoses} empty="Ninguno registrado" />}
          <div><p className="text-[11px] font-bold uppercase tracking-wide text-[#52677b]">Necesidades especiales</p><p className="mt-1 text-[13px] text-[#263f55]">{patient.special_needs || 'No registradas'}</p></div>
        </section>}
        {context?.document_access_authorized && <section className="mb-5 rounded-2xl border border-[#b9d7ed] bg-[#f6fbff] p-4">
          <h3 className="flex items-center gap-2 font-bold text-[#17324d]"><span className="material-symbols-outlined text-[#0040a1]">description</span>Texto extraído de documentos autorizados</h3>
          <p className="mt-1 text-[12px] leading-5 text-[#52677b]">La familia autorizó la lectura durante este servicio activo. Se muestra texto extraído; los archivos originales no están disponibles aquí.</p>
          {authorizedDocuments.length > 0 ? <div className="mt-3 space-y-3">{authorizedDocuments.map((document, index) => <article key={`${document.filename}-${index}`} className="rounded-xl border border-[#c9e1f0] bg-white p-3">
            <p className="flex items-center gap-1.5 text-[12px] font-bold text-[#17324d]"><span className="material-symbols-outlined text-[16px] text-[#0040a1]">{document.content_type === 'application/pdf' ? 'picture_as_pdf' : 'image'}</span>{document.filename}</p>
            <p className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap text-[13px] leading-5 text-[#29465d]">{document.text}</p>
          </article>)}</div> : <p className="mt-3 rounded-xl border border-dashed border-[#b9d7ed] bg-white/70 p-3 text-[12px] text-[#52677b]">No fue posible extraer texto de los documentos adjuntos.</p>}
        </section>}
        <section className="rounded-2xl border border-[#b9d7ed] bg-[#f6fbff] p-4">
          <h3 className="flex items-center gap-2 font-bold text-[#17324d]"><span className="material-symbols-outlined text-[#0040a1]">smart_toy</span>Consulta información registrada</h3>
          {messages.length === 0 && <div className="mt-4 rounded-xl border border-dashed border-[#b9d7ed] bg-white/70 p-4 text-center text-[13px] text-[#52677b]">Escribe una pregunta o selecciona una consulta rápida para iniciar el chat.</div>}
          {messages.length > 0 && <div className="mt-4 max-h-72 space-y-3 overflow-y-auto rounded-xl border border-[#c9e1f0] bg-white p-3" aria-live="polite">
            {messages.map(item => <div key={item.id} className={`flex ${item.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-5 ${item.sender === 'user' ? 'rounded-br-sm bg-[#0040a1] text-white' : 'rounded-bl-sm bg-[#eaf5fc] text-[#29465d]'}`}>
                {item.sender === 'assistant' && <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#52677b]">Asistente</p>}
                <p className="whitespace-pre-wrap">{item.text}</p>
                {item.limitations?.length > 0 && <ul className="mt-2 list-disc border-t border-[#c9e1f0] pt-2 pl-4 text-[11px] leading-4 text-[#52677b]">{item.limitations.map(limitation => <li key={limitation}>{limitation}</li>)}</ul>}
              </div>
            </div>)}
            {asking && <div className="flex justify-start"><div className="rounded-2xl rounded-bl-sm bg-[#eaf5fc] px-3 py-2"><Spinner sm /></div></div>}
            <div ref={messagesEndRef} />
          </div>}
          <div className="mt-3 flex flex-wrap gap-2">{QUICK_QUESTIONS.map(item => <button key={item} type="button" disabled={asking} onClick={() => ask(null, item)} className="rounded-full border border-[#a9c8e0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0040a1] hover:bg-[#e8f4fd] disabled:opacity-60">{item}</button>)}</div>
          <form onSubmit={ask} className="mt-4 flex gap-2"><input value={question} onChange={event => setQuestion(event.target.value)} disabled={asking} maxLength={1000} placeholder="Escribe una consulta sobre la ficha o el plan registrado" className="min-w-0 flex-1 rounded-xl border border-[#b9cbd9] bg-white px-3 py-2 text-[13px]" /><button disabled={asking || !question.trim()} className="rounded-xl bg-[#0040a1] px-4 text-[13px] font-bold text-white disabled:opacity-60">{asking ? <Spinner sm /> : 'Enviar'}</button></form>
        </section>
      </div>}
    </section>
  </div>;
}