import { useState, useEffect } from 'react';
import { useLang } from '../../contexts/LangContext';
import Spinner from '../common/Spinner';
import { INPUT_CLASS, LABEL_CLASS, TEMPLATES_KEY } from '../../constants';

// ─── BookingModal ─────────────────────────────────────────────
export default function BookingModal({ professional, token, onClose, onSuccess }) {
  const { t } = useLang();
  const getBogotaNow = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
  };
  const bogotaNow = getBogotaNow();
  const today = bogotaNow.date;
  const initialDate = bogotaNow.hour < 23
    ? today
    : new Date(`${today}T12:00:00`).toISOString().split('T')[0];
  const initialStartHour = bogotaNow.hour < 23 ? bogotaNow.hour + 1 : 8;
  const initialEndHour = initialStartHour < 20 ? initialStartHour + 4 : (initialStartHour + 4) % 24;
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const [days, setDays] = useState([{ date: initialDate, startHour: initialStartHour, endHour: initialEndHour }]);
  const [notes, setNotes] = useState('');
  const [locationSharingPreference, setLocationSharingPreference] = useState('locality_neighborhood');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);

  // ── Familiares registrados ──────────────────────────────────
  const [familyRecords, setFamilyRecords] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);

  useEffect(() => {
    if (!token) return;
    fetch('/api/clinical-records/', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => setFamilyRecords(data))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    fetch(`/api/bookings/availability/${professional.user_id}`)
      .then(response => response.ok ? response.json() : [])
      .then(setAvailability)
      .catch(() => setAvailability([]))
      .finally(() => setAvailabilityLoading(false));
  }, [professional.user_id]);

  const handleSelectRecord = (record) => {
    setSelectedRecord(record);
    // La descripción solo contiene lo que la familia escribe o selecciona expresamente.
    // Nunca se completa desde la ficha clínica al elegir un familiar.
    setNotes('');
  };

  // Plantillas guardadas
  const [templates, setTemplates] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [newTpl, setNewTpl] = useState('');
  const [showTplInput, setShowTplInput] = useState(false);

  const saveTemplate = () => {
    if (!newTpl.trim()) return;
    const updated = [...templates, newTpl.trim()];
    setTemplates(updated);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(updated));
    setNotes(newTpl.trim());
    setNewTpl('');
    setShowTplInput(false);
  };

  const deleteTemplate = (i) => {
    const updated = templates.filter((_, idx) => idx !== i);
    setTemplates(updated);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(updated));
  };

  const addDay = () => {
    const last = days[days.length - 1]?.date || today;
    const next = new Date(`${last}T12:00:00`);
    next.setDate(next.getDate() + 1);
    const nextStr = next.toISOString().split('T')[0];
    if (!days.some(day => day.date === nextStr)) {
      setDays([...days, { date: nextStr, startHour: 8, endHour: 12 }]);
    }
  };

  const removeDay = (index) => setDays(days.filter((_, dayIndex) => dayIndex !== index));

  const updateDay = (index, date) => {
    if (!date) return;
    setDays(days.map((day, dayIndex) => dayIndex === index ? { ...day, date } : day));
  };

  const updateSchedule = (index, field, value) => {
    setDays(days.map((day, dayIndex) => (
      dayIndex === index ? { ...day, [field]: Number(value) } : day
    )));
  };

  const isCoveredByAvailability = day => {
    const date = new Date(`${day.date}T12:00:00`);
    const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
    const previous = new Date(date); previous.setDate(previous.getDate() - 1);
    const previousWeekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][previous.getDay()];
    const start = day.startHour;
    const end = day.endHour > start ? day.endHour : day.endHour + 24;
    return availability.some(item => {
      if (!item.is_active) return false;
      const appliesToday = item.day_of_week === weekday;
      const appliesFromYesterday = item.day_of_week === previousWeekday && item.end_hour < item.start_hour;
      if (!appliesToday && !appliesFromYesterday) return false;
      const availableStart = appliesFromYesterday ? item.start_hour - 24 : item.start_hour;
      const availableEnd = appliesFromYesterday ? item.end_hour : (item.end_hour > item.start_hour ? item.end_hour : item.end_hour + 24);
      return availableStart <= start && end <= availableEnd;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    const currentBogotaTime = getBogotaNow();
    const invalidPastDate = days.find(day => day.date < currentBogotaTime.date);
    if (invalidPastDate) {
      setError(t('booking.dateMustBeFuture'));
      return;
    }
    const invalidPastStart = days.find(day => day.date === currentBogotaTime.date && day.startHour <= currentBogotaTime.hour);
    if (invalidPastStart) {
      setError(t('booking.startMustBeFuture'));
      return;
    }
    const invalidSchedule = days.find(day => day.endHour === day.startHour);
    if (invalidSchedule) {
      setError(t('booking.endMustDiffer'));
      return;
    }
    if (!notes.trim()) {
      setError(t('booking.needsRequired'));
      return;
    }
    if (!selectedRecord) {
      setError(t('booking.patientRequired'));
      return;
    }
    if (days.length === 0) {
      setError(t('booking.atLeastOneDay'));
      return;
    }
    if (new Set(days.map(day => day.date)).size !== days.length) {
      setError(t('booking.duplicateDays'));
      return;
    }
    if (!availabilityLoading && !days.every(isCoveredByAvailability)) {
      setError('Uno o más horarios no coinciden con la disponibilidad publicada del profesional.');
      return;
    }
    setLoading(true);
    setError('');
    const results = [];
    for (const day of days) {
      try {
        const res = await fetch('/api/bookings/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            professional_user_id: professional.user_id,
            professional_role: professional.role,
            clinical_record_id: selectedRecord.id,
            date: day.date,
            start_hour: day.startHour,
            end_hour: day.endHour,
              location_sharing_preference: locationSharingPreference,
            notes: notes.trim(),
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          results.push({ date: day.date, ok: false, msg: d.detail || 'Error' });
        } else {
          results.push({ date: day.date, ok: true });
        }
      } catch (err) {
        results.push({ date: day.date, ok: false, msg: err.message });
      }
    }
    setLoading(false);
    const failed = results.filter(r => !r.ok);
    if (failed.length === 0) {
      onSuccess(days.length);
    } else {
      setError(`Error: ${failed.map(r => `${r.date} (${r.msg})`).join(', ')}`);
      setSent(results.filter(r => r.ok).map(r => r.date));
    }
  };

  const iCls = INPUT_CLASS;
  const lCls = LABEL_CLASS;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,28,30,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col animate-fade-in-up"
        style={{ maxHeight: 'min(90vh, 700px)' }}
      >
        {/* Header fijo */}
        <div className="bg-[#0040a1] px-6 py-4 flex items-center justify-between rounded-t-2xl shrink-0">
          <div>
            <h2 className="text-white font-bold text-[17px]">{t('booking.title')}</h2>
            <p className="text-white/70 text-[13px] mt-0.5">{professional.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"
          >
            <span className="material-symbols-outlined text-white text-[20px]">close</span>
          </button>
        </div>

        {/* Cuerpo scrolleable */}
        <div className="overflow-y-auto flex-1 rounded-b-2xl">
          {/* Info profesional */}
          <div className="px-6 py-3 bg-[#f3f3f6] border-b border-[#c3c6d6]/30 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#dae2ff] text-[#0040a1] flex items-center justify-center text-sm font-bold shrink-0">
              {professional.name
                .split(' ')
                .map(w => w[0])
                .slice(0, 2)
                .join('')}
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#1a1c1e]">{professional.specialty}</p>
              <p className="text-[12px] text-[#424654]">
                ${Number(professional.price || 0).toLocaleString('es-CO')}
                {professional.priceUnit}
                {professional.location && ` · ${professional.location}`}
              </p>
            </div>
          </div>

          <form onSubmit={submit} className="p-6 flex flex-col gap-5">
            {/* ── Selector de familiar ── */}
            {familyRecords.length > 0 && (
              <div>
                <label className={lCls}>{t('booking.forPatient')}</label>
                <div className="flex flex-col gap-2">
                  {familyRecords.map(r => {
                    const selected = selectedRecord?.id === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => handleSelectRecord(selected ? null : r)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all
                        ${
                          selected
                            ? 'border-[#0040a1] bg-[#0040a1]/5 ring-2 ring-[#0040a1]/20'
                            : 'border-[#c3c6d6] bg-white hover:border-[#0040a1]/40'
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center text-[15px] font-bold shrink-0
                        ${selected ? 'bg-[#0040a1] text-white' : 'bg-[#dae2ff] text-[#0040a1]'}`}
                        >
                          {r.patient_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[14px] text-[#1a1c1e] truncate">
                            {r.patient_name}
                          </p>
                          <p className="text-[12px] text-[#737785] truncate">
                            {r.patient_age} {t('professional.years')}
                            {r.diagnoses?.length ? ` · ${r.diagnoses.slice(0, 2).join(', ')}` : ''}
                          </p>
                        </div>
                        {selected && (
                          <span className="material-symbols-outlined text-[#0040a1] text-[20px] shrink-0">
                            check_circle
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              {selectedRecord && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[#006a61]">
                  <span className="material-symbols-outlined text-[13px]">privacy_tip</span>
                  {t('booking.descriptionPrivacyNotice')}
                </p>
              )}
              </div>
            )}

            <fieldset className="rounded-xl border border-[#c3c6d6]/70 bg-[#f9f9fc] p-4">
              <legend className="px-1 text-[13px] font-bold text-[#1a1c1e]">{t('booking.locationSharingTitle')}</legend>
              <p className="mb-3 text-[12px] text-[#424654]">{t('booking.locationSharingDescription')}</p>
              <div className="space-y-2">
                <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${locationSharingPreference === 'locality_neighborhood' ? 'border-[#0040a1] bg-[#f0f4fd]' : 'border-[#c3c6d6] bg-white'}`}>
                  <input type="radio" name="location-sharing" value="locality_neighborhood" checked={locationSharingPreference === 'locality_neighborhood'} onChange={e => setLocationSharingPreference(e.target.value)} className="mt-0.5" />
                  <span><span className="block text-[13px] font-semibold text-[#1a1c1e]">{t('booking.generalLocationOption')}</span><span className="block text-[11px] text-[#737785]">{t('booking.generalLocationOptionDescription')}</span></span>
                </label>
                <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${locationSharingPreference === 'exact_address' ? 'border-[#0040a1] bg-[#f0f4fd]' : 'border-[#c3c6d6] bg-white'}`}>
                  <input type="radio" name="location-sharing" value="exact_address" checked={locationSharingPreference === 'exact_address'} onChange={e => setLocationSharingPreference(e.target.value)} className="mt-0.5" />
                  <span><span className="block text-[13px] font-semibold text-[#1a1c1e]">{t('booking.exactAddressOption')}</span><span className="block text-[11px] text-[#737785]">{t('booking.exactAddressOptionDescription')}</span></span>
                </label>
              </div>
            </fieldset>

            {/* ── Días ── */}
            <div>
              <label className={lCls}>{t('booking.serviceDays')}</label>
              <div className="mb-2 rounded-xl border border-[#c3c6d6]/50 bg-[#f9f9fc] px-3 py-2 text-[12px] text-[#424654]">
                {availabilityLoading ? 'Consultando disponibilidad del profesional…' : availability.length === 0 ? 'Este profesional aún no ha publicado disponibilidad. No podrás enviar una solicitud hasta que configure sus horarios.' : <>Disponibilidad publicada: {availability.filter(item => item.is_active).map(item => `${item.day_of_week}: ${String(item.start_hour).padStart(2, '0')}:00–${String(item.end_hour).padStart(2, '0')}:00`).join(' · ')}</>}
              </div>
              <div className="flex flex-col gap-2">
                {days.map((day, i) => (
                  <div key={i} className="rounded-xl border border-[#c3c6d6]/70 bg-[#f9f9fc] p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        className={`${iCls} flex-1`}
                        type="date"
                        min={today}
                        value={day.date}
                        onChange={e => updateDay(i, e.target.value)}
                        required
                      />
                      {days.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeDay(i)}
                          className="w-9 h-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-all shrink-0"
                          aria-label={t('common.delete')}
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={lCls}>{t('booking.startHour')}</label>
                        <select className={iCls} value={day.startHour} onChange={e => updateSchedule(i, 'startHour', e.target.value)}>
                          {hours.map(h => <option key={h} value={h} disabled={day.date === today && h <= bogotaNow.hour}>{String(h).padStart(2, '0')}:00</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lCls}>{t('booking.endHour')}</label>
                        <select className={iCls} value={day.endHour} onChange={e => updateSchedule(i, 'endHour', e.target.value)}>
                          {hours.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                        </select>
                      </div>
                    </div>
                    <p className="text-[12px] text-[#424654]">
                      {t('booking.duration')}{' '}
                      {day.endHour !== day.startHour
                        ? `${day.endHour > day.startHour ? day.endHour - day.startHour : 24 - day.startHour + day.endHour} ${t('booking.hours')}${day.endHour < day.startHour ? ` (${t('booking.overnight')})` : ''}`
                        : <span className="text-red-500">{t('booking.endMustDiffer')}</span>}
                    </p>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addDay}
                  className="h-[38px] border border-dashed border-[#0040a1]/40 text-[#0040a1] rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 hover:bg-[#0040a1]/5 transition-all"
                >
                  <span className="material-symbols-outlined text-[17px]">add</span>{' '}
                  {t('booking.addDay')}
                </button>
              </div>
            </div>

            {/* ── Descripción de necesidades ── */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={lCls}>
                  {t('booking.needsDesc')} <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowTplInput(v => !v)}
                  className="text-[11px] text-[#0040a1] font-semibold flex items-center gap-1 hover:underline"
                >
                  <span className="material-symbols-outlined text-[14px]">bookmark</span>
                  {showTplInput ? t('booking.closeTemplate') : t('booking.saveTemplate')}
                </button>
              </div>

              {/* Plantillas guardadas */}
              {templates.length > 0 && (
                <div className="mb-2 flex flex-col gap-1.5">
                  <p className="text-[11px] text-[#737785] font-semibold">
                    {t('booking.savedTemplates')}
                  </p>
                  {templates.map((tpl, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 bg-[#f3f3f6] rounded-xl px-3 py-2 border border-[#c3c6d6]/30"
                    >
                      <button
                        type="button"
                        onClick={() => setNotes(tpl)}
                        className="flex-1 text-left text-[12px] text-[#1a1c1e] hover:text-[#0040a1] transition-colors line-clamp-2"
                      >
                        {tpl}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTemplate(i)}
                        className="shrink-0 text-[#737785] hover:text-red-500 transition-colors mt-0.5"
                      >
                        <span className="material-symbols-outlined text-[15px]">delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                className="w-full px-4 py-3 rounded-xl border border-[#c3c6d6] bg-white focus:border-[#0040a1] focus:ring-2 focus:ring-[#0040a1]/15 focus:outline-none text-[14px] resize-none"
                rows={4}
                placeholder={t('booking.needsPlaceholder')}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                required
              />

              {/* Guardar como nueva plantilla */}
              {showTplInput && (
                <div className="mt-2 flex gap-2">
                  <textarea
                    className="flex-1 px-3 py-2 rounded-xl border border-[#c3c6d6] text-[13px] focus:border-[#0040a1] focus:outline-none resize-none"
                    rows={2}
                    placeholder={t('booking.needsPlaceholder')}
                    value={newTpl}
                    onChange={e => setNewTpl(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={saveTemplate}
                    className="px-4 bg-[#0040a1] text-white rounded-xl text-[13px] font-semibold hover:bg-[#003080] transition-all"
                  >
                    {t('common.save')}
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="px-4 py-2 bg-red-50 border border-red-200 text-red-700 rounded-xl text-[13px]">
                {error}
              </div>
            )}
            {sent.length > 0 && (
              <div className="px-4 py-2 bg-green-50 border border-green-200 text-green-700 rounded-xl text-[13px]">
                {t('booking.sentOk')} {sent.join(', ')}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-[44px] border border-[#c3c6d6] text-[#424654] rounded-xl font-semibold text-[14px] hover:bg-[#f3f3f6] transition-all"
              >
                {t('booking.cancel')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 h-[44px] bg-[#0040a1] text-white rounded-xl font-bold text-[14px] hover:bg-[#003080] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? (
                  <Spinner sm />
                ) : (
                  <>
                    {days.length > 1
                      ? t('booking.sendMultiple', { n: days.length })
                      : t('booking.send')}{' '}
                    <span className="material-symbols-outlined text-[18px]">send</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
