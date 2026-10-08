import { useEffect, useState } from 'react';
import Spinner from '../common/Spinner';

const EMPTY_MEDICATION = { medication: '', dosage: '', time: '', instructions: '' };

export default function ServiceCarePlanModal({ booking, user, token, onClose }) {
  const canEdit = booking.professional_user_id === user.id;

  const [plan, setPlan] = useState({
    medication_schedule: [],
    emergency_protocol: '',
    treating_physician_contact: '',
  });
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(null); // hora del último guardado exitoso

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/service-care-plans/${booking.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'No fue posible cargar el plan');
        const data = await res.json();
        if (data) {
          setPlan({
            medication_schedule: data.medication_schedule || [],
            emergency_protocol: data.emergency_protocol || '',
            treating_physician_contact: data.treating_physician_contact || '',
          });
          if (data.updated_at) setSavedAt(new Date(data.updated_at));
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [booking.id, token]);

  const updateMedication = (index, field, value) =>
    setPlan(current => ({
      ...current,
      medication_schedule: current.medication_schedule.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }));

  const addMedication = () =>
    setPlan(current => ({
      ...current,
      medication_schedule: [...current.medication_schedule, { ...EMPTY_MEDICATION }],
    }));

  const removeMedication = index =>
    setPlan(current => ({
      ...current,
      medication_schedule: current.medication_schedule.filter((_, i) => i !== index),
    }));

  const save = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const medication_schedule = plan.medication_schedule.filter(
        item => item.medication.trim() || item.dosage.trim() || item.time.trim()
      );
      if (medication_schedule.some(item => !item.medication.trim() || !item.dosage.trim() || !item.time.trim())) {
        throw new Error('Completa medicamento, dosis y horario en cada pauta agregada.');
      }
      const res = await fetch(`/api/service-care-plans/${booking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...plan, medication_schedule }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'No fue posible guardar el plan');
      const data = await res.json();
      setPlan({
        medication_schedule: data.medication_schedule || [],
        emergency_protocol: data.emergency_protocol || '',
        treating_physician_contact: data.treating_physician_contact || '',
      });
      setSavedAt(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const ask = async event => {
    event.preventDefault();
    if (!question.trim() || asking) return;
    setAsking(true);
    setError('');
    try {
      const res = await fetch(`/api/service-care-plans/${booking.id}/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: question.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'No fue posible consultar el asistente');
      const data = await res.json();
      setAnswer(data.response);
      setQuestion('');
    } catch (err) {
      setError(err.message);
    } finally {
      setAsking(false);
    }
  };

  const formatTime = date =>
    date ? date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#071426]/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <header className="flex items-start justify-between border-b border-[#dce3eb] px-6 py-4 shrink-0">
          <div>
            <h2 className="flex items-center gap-2 text-[18px] font-bold text-[#17324d]">
              <span className="material-symbols-outlined text-[#0040a1]">health_and_safety</span>
              Plan documental del servicio
            </h2>
            <p className="mt-1 text-[12px] text-[#5d6875]">
              {booking.patient_name || 'Paciente'} · Servicio del {booking.date}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[#536779] hover:bg-[#edf2f6]"
            aria-label="Cerrar"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        {/* Body */}
        {loading ? (
          <div className="flex justify-center p-16">
            <Spinner />
          </div>
        ) : (
          <div className="overflow-y-auto p-6 flex flex-col gap-5">

            {/* Error */}
            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-700 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">error</span>
                {error}
              </p>
            )}

            {/* Formulario — solo para el profesional asignado */}
            {canEdit && (
              <form onSubmit={save} className="rounded-2xl border border-[#dce3eb] p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-[#17324d]">Pautas autorizadas</h3>
                    {/* Indicador de guardado persistente */}
                    {savedAt && (
                      <p className="text-[11px] text-green-600 flex items-center gap-1 mt-0.5">
                        <span className="material-symbols-outlined text-[13px]">check_circle</span>
                        Guardado a las {formatTime(savedAt)}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={addMedication}
                    className="text-[12px] font-bold text-[#0040a1] hover:underline"
                  >
                    + Agregar medicamento
                  </button>
                </div>

                {/* Lista de medicamentos */}
                {plan.medication_schedule.length === 0 && (
                  <p className="text-[12px] text-[#8a909e] text-center py-2">
                    No hay pautas agregadas. Usa "+ Agregar medicamento" para comenzar.
                  </p>
                )}
                <div className="flex flex-col gap-3">
                  {plan.medication_schedule.map((item, index) => (
                    <div key={index} className="rounded-xl bg-[#f6f8fb] p-3 border border-[#dce3eb]">
                      {/* Fila 1: medicamento + dosis + horario */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                        <input
                          required
                          value={item.medication}
                          onChange={e => updateMedication(index, 'medication', e.target.value)}
                          placeholder="Medicamento *"
                          className="w-full rounded-lg border border-[#cbd5df] px-3 py-2 text-[12px] focus:outline-none focus:border-[#0040a1]"
                        />
                        <input
                          required
                          value={item.dosage}
                          onChange={e => updateMedication(index, 'dosage', e.target.value)}
                          placeholder="Dosis *"
                          className="w-full rounded-lg border border-[#cbd5df] px-3 py-2 text-[12px] focus:outline-none focus:border-[#0040a1]"
                        />
                        <input
                          required
                          value={item.time}
                          onChange={e => updateMedication(index, 'time', e.target.value)}
                          placeholder="Horario * (ej: 08:00)"
                          className="w-full rounded-lg border border-[#cbd5df] px-3 py-2 text-[12px] focus:outline-none focus:border-[#0040a1]"
                        />
                      </div>
                      {/* Fila 2: indicaciones + eliminar */}
                      <div className="flex gap-2 items-center">
                        <input
                          value={item.instructions || ''}
                          onChange={e => updateMedication(index, 'instructions', e.target.value)}
                          placeholder="Indicaciones adicionales (opcional)"
                          className="flex-1 rounded-lg border border-[#cbd5df] px-3 py-2 text-[12px] focus:outline-none focus:border-[#0040a1]"
                        />
                        <button
                          type="button"
                          onClick={() => removeMedication(index)}
                          className="shrink-0 w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          aria-label="Eliminar pauta"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Protocolo de emergencia */}
                <div className="flex flex-col gap-1">
                  <label className="text-[12px] font-semibold text-[#536779]">Protocolo de emergencia</label>
                  <textarea
                    value={plan.emergency_protocol}
                    onChange={e => setPlan(current => ({ ...current, emergency_protocol: e.target.value }))}
                    maxLength={3000}
                    rows={3}
                    placeholder="Pasos y criterios de actuación ante una emergencia."
                    className="w-full rounded-xl border border-[#cbd5df] p-3 text-[13px] focus:outline-none focus:border-[#0040a1] resize-none"
                  />
                </div>

                {/* Contacto médico tratante */}
                <div className="flex flex-col gap-1">
                  <label className="text-[12px] font-semibold text-[#536779]">Contacto del médico tratante</label>
                  <input
                    value={plan.treating_physician_contact}
                    onChange={e => setPlan(current => ({ ...current, treating_physician_contact: e.target.value }))}
                    maxLength={500}
                    placeholder="Nombre, teléfono o canal de escalamiento"
                    className="w-full rounded-xl border border-[#cbd5df] p-3 text-[13px] focus:outline-none focus:border-[#0040a1]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="self-start rounded-xl bg-[#0040a1] px-5 py-2.5 text-[13px] font-bold text-white hover:bg-[#003080] disabled:opacity-60 transition-colors flex items-center gap-2"
                >
                  {saving
                    ? <><Spinner sm /> Guardando…</>
                    : <><span className="material-symbols-outlined text-[16px]">save</span> Guardar pautas</>
                  }
                </button>
              </form>
            )}

            {/* Vista solo lectura para la familia */}
            {!canEdit && (
              <div className="rounded-2xl border border-[#dce3eb] p-4 flex flex-col gap-3">
                <h3 className="font-bold text-[#17324d]">Pautas registradas por el profesional</h3>
                {plan.medication_schedule.length === 0 && !plan.emergency_protocol && !plan.treating_physician_contact ? (
                  <p className="text-[13px] text-[#8a909e]">
                    El profesional aún no ha registrado pautas para este servicio.
                  </p>
                ) : (
                  <>
                    {plan.medication_schedule.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <p className="text-[12px] font-semibold text-[#536779] uppercase tracking-wide">Medicamentos</p>
                        {plan.medication_schedule.map((item, i) => (
                          <div key={i} className="rounded-xl bg-[#f6f8fb] px-4 py-3 text-[13px] border border-[#dce3eb]">
                            <span className="font-bold text-[#17324d]">{item.medication}</span>
                            <span className="text-[#536779]"> — {item.dosage} a las {item.time}</span>
                            {item.instructions && (
                              <span className="block text-[12px] text-[#8a909e] mt-0.5">{item.instructions}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {plan.emergency_protocol && (
                      <div>
                        <p className="text-[12px] font-semibold text-[#536779] uppercase tracking-wide mb-1">Protocolo de emergencia</p>
                        <p className="text-[13px] text-[#17324d] bg-[#f6f8fb] rounded-xl p-3 border border-[#dce3eb] whitespace-pre-wrap">
                          {plan.emergency_protocol}
                        </p>
                      </div>
                    )}
                    {plan.treating_physician_contact && (
                      <div>
                        <p className="text-[12px] font-semibold text-[#536779] uppercase tracking-wide mb-1">Contacto médico tratante</p>
                        <p className="text-[13px] text-[#17324d] bg-[#f6f8fb] rounded-xl p-3 border border-[#dce3eb]">
                          {plan.treating_physician_contact}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Asistente de consulta */}
            <section className="rounded-2xl border border-[#b9d7ed] bg-[#f6fbff] p-4 flex flex-col gap-3">
              <div>
                <h3 className="flex items-center gap-2 font-bold text-[#17324d]">
                  <span className="material-symbols-outlined text-[#0040a1]">smart_toy</span>
                  Asistente de consulta
                </h3>
                <p className="mt-1 text-[12px] leading-5 text-[#4d6274]">
                  Pregunta sobre los medicamentos, horarios, protocolos o contactos registrados. No diagnostica ni modifica dosis.
                </p>
              </div>
              <form onSubmit={ask} className="flex gap-2">
                <input
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  disabled={asking}
                  placeholder="Ej.: ¿Cuáles son los medicamentos? ¿Qué hago en emergencia?"
                  className="min-w-0 flex-1 rounded-xl border border-[#b9cbd9] bg-white px-3 py-2 text-[13px] focus:outline-none focus:border-[#0040a1]"
                />
                <button
                  type="submit"
                  disabled={asking || !question.trim()}
                  className="shrink-0 rounded-xl bg-[#0040a1] px-4 text-[13px] font-bold text-white disabled:opacity-60 hover:bg-[#003080] transition-colors"
                >
                  {asking ? <Spinner sm /> : 'Consultar'}
                </button>
              </form>
              {answer && (
                <div className="whitespace-pre-wrap rounded-xl border border-[#c9e1f0] bg-white p-3 text-[13px] leading-5 text-[#29465d]">
                  {answer}
                </div>
              )}
            </section>

          </div>
        )}
      </div>
    </div>
  );
}
