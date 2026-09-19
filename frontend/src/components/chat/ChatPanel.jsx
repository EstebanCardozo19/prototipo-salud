import { useState, useRef, useEffect } from 'react';
import { useLang } from '../../contexts/LangContext';
import Spinner from '../common/Spinner';
import ProfessionalDetailModal from '../professionals/ProfessionalDetailModal';

// ─── ChatPanel ───────────────────────────────────────────────
export default function ChatPanel({ user, token, onUnauthorized }) {
  const { t } = useLang();
  const [messages, setMessages] = useState(() => [
    {
      role: 'assistant',
      content: t('chat.greeting', { name: user.full_name }),
      profesionales: [],
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailProf, setDetailProf] = useState(null);
  const [reviewsCache, setReviewsCache] = useState({});
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchReviews = async userId => {
    if (reviewsCache[userId]) return reviewsCache[userId];
    try {
      const res = await fetch(`/api/bookings/reviews/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.ok ? await res.json() : [];
      setReviewsCache(c => ({ ...c, [userId]: data }));
      return data;
    } catch {
      return [];
    }
  };

  const openDetail = async prof => {
    const reviews = await fetchReviews(prof.user_id);
    setDetailProf({ ...prof, reviews });
  };

  const readJsonResponse = async res => {
    const raw = await res.text();
    if (!raw.trim()) {
      throw new Error(res.ok
        ? 'El servidor respondió sin contenido.'
        : `El servidor no pudo procesar la solicitud (HTTP ${res.status}).`);
    }

    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(res.ok
        ? 'El servidor devolvió una respuesta inválida.'
        : raw.slice(0, 300));
    }
  };

  const enviar = async e => {
    e.preventDefault();
    if (!input.trim()) return;
    const text = input;
    setMessages(p => [...p, { role: 'user', content: text, profesionales: [] }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mensaje: text }),
      });
      const data = await readJsonResponse(res);
      if (res.status === 401) {
        onUnauthorized?.();
        throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
      }
      if (!res.ok) throw new Error(data.detail || data.message || `Error HTTP ${res.status}`);
      setMessages(p => [
        ...p,
        {
          role: 'assistant',
          content: data.respuesta,
          profesionales: data.profesionales || [],
        },
      ]);
    } catch (err) {
      setMessages(p => [
        ...p,
        { role: 'assistant', content: `❌ ${err.message}`, error: true, profesionales: [] },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-[#c3c6d6]/30">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#c3c6d6]/30 flex items-center gap-4 bg-gradient-to-b from-[#f3f3f6]/50 to-transparent shrink-0">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#0040a1] to-[#0056d2] text-white flex items-center justify-center shadow-lg">
          <span className="material-symbols-outlined text-[24px]">smart_toy</span>
        </div>
        <div>
          <h2 className="font-bold text-[17px] text-[#0040a1]">{t('chat.title')}</h2>
          <p className="text-[12px] text-[#424654]">{t('chat.subtitle')}</p>
        </div>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-[#f9f9fc]/60">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            {/* Burbuja de texto */}
            <div
              className={`max-w-[92%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed shadow-sm
              ${
                msg.role === 'user'
                  ? 'bg-[#0040a1] text-white rounded-tr-sm'
                  : msg.error
                  ? 'bg-red-50 text-red-700 border border-red-100 rounded-tl-sm'
                  : 'bg-white text-[#1a1c1e] border border-[#c3c6d6]/40 rounded-tl-sm'
              }`}
            >
              {msg.role === 'assistant' && !msg.error && (
                <span className="material-symbols-outlined text-[#0040a1] text-[15px] mr-1.5 align-middle">
                  smart_toy
                </span>
              )}
              <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
            </div>

            {/* Mini-cards de profesionales */}
            {msg.profesionales && msg.profesionales.length > 0 && (
              <div className="w-full mt-2 flex flex-col gap-2">
                {msg.profesionales.map((prof, j) => {
                  const initials = prof.full_name
                    .split(' ')
                    .map(w => w[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();
                  const specs = (prof.specialties || []).slice(0, 2);
                  return (
                    <div
                      key={j}
                      className="bg-white border border-[#c3c6d6]/50 rounded-2xl p-3.5 shadow-sm
                                 hover:border-[#0040a1]/40 hover:shadow-md transition-all duration-200
                                 animate-fade-in-up"
                      style={{ animationDelay: `${j * 0.1}s` }}
                    >
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        {prof.photo_url ? (
                          <img
                            src={prof.photo_url}
                            alt={prof.full_name}
                            className="w-12 h-12 rounded-xl object-cover shrink-0 border border-[#c3c6d6]/30"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-[#dae2ff] text-[#0040a1] flex items-center justify-center font-bold text-[15px] shrink-0">
                            {initials}
                          </div>
                        )}
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-[14px] text-[#1a1c1e] truncate">
                            {prof.full_name}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {specs.map((s, k) => (
                              <span
                                key={k}
                                className="bg-[#0040a1]/10 text-[#0040a1] text-[11px] font-semibold px-2 py-0.5 rounded-lg"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[13px] font-bold text-[#0040a1]">
                              ${Number(prof.hourly_rate).toLocaleString('es-CO')}/h
                            </span>
                            <span className="text-[11px] text-[#424654] flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px] text-[#0040a1]/50">
                                location_on
                              </span>
                              {prof.location}
                            </span>
                            {prof.similitud && (
                              <span className="text-[10px] bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-lg font-semibold ml-auto">
                                {Math.round(prof.similitud * 100)}{t('professional.compatibShort')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Botones */}
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => openDetail(prof)}
                          className="flex-1 h-[34px] border border-[#0040a1]/30 text-[#0040a1] rounded-xl text-[12px] font-semibold hover:bg-[#0040a1]/5 transition-all flex items-center justify-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[15px]">info</span>
                          {t('chat.seeMore')}
                        </button>
                        <button
                          onClick={() => openDetail(prof)}
                          className="flex-1 h-[34px] bg-[#0040a1] text-white rounded-xl text-[12px] font-bold hover:bg-[#003080] transition-all flex items-center justify-center gap-1 shadow-sm"
                        >
                          <span className="material-symbols-outlined text-[15px]">
                            calendar_add_on
                          </span>
                          {t('chat.request')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-[#c3c6d6]/40 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-2">
              <Spinner sm />
              <span className="text-[13px] text-[#424654]">{t('chat.searching')}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-[#c3c6d6]/30 bg-white shrink-0">
        <form onSubmit={enviar} className="relative flex items-center">
          <input
            className="w-full h-[46px] pl-4 pr-12 rounded-xl border border-[#c3c6d6] bg-[#f3f3f6]
                       focus:bg-white focus:border-[#0040a1] focus:ring-2 focus:ring-[#0040a1]/15
                       focus:outline-none text-[14px] transition-all"
            placeholder={t('chat.placeholder')}
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="absolute right-2 w-[34px] h-[34px] bg-[#0040a1] text-white rounded-lg
                       flex items-center justify-center hover:bg-[#003080] transition-all
                       disabled:opacity-40 active:scale-95"
          >
            <span className="material-symbols-outlined text-[17px]">send</span>
          </button>
        </form>
        <button
          onClick={() =>
            setMessages([
              {
                role: 'assistant',
                content: t('chat.greetingShort', { name: user.full_name }),
                profesionales: [],
              },
            ])
          }
          className="mt-2.5 w-full h-[38px] border border-[#0040a1]/30 text-[#0040a1] bg-[#0040a1]/5
                     font-semibold text-[13px] rounded-xl hover:bg-[#0040a1]/10 transition-all
                     flex items-center justify-center gap-1.5"
        >
          <span className="material-symbols-outlined text-[16px]">add</span> {t('chat.newChat')}
        </button>
      </div>

      {/* Modal de detalle del profesional */}
      {detailProf && (
        <ProfessionalDetailModal
          professional={detailProf}
          token={token}
          reviews={detailProf.reviews || []}
          onClose={() => setDetailProf(null)}
        />
      )}
    </div>
  );
}
