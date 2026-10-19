import { useState } from 'react';
import Spinner from '../common/Spinner';

const FREQUENCY_OPTIONS = [
  { value: 'every_4h',    label: 'Cada 4 horas',     hours: 4  },
  { value: 'every_6h',    label: 'Cada 6 horas',     hours: 6  },
  { value: 'every_8h',    label: 'Cada 8 horas',     hours: 8  },
  { value: 'every_12h',   label: 'Cada 12 horas',    hours: 12 },
  { value: 'every_24h',   label: 'Una vez al día',   hours: 24 },
  { value: 'twice_daily', label: '2 veces al día',   hours: 12 },
  { value: 'three_daily', label: '3 veces al día',   hours: 8  },
  { value: 'four_daily',  label: '4 veces al día',   hours: 6  },
  { value: 'as_needed',   label: 'Solo si es necesario', hours: null },
  { value: 'custom',      label: 'Personalizado',    hours: null },
];

function calcularHorarios(fechaHora, frecuencia) {
  const opt = FREQUENCY_OPTIONS.find(o => o.value === frecuencia);
  if (!opt?.hours || !fechaHora) return [];
  const base = new Date(fechaHora);
  if (isNaN(base)) return [];
  const dosesPerDay = Math.round(24 / opt.hours);
  const result = [];
  for (let i = 0; i < dosesPerDay; i++) {
    const d = new Date(base.getTime() + opt.hours * 3600000 * i);
    result.push(d.toTimeString().slice(0, 5));
  }
  return result;
}

function calcularDias(stock, frecuencia) {
  const opt = FREQUENCY_OPTIONS.find(o => o.value === frecuencia);
  if (!opt?.hours || !stock || stock <= 0) return null;
  const dosesPerDay = 24 / opt.hours;
  return Math.ceil(stock / dosesPerDay);
}

const today = new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM

const EMPTY = {
  name: '', dose: '', frequency: 'every_8h',
  first_dose_datetime: today,
  instructions: '',
  current_stock: '', stock_unit: 'pastillas',
  restock_alert_threshold: '',
  treatment_duration_days: '',
};

export default function MedicationFormModal({ initial, onSave, onCancel, saving, error, isProposal = false }) {
  const [step, setStep] = useState(1); // 1 = básico, 2 = horario, 3 = stock
  const [form, setForm] = useState(() => {
    if (!initial) return EMPTY;
    // Al editar, reconstruir first_dose_datetime desde treatment_start_date + primer horario
    const firstTime = (initial.schedules || [])[0] || '08:00';
    const date = initial.treatment_start_date || new Date().toISOString().slice(0, 10);
    return {
      ...EMPTY,
      ...initial,
      first_dose_datetime: `${date}T${firstTime}`,
      current_stock: initial.current_stock ?? '',
      stock_unit: initial.stock_unit ?? 'pastillas',
      restock_alert_threshold: initial.restock_alert_threshold ?? '',
      treatment_duration_days: initial.treatment_duration_days ?? '',
    };
  });

  const set = (field, value) => setForm(f => {
    const next = { ...f, [field]: value };
    // Recalcular días desde el stock cuando cambia stock o frecuencia
    if (field === 'current_stock' || field === 'frequency') {
      const stock = field === 'current_stock' ? parseInt(value) : parseInt(next.current_stock);
      const freq  = field === 'frequency' ? value : next.frequency;
      const dias  = calcularDias(stock, freq);
      if (dias) next.treatment_duration_days = String(dias);
    }
    return next;
  });

  // Horarios calculados en tiempo real
  const schedules = calcularHorarios(form.first_dose_datetime, form.frequency);
  const opt = FREQUENCY_OPTIONS.find(o => o.value === form.frequency);
  const startDate = form.first_dose_datetime ? form.first_dose_datetime.slice(0, 10) : '';

  const handleSubmit = e => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      dose: form.dose.trim(),
      frequency: form.frequency,
      schedules: schedules.length ? schedules : null,
      instructions: form.instructions.trim() || null,
      current_stock: form.current_stock !== '' ? parseInt(form.current_stock) : null,
      stock_unit: form.stock_unit.trim() || null,
      restock_alert_threshold: form.restock_alert_threshold !== '' ? parseInt(form.restock_alert_threshold) : null,
      treatment_start_date: startDate || null,
      treatment_duration_days: form.treatment_duration_days !== '' ? parseInt(form.treatment_duration_days) : null,
    };
    onSave(payload);
  };

  const canNext1 = form.name.trim() && form.dose.trim();
  const canNext2 = form.first_dose_datetime;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#071426]/60 p-2 sm:p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <header className="px-4 py-4 sm:px-6 border-b border-[#dce3eb] shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="flex items-center gap-2 text-[17px] font-bold text-[#17324d]">
              <span className="material-symbols-outlined text-[#0040a1]">medication</span>
              {initial ? 'Editar medicamento' : isProposal ? 'Proponer medicamento' : 'Agregar medicamento'}
            </h2>
            <button type="button" onClick={onCancel} className="rounded-lg p-1 text-[#536779] hover:bg-[#edf2f6]">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          {/* Steps */}
          <div className="flex gap-1">
            {[
              { n: 1, label: 'Medicamento' },
              { n: 2, label: 'Horario' },
              { n: 3, label: 'Stock' },
            ].map(s => (
              <button
                key={s.n}
                type="button"
                onClick={() => step > s.n && setStep(s.n)}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  step === s.n
                    ? 'bg-[#0040a1] text-white'
                    : step > s.n
                    ? 'bg-green-100 text-green-700 cursor-pointer'
                    : 'bg-[#f3f3f6] text-[#8a909e] cursor-default'
                }`}
              >
                {step > s.n ? '✓ ' : ''}{s.label}
              </button>
            ))}
          </div>
        </header>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 flex flex-col gap-4">

            {isProposal && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-800 flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">info</span>
                Esta propuesta quedará pendiente de aprobación por la familia.
              </div>
            )}

            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{error}</p>
            )}

            {/* ── PASO 1: Medicamento ── */}
            {step === 1 && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-semibold text-[#17324d]">¿Qué medicamento es? *</label>
                  <input
                    autoFocus
                    required
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                    placeholder="Ej: Metformina, Ibuprofeno…"
                    className="rounded-xl border border-[#cbd5df] px-4 py-3 text-[14px] focus:outline-none focus:border-[#0040a1]"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-semibold text-[#17324d]">¿Cuánto se toma cada vez? *</label>
                  <input
                    required
                    value={form.dose}
                    onChange={e => set('dose', e.target.value)}
                    placeholder="Ej: 1 pastilla, 500 mg, 10 ml…"
                    className="rounded-xl border border-[#cbd5df] px-4 py-3 text-[14px] focus:outline-none focus:border-[#0040a1]"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-semibold text-[#17324d]">¿Con qué frecuencia?</label>
                  <div className="grid grid-cols-2 gap-2">
                    {FREQUENCY_OPTIONS.map(o => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => set('frequency', o.value)}
                        className={`py-2.5 px-3 rounded-xl text-[12px] font-semibold border transition-all text-left ${
                          form.frequency === o.value
                            ? 'bg-[#0040a1] text-white border-[#0040a1]'
                            : 'bg-white text-[#424654] border-[#c3c6d6] hover:border-[#0040a1]/50'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-semibold text-[#17324d]">Indicaciones especiales</label>
                  <input
                    value={form.instructions}
                    onChange={e => set('instructions', e.target.value)}
                    placeholder="Ej: con comida, en ayunas, no partir…"
                    className="rounded-xl border border-[#cbd5df] px-4 py-3 text-[13px] focus:outline-none focus:border-[#0040a1]"
                  />
                </div>
              </>
            )}

            {/* ── PASO 2: Horario ── */}
            {step === 2 && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-semibold text-[#17324d]">¿Cuándo es la primera dosis?</label>
                  <p className="text-[12px] text-[#8a909e]">Elige la fecha y hora — el resto se calcula solo.</p>
                  <input
                    type="datetime-local"
                    value={form.first_dose_datetime}
                    onChange={e => set('first_dose_datetime', e.target.value)}
                    className="rounded-xl border border-[#cbd5df] px-4 py-3 text-[14px] focus:outline-none focus:border-[#0040a1]"
                  />
                </div>

                {/* Preview horarios */}
                {opt?.hours && schedules.length > 0 && (
                  <div className="rounded-xl bg-[#f0f4ff] border border-[#0040a1]/20 p-4 flex flex-col gap-2">
                    <p className="text-[12px] font-bold text-[#0040a1] flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[15px]">alarm</span>
                      Alarmas calculadas automáticamente
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {schedules.map(h => (
                        <span key={h} className="bg-[#0040a1] text-white text-[13px] font-bold px-3 py-1.5 rounded-full">
                          {h}
                        </span>
                      ))}
                    </div>
                    <p className="text-[11px] text-[#536779]">
                      {FREQUENCY_OPTIONS.find(o => o.value === form.frequency)?.label} — {schedules.length} dosis al día
                    </p>
                  </div>
                )}

                {!opt?.hours && (
                  <div className="rounded-xl bg-[#f6f8fb] border border-[#dce3eb] p-4">
                    <p className="text-[12px] text-[#536779]">
                      Para frecuencia "<strong>{opt?.label}</strong>" no se calculan alarmas automáticas.
                      Puedes configurarlas manualmente más adelante.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* ── PASO 3: Stock ── */}
            {step === 3 && (
              <>
                <div className="flex flex-col gap-2">
                  <label className="text-[13px] font-semibold text-[#17324d]">¿Cuántas dosis tienes disponibles?</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      value={form.current_stock}
                      onChange={e => set('current_stock', e.target.value)}
                      placeholder="Ej: 30"
                      className="flex-1 rounded-xl border border-[#cbd5df] px-4 py-3 text-[14px] focus:outline-none focus:border-[#0040a1]"
                    />
                    <select
                      value={form.stock_unit}
                      onChange={e => set('stock_unit', e.target.value)}
                      className="w-32 rounded-xl border border-[#cbd5df] px-3 py-3 text-[13px] focus:outline-none focus:border-[#0040a1] bg-white"
                    >
                      <option value="pastillas">pastillas</option>
                      <option value="ml">ml</option>
                      <option value="parches">parches</option>
                      <option value="ampollas">ampollas</option>
                      <option value="sobres">sobres</option>
                      <option value="gotas">gotas</option>
                      <option value="cápsulas">cápsulas</option>
                    </select>
                  </div>
                </div>

                {/* Preview días calculados */}
                {form.current_stock && form.treatment_duration_days && opt?.hours && (
                  <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-[12px] text-green-800 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">event_available</span>
                    Con {form.current_stock} {form.stock_unit}, el tratamiento dura aproximadamente <strong className="mx-1">{form.treatment_duration_days} días</strong>
                    {startDate && <span>— hasta el {new Date(new Date(startDate).getTime() + parseInt(form.treatment_duration_days) * 86400000).toLocaleDateString('es-CO')}</span>}
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-semibold text-[#17324d]">Avisar cuando queden pocas dosis</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      value={form.restock_alert_threshold}
                      onChange={e => set('restock_alert_threshold', e.target.value)}
                      placeholder="Ej: 7"
                      className="w-28 rounded-xl border border-[#cbd5df] px-4 py-3 text-[14px] focus:outline-none focus:border-[#0040a1]"
                    />
                    <span className="text-[13px] text-[#536779]">dosis restantes</span>
                  </div>
                  <p className="text-[11px] text-[#8a909e]">Te notificaremos cuando el stock llegue a ese número.</p>
                </div>
              </>
            )}
          </div>

          {/* Footer navegación */}
          <div className="px-6 pb-6 flex gap-3">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="flex-1 h-[46px] border border-[#c3c6d6] text-[#424654] rounded-xl font-semibold text-[14px] hover:bg-[#f3f3f6] transition-all flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                Atrás
              </button>
            ) : (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 h-[46px] border border-[#c3c6d6] text-[#424654] rounded-xl font-semibold text-[14px] hover:bg-[#f3f3f6] transition-all"
              >
                Cancelar
              </button>
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep(s => s + 1)}
                disabled={step === 1 ? !canNext1 : !canNext2}
                className="flex-1 h-[46px] bg-[#0040a1] text-white rounded-xl font-bold text-[14px] hover:bg-[#003080] disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
              >
                Siguiente
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={saving}
                className="flex-1 h-[46px] bg-[#0040a1] text-white rounded-xl font-bold text-[14px] hover:bg-[#003080] disabled:opacity-60 transition-all flex items-center justify-center gap-2"
              >
                {saving
                  ? <><Spinner sm /> Guardando…</>
                  : isProposal
                    ? <><span className="material-symbols-outlined text-[16px]">send</span> Enviar propuesta</>
                    : <><span className="material-symbols-outlined text-[16px]">save</span> {initial ? 'Guardar cambios' : 'Agregar medicamento'}</>
                }
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
