import { useState, useMemo, useRef, useEffect } from 'react';
import { useLang } from '../../contexts/LangContext';
import Spinner from '../common/Spinner';
import { MOBILITY_OPTIONS_KEYS, BLOOD_TYPES, EMPTY_PATIENT, INPUT_CLASS, LABEL_CLASS } from '../../constants';
import { getEpsList, getPrepaidList, getMobilityLabel, parseList, joinList } from '../../utils/helpers';
import { BOGOTA_CITY, getLocalidadesForCity, getBarriosForLocalidad } from '../../constants/colombiaGeo';
import { loadGoogleMapsScript } from '../../utils/googleMaps';

// Tipos de vía más comunes en Colombia
const VIA_TYPES = ['Calle', 'Carrera', 'Avenida', 'Av. Calle', 'Av. Carrera', 'Diagonal', 'Transversal', 'Circular'];

// Valida que la dirección tenga formato colombiano mínimo: Tipo Num # Num - Num
const COLOMBIAN_ADDRESS_RE = /^(calle|carrera|cra|cll|avenida|av\.?\s|diagonal|diag\.?|transversal|trans\.?|circular)\s*\d+[a-z]?\s*#\s*\d+[a-z]?\s*-\s*\d+/i;
function validateColombianAddress(addr) {
  if (!addr || addr.trim() === '') return null; // vacío = sin error (campo opcional)
  return COLOMBIAN_ADDRESS_RE.test(addr.trim()) ? null : 'Formato sugerido: Calle 15 # 93 - 60';
}

// Hook para autocompletar direcciones con Google Places (si API disponible)
function useGooglePlaces({ inputRef, city, onSelect }) {
  const acRef = useRef(null);
  useEffect(() => {
    let mounted = true;
    loadGoogleMapsScript().then(maps => {
      if (!mounted || !maps?.places || !inputRef.current) return;
      try {
        const ac = new maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: 'co' },
          fields: ['address_components', 'geometry', 'formatted_address', 'name'],
          types: ['address', 'geocode'],
        });
        ac.addListener('place_changed', () => {
          const place = ac.getPlace();
          if (!place?.geometry) return;
          let street = '', num = '', neighborhood = '', detectedCity = city;
          for (const comp of (place.address_components || [])) {
            if (comp.types.includes('route')) street = comp.long_name;
            if (comp.types.includes('street_number')) num = comp.long_name;
            if (comp.types.includes('sublocality') || comp.types.includes('sublocality_level_1') || comp.types.includes('neighborhood')) {
              neighborhood = comp.long_name;
            }
            if (comp.types.includes('locality') || comp.types.includes('administrative_area_level_2')) {
              detectedCity = comp.long_name;
            }
          }
          const formatted = street ? `${street} ${num}`.trim() : (place.name || place.formatted_address);
          if (onSelect) onSelect({ address: formatted, neighborhood, city: detectedCity, formatted_address: place.formatted_address });
        });
        acRef.current = ac;
      } catch (e) { /* Google Places no disponible */ }
    });
    return () => { mounted = false; };
  }, [city]); // eslint-disable-line react-hooks/exhaustive-deps
  return acRef;
}

// ── Modal de formulario de Ficha Familiar ─────────────────────
export default function PatientFormModal({ initial, onSave, onCancel, saving, error }) {
  const { t, lang } = useLang();
  const epsList = getEpsList(lang);
  const prepaidList = getPrepaidList(lang);
  const mobilityOptions = MOBILITY_OPTIONS_KEYS.map(k => ({ value: k, label: getMobilityLabel(k, lang) }));

  const [form, setForm] = useState(() => ({
    ...EMPTY_PATIENT,
    ...initial,
    diagnoses:        joinList(initial?.diagnoses),
    takes_medications: initial?.takes_medications ?? (initial?.medications?.length > 0),
    medications:      joinList(initial?.medications),
    allergies:        joinList(initial?.allergies),
    floor_number:     initial?.floor_number ?? '',
    is_apartment:     initial?.is_apartment ?? false,
    is_house:         initial?.is_house ?? false,
    has_elevator:     initial?.has_elevator ?? false,
    city:             BOGOTA_CITY,
    neighborhood:     initial?.neighborhood || '',
    address:          initial?.address || '',
    prepaid_medicine: initial?.prepaid_medicine || 'Ninguna',
    sector:           initial?.sector || '',
    via_type:         initial?.via_type || 'Calle',
    via_num:          initial?.via_num || '',
    via_cross:        initial?.via_cross || '',
    via_door:         initial?.via_door || '',
    via_complement:   initial?.via_complement || '',
  }));

  // Estado para el input de barrio con sugerencias
  const [sectorInput, setSectorInput] = useState(initial?.sector || '');
  const [showBarrioSuggestions, setShowBarrioSuggestions] = useState(false);
  const sectorRef = useRef(null);

  // Input ref para Google Places
  const manualAddressRef = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const availableLocalidades = useMemo(
    () => getLocalidadesForCity(BOGOTA_CITY),
    []
  );

  // Barrios sugeridos para la localidad seleccionada
  const barriosSugeridos = useMemo(
    () => getBarriosForLocalidad(form.city, form.neighborhood),
    [form.city, form.neighborhood]
  );

  // Filtra barrios según lo que el usuario va escribiendo
  const barriosFiltrados = useMemo(() => {
    if (!sectorInput.trim()) return barriosSugeridos;
    return barriosSugeridos.filter(b => b.toLowerCase().includes(sectorInput.toLowerCase()));
  }, [sectorInput, barriosSugeridos]);

  // Auto-construye la dirección en formato colombiano
  const builtAddress = useMemo(() => {
    if (!form.via_type || !form.via_num || !form.via_cross || !form.via_door) return '';
    let addr = `${form.via_type} ${form.via_num} # ${form.via_cross} - ${form.via_door}`;
    if (form.via_complement) addr += `, ${form.via_complement}`;
    return addr;
  }, [form.via_type, form.via_num, form.via_cross, form.via_door, form.via_complement]);

  // Validación de dirección manual
  const addressError = useMemo(() => validateColombianAddress(form.address), [form.address]);

  // Completitud de la ubicación (para indicador de progreso)
  const locationCompleteness = useMemo(() => {
    let done = 0;
    if (form.city) done++;
    if (form.neighborhood) done++;
    if (form.sector || form.address || builtAddress) done++;
    return { done, total: 3 };
  }, [form.city, form.neighborhood, form.sector, form.address, builtAddress]);

  // Google Places para el campo de dirección manual
  useGooglePlaces({
    inputRef: manualAddressRef,
    city: form.city,
    onSelect: ({ address, neighborhood }) => {
      set('address', address);
      // Solo sobreescribir barrio si el campo está vacío
      if (!form.sector && neighborhood) {
        setSectorInput(neighborhood);
        set('sector', neighborhood);
      }
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalAddress = form.address || builtAddress || null;
    onSave({
      patient_name:       form.patient_name,
      patient_age:        parseInt(form.patient_age) || 0,
      blood_type:         form.blood_type || null,
      diagnoses:          parseList(form.diagnoses),
      takes_medications:  form.takes_medications,
      medications:        form.takes_medications ? parseList(form.medications) : [],
      allergies:          parseList(form.allergies),
      mobility_level:     form.mobility_level || null,
      special_needs:      form.special_needs || null,
      emergency_contact:  form.emergency_contact || null,
      address:            finalAddress,
      neighborhood:       form.neighborhood || null,
      sector:             form.sector || null,
      city:               form.city || null,
      floor_number:       form.floor_number !== '' ? parseInt(form.floor_number) : null,
      is_apartment:       form.is_apartment,
      has_elevator:       form.has_elevator,
      housing_notes:      form.housing_notes || null,
      eps:                form.eps || null,
      prepaid_medicine:   (form.prepaid_medicine === 'Ninguna' || form.prepaid_medicine === 'No tiene') ? null : form.prepaid_medicine,
      preferred_hospital: form.preferred_hospital || null,
    });
  };

  const isEditing = !!initial?.id;

  // Secciones del formulario con stepper visual
  const sections = [
    { id: 'basic',    icon: 'person',             label: t('patients.sectionBasic')   },
    { id: 'medical',  icon: 'medical_information', label: t('patients.sectionMedical') },
    { id: 'address',  icon: 'home',               label: t('patients.sectionAddress') },
    { id: 'health',   icon: 'local_hospital',     label: t('patients.sectionHealth')  },
  ];
  const [activeSection, setActiveSection] = useState('basic');

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6"
      style={{ background: 'rgba(10,15,30,0.65)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden"
        style={{ maxWidth: 680, maxHeight: '92vh' }}>

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-[#0040a1] to-[#0056d2] px-4 py-4 sm:px-6 sm:py-5 rounded-t-2xl flex items-center justify-between gap-3 shrink-0">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[22px]">
                {isEditing ? 'edit_note' : 'person_add'}
              </span>
            </div>
            <div className="min-w-0">
              <h2 className="text-white font-bold text-[18px] leading-tight">
                {isEditing ? t('patients.editTitle') : t('patients.newTitle')}
              </h2>
              {isEditing && <p className="truncate text-white/70 text-[13px]">{initial.patient_name}</p>}
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25 transition-all"
          >
            <span className="material-symbols-outlined text-white text-[20px]">close</span>
          </button>
        </div>

        {/* ── Tabs de sección ── */}
        <div className="flex border-b border-[#c3c6d6]/40 bg-[#f9f9fc] shrink-0 overflow-x-auto">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-[13px] font-semibold whitespace-nowrap border-b-2 transition-all ${
                activeSection === s.id
                  ? 'border-[#0040a1] text-[#0040a1] bg-white'
                  : 'border-transparent text-[#737785] hover:text-[#424654]'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{s.icon}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          ))}
        </div>

        {/* ── Cuerpo scrolleable ── */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">

            {/* ─ Datos básicos ─ */}
            {activeSection === 'basic' && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className={LABEL_CLASS}>
                    {t('patients.patientName')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    className={INPUT_CLASS}
                    value={form.patient_name}
                    onChange={e => set('patient_name', e.target.value)}
                    required
                    placeholder={t('patients.patientNamePh')}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL_CLASS}>
                      {t('patients.age')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      className={INPUT_CLASS}
                      type="number"
                      min="0"
                      max="120"
                      value={form.patient_age}
                      onChange={e => set('patient_age', e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>{t('patients.bloodType')}</label>
                    <select
                      className={INPUT_CLASS}
                      value={form.blood_type}
                      onChange={e => set('blood_type', e.target.value)}
                    >
                      <option value="">{t('patients.bloodTypeNa')}</option>
                      {BLOOD_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={LABEL_CLASS}>{t('patients.mobilityLabel')}</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {mobilityOptions.map(o => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => set('mobility_level', o.value)}
                        className={`h-[40px] rounded-xl text-[12px] font-semibold border transition-all ${
                          form.mobility_level === o.value
                            ? 'bg-[#0040a1] text-white border-[#0040a1]'
                            : 'bg-white text-[#424654] border-[#c3c6d6] hover:border-[#0040a1]/40'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={LABEL_CLASS}>{t('patients.emergencyContact')}</label>
                  <input
                    className={INPUT_CLASS}
                    value={form.emergency_contact}
                    onChange={e => set('emergency_contact', e.target.value)}
                    placeholder={t('patients.emergencyPh')}
                  />
                </div>
              </div>
            )}

            {/* ─ Condición médica ─ */}
            {activeSection === 'medical' && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className={LABEL_CLASS}>
                    {t('patients.diagnoses')} <span className="text-[11px] text-[#737785] font-normal">{t('patients.separatedByComma')}</span>
                  </label>
                  <input
                    className={INPUT_CLASS}
                    value={form.diagnoses}
                    onChange={e => set('diagnoses', e.target.value)}
                    placeholder={t('patients.diagPh')}
                  />
                  {form.diagnoses && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {parseList(form.diagnoses).map((d, i) => (
                        <span key={i} className="bg-orange-50 text-orange-700 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-orange-100">
                          {d}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className={LABEL_CLASS}>{t('patients.takesMedications')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => set('takes_medications', true)}
                      className={`h-[42px] rounded-xl border text-[13px] font-semibold transition-all ${form.takes_medications ? 'border-[#0040a1] bg-[#0040a1] text-white' : 'border-[#c3c6d6] bg-white text-[#424654]'}`}>
                      {t('common.yes')}
                    </button>
                    <button type="button" onClick={() => setForm(current => ({ ...current, takes_medications: false, medications: '' }))}
                      className={`h-[42px] rounded-xl border text-[13px] font-semibold transition-all ${!form.takes_medications ? 'border-[#0040a1] bg-[#0040a1] text-white' : 'border-[#c3c6d6] bg-white text-[#424654]'}`}>
                      {t('common.no')}
                    </button>
                  </div>
                  {form.takes_medications && (
                    <div className="mt-3">
                      <label className={LABEL_CLASS}>
                        {t('patients.medications')} <span className="text-[11px] text-[#737785] font-normal">{t('patients.separatedByComma')}</span>
                      </label>
                      <input
                        className={INPUT_CLASS}
                        value={form.medications}
                        onChange={e => set('medications', e.target.value)}
                        placeholder={t('patients.medPh')}
                      />
                      {form.medications && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {parseList(form.medications).map((m, i) => (
                            <span key={i} className="bg-blue-50 text-blue-700 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-blue-100">
                              {m}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className={LABEL_CLASS}>
                    {t('patients.allergies')} <span className="text-[11px] text-[#737785] font-normal">{t('patients.separatedByComma')}</span>
                  </label>
                  <input
                    className={INPUT_CLASS}
                    value={form.allergies}
                    onChange={e => set('allergies', e.target.value)}
                    placeholder={t('patients.allergyPh')}
                  />
                  {form.allergies && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {parseList(form.allergies).map((a, i) => (
                        <span key={i} className="bg-red-50 text-red-600 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-red-100">
                          {a}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className={LABEL_CLASS}>{t('patients.specialNeeds')}</label>
                  <textarea
                    className="w-full px-4 py-3 rounded-xl border border-[#c3c6d6] bg-white focus:border-[#0040a1] focus:ring-2 focus:ring-[#0040a1]/15 focus:outline-none text-[14px] resize-none"
                    rows={4}
                    value={form.special_needs}
                    onChange={e => set('special_needs', e.target.value)}
                    placeholder={t('patients.specialNeedsPh')}
                  />
                </div>
              </div>
            )}

            {/* ─ Vivienda y Ubicación Geográfica ─ */}
            {activeSection === 'address' && (
              <div className="flex flex-col gap-4">

                {/* ── Indicador de completitud ── */}
                <div className="flex items-center gap-3 bg-white border border-[#c3c6d6]/50 rounded-2xl px-4 py-3">
                  <div className="flex gap-1.5">
                    {Array.from({ length: locationCompleteness.total }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-2 w-8 rounded-full transition-all duration-300 ${
                          i < locationCompleteness.done ? 'bg-[#0040a1]' : 'bg-[#e2e5ef]'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-[12px] text-[#737785]">
                    {locationCompleteness.done === 0 && 'Completa la ubicación del paciente'}
                    {locationCompleteness.done === 1 && 'Ciudad seleccionada — falta localidad y dirección'}
                    {locationCompleteness.done === 2 && 'Localidad seleccionada — falta la dirección exacta'}
                    {locationCompleteness.done === 3 && (
                      <span className="text-[#0a7a4e] font-semibold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        Ubicación completa
                      </span>
                    )}
                  </p>
                </div>

                {/* ── Paso 1: Ciudad de cobertura ── */}
                <div className="bg-white rounded-2xl border border-[#c3c6d6]/50 p-4">
                  <p className="text-[11px] font-bold text-[#737785] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold ${form.city ? 'bg-[#0a7a4e] text-white' : 'bg-[#0040a1] text-white'}`}>
                      {form.city ? '✓' : '1'}
                    </span>
                    Ciudad de cobertura
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL_CLASS}>Departamento</label>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#0040a1]/70 text-[17px] pointer-events-none">map</span>
                        <div className="w-full h-[42px] pl-9 pr-3 rounded-xl border border-[#c3c6d6] bg-[#f3f3f6] text-[#424654] text-[14px] font-semibold flex items-center">
                          Bogotá D.C.
                        </div>
                        <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#737785] text-[17px]">expand_more</span>
                      </div>
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>
                        {t('patients.city')} <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#0040a1] text-[17px] pointer-events-none">location_city</span>
                        <div className="w-full h-[42px] pl-9 pr-3 rounded-xl border border-[#c3c6d6] bg-[#f3f3f6] text-[#424654] text-[14px] font-semibold flex items-center">
                          {BOGOTA_CITY}
                        </div>
                        <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#737785] text-[17px]">expand_more</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Paso 2: Localidad → Barrio con sugerencias ── */}
                <div className="bg-white rounded-2xl border border-[#c3c6d6]/50 p-4">
                  <p className="text-[11px] font-bold text-[#737785] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold ${form.neighborhood ? 'bg-[#0a7a4e] text-white' : 'bg-[#0040a1] text-white'}`}>
                      {form.neighborhood ? '✓' : '2'}
                    </span>
                    Localidad / Comuna y Barrio
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Localidad / Comuna */}
                    <div>
                      <label className={LABEL_CLASS}>
                        Localidad / Comuna <span className="text-red-500">*</span>
                      </label>
                      {availableLocalidades.length > 0 ? (
                        <div className="relative">
                          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#0040a1]/70 text-[17px] pointer-events-none">pin_drop</span>
                          <select
                            className={`w-full h-[42px] pl-9 pr-7 rounded-xl border appearance-none focus:ring-2 focus:ring-[#0040a1]/15 focus:outline-none text-[14px] ${
                              form.neighborhood
                                ? 'border-[#0a7a4e]/50 bg-[#f0faf5] text-[#0a7a4e] font-medium focus:border-[#0a7a4e]'
                                : 'border-[#c3c6d6] bg-white focus:border-[#0040a1]'
                            }`}
                            value={form.neighborhood}
                            onChange={e => {
                              set('neighborhood', e.target.value);
                              set('sector', '');
                              setSectorInput('');
                            }}
                            required
                          >
                            <option value="">— Selecciona localidad / comuna —</option>
                            {availableLocalidades.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                          <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#737785] text-[17px]">expand_more</span>
                        </div>
                      ) : (
                        <div className="relative">
                          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#0040a1]/70 text-[17px] pointer-events-none">pin_drop</span>
                          <input
                            className="w-full h-[42px] pl-9 pr-4 rounded-xl border border-[#c3c6d6] bg-white focus:border-[#0040a1] focus:ring-2 focus:ring-[#0040a1]/15 focus:outline-none text-[14px]"
                            value={form.neighborhood}
                            onChange={e => set('neighborhood', e.target.value)}
                            placeholder="Barrio, localidad o comuna"
                          />
                        </div>
                      )}
                    </div>

                    {/* Barrio / Sector con autosugerencias */}
                    <div className="relative" ref={sectorRef}>
                      <label className={LABEL_CLASS}>
                        Barrio / Sector <span className="text-[11px] text-[#737785] font-normal">(opcional)</span>
                      </label>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#737785] text-[16px] pointer-events-none">villa</span>
                        <input
                          className="w-full h-[42px] pl-9 pr-9 rounded-xl border border-[#c3c6d6] bg-white focus:border-[#0040a1] focus:ring-2 focus:ring-[#0040a1]/15 focus:outline-none text-[14px]"
                          value={sectorInput}
                          onChange={e => {
                            setSectorInput(e.target.value);
                            set('sector', e.target.value);
                            setShowBarrioSuggestions(true);
                          }}
                          onFocus={() => setShowBarrioSuggestions(barriosFiltrados.length > 0)}
                          onBlur={() => setTimeout(() => setShowBarrioSuggestions(false), 150)}
                          placeholder={barriosSugeridos.length > 0 ? `Ej: ${barriosSugeridos[0]}…` : 'Ej: El Nogal, Cedritos…'}
                        />
                        {sectorInput && (
                          <button
                            type="button"
                            onClick={() => { setSectorInput(''); set('sector', ''); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#737785] hover:text-[#424654] transition-colors"
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        )}
                      </div>
                      {/* Dropdown de sugerencias */}
                      {showBarrioSuggestions && barriosFiltrados.length > 0 && (
                        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white rounded-xl border border-[#c3c6d6] shadow-xl overflow-hidden">
                          <div className="px-3 py-1.5 bg-[#f3f3f6] border-b border-[#c3c6d6]/30 text-[10px] font-bold text-[#737785] uppercase tracking-wide flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px] text-[#0040a1]">location_on</span>
                            Barrios en {form.neighborhood || form.city}
                          </div>
                          <div className="max-h-[160px] overflow-y-auto">
                            {barriosFiltrados.map((b, i) => (
                              <button
                                key={i}
                                type="button"
                                onMouseDown={() => {
                                  setSectorInput(b);
                                  set('sector', b);
                                  setShowBarrioSuggestions(false);
                                }}
                                className="w-full text-left px-3.5 py-2 text-[13px] text-[#1a1c1e] hover:bg-[#0040a1]/5 hover:text-[#0040a1] transition-colors flex items-center gap-2 border-b border-[#c3c6d6]/20 last:border-0"
                              >
                                <span className="material-symbols-outlined text-[14px] text-[#0040a1]/50">near_me</span>
                                {b}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Paso 3: Dirección exacta ── */}
                <div className="bg-white rounded-2xl border border-[#c3c6d6]/50 p-4">
                  <p className="text-[11px] font-bold text-[#737785] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold ${(form.address || builtAddress) ? 'bg-[#0a7a4e] text-white' : 'bg-[#0040a1] text-white'}`}>
                      {(form.address || builtAddress) ? '✓' : '3'}
                    </span>
                    Dirección exacta
                  </p>
                  <p className="text-[12px] text-[#737785] mb-3">
                    Usa el constructor o pega la dirección directamente. Formato colombiano: <span className="font-mono bg-[#f3f3f6] px-1.5 py-0.5 rounded text-[11px]">Calle 15 # 93 - 60</span>
                  </p>

                  {/* Sub-tabs: Constructor / Manual */}
                  <div className="flex gap-1 mb-4 bg-[#f3f3f6] rounded-xl p-1">
                    {[
                      { id: 'builder', label: 'Constructor', icon: 'build' },
                      { id: 'manual',  label: 'Texto libre / Pegar', icon: 'edit_location' },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => set('_addrTab', tab.id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 h-[34px] rounded-lg text-[12px] font-semibold transition-all ${
                          (form._addrTab || 'builder') === tab.id
                            ? 'bg-white text-[#0040a1] shadow-sm'
                            : 'text-[#737785] hover:text-[#424654]'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[15px]">{tab.icon}</span>
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* ── TAB: Constructor de dirección ── */}
                  {(form._addrTab || 'builder') === 'builder' && (
                    <div>
                      {/* Tipo de vía */}
                      <p className="text-[11px] font-semibold text-[#737785] mb-2">Tipo de vía</p>
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {VIA_TYPES.map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => set('via_type', v)}
                            className={`h-[30px] px-3 rounded-full text-[12px] font-semibold border transition-all ${
                              form.via_type === v
                                ? 'bg-[#0040a1] text-white border-[#0040a1]'
                                : 'bg-[#f3f3f6] text-[#424654] border-transparent hover:border-[#0040a1]/30'
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>

                      {/* Campos numéricos */}
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div>
                          <label className={LABEL_CLASS}>
                            Número <span className="text-red-500">*</span>
                          </label>
                          <input
                            className={`${INPUT_CLASS} ${form.via_num ? 'border-[#0a7a4e]/40' : ''}`}
                            value={form.via_num || ''}
                            onChange={e => set('via_num', e.target.value.replace(/[^0-9A-Za-z]/g, ''))}
                            placeholder="Ej: 15, 45B"
                            maxLength={8}
                          />
                        </div>
                        <div>
                          <label className={LABEL_CLASS}>
                            # Cruce <span className="text-red-500">*</span>
                          </label>
                          <input
                            className={`${INPUT_CLASS} ${form.via_cross ? 'border-[#0a7a4e]/40' : ''}`}
                            value={form.via_cross || ''}
                            onChange={e => set('via_cross', e.target.value.replace(/[^0-9A-Za-z]/g, ''))}
                            placeholder="Ej: 93, 12A"
                            maxLength={8}
                          />
                        </div>
                        <div>
                          <label className={LABEL_CLASS}>
                            – Puerta <span className="text-red-500">*</span>
                          </label>
                          <input
                            className={`${INPUT_CLASS} ${form.via_door ? 'border-[#0a7a4e]/40' : ''}`}
                            value={form.via_door || ''}
                            onChange={e => set('via_door', e.target.value.replace(/[^0-9]/g, ''))}
                            placeholder="Ej: 60"
                            maxLength={6}
                          />
                        </div>
                      </div>

                      {/* Complemento + Piso */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div>
                          <label className={LABEL_CLASS}>Complemento <span className="text-[11px] text-[#737785] font-normal">(Apto, Int.)</span></label>
                          <input
                            className={INPUT_CLASS}
                            value={form.via_complement || ''}
                            onChange={e => set('via_complement', e.target.value)}
                            placeholder="Apto 301, Casa 4, Int 5"
                            maxLength={30}
                          />
                        </div>
                        <div>
                          <label className={LABEL_CLASS}>Piso <span className="text-[11px] text-[#737785] font-normal">(si aplica)</span></label>
                          <input
                            className={INPUT_CLASS}
                            type="number"
                            min="1"
                            max="80"
                            value={form.floor_number}
                            onChange={e => set('floor_number', e.target.value)}
                            placeholder="Ej: 3"
                          />
                        </div>
                      </div>

                      {/* Vista previa construida */}
                      {builtAddress ? (
                        <div className="bg-[#f0f4fd] border border-[#0040a1]/20 rounded-xl px-4 py-3 flex items-start gap-3">
                          <span className="material-symbols-outlined text-[#0040a1] text-[20px] mt-0.5 shrink-0">location_on</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-[#737785] uppercase tracking-wide mb-0.5">Dirección generada</p>
                            <p className="text-[14px] font-bold text-[#0040a1] break-words">{builtAddress}</p>
                            {(form.sector || form.neighborhood) && (
                              <p className="text-[12px] text-[#424654] mt-0.5">
                                {[form.sector, form.neighborhood, form.city].filter(Boolean).join(', ')}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => { set('address', builtAddress); set('_addrTab', 'manual'); }}
                            className="shrink-0 text-[11px] font-bold text-[#0040a1] bg-white border border-[#0040a1]/30 px-2.5 py-1 rounded-lg hover:bg-[#dae2ff] transition-all whitespace-nowrap"
                          >
                            Usar esta
                          </button>
                        </div>
                      ) : (
                        <div className="bg-[#f9f9fc] border border-dashed border-[#c3c6d6] rounded-xl px-4 py-3 text-center">
                          <span className="material-symbols-outlined text-[#c3c6d6] text-[24px] block mb-1">edit_road</span>
                          <p className="text-[12px] text-[#737785]">Completa los campos para ver la dirección generada</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── TAB: Dirección manual / pegar ── */}
                  {(form._addrTab || 'builder') === 'manual' && (
                    <div>
                      <div className="relative mb-1">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#737785] text-[16px] pointer-events-none">edit_location</span>
                        <input
                          ref={manualAddressRef}
                          className={`w-full h-[44px] pl-9 pr-4 rounded-xl border text-[14px] focus:outline-none focus:ring-2 transition-all ${
                            addressError
                              ? 'border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-400/20'
                              : form.address
                                ? 'border-[#0a7a4e]/50 bg-[#f0faf5] focus:border-[#0a7a4e] focus:ring-[#0a7a4e]/15'
                                : 'border-[#c3c6d6] bg-white focus:border-[#0040a1] focus:ring-[#0040a1]/15'
                          }`}
                          value={form.address}
                          onChange={e => set('address', e.target.value)}
                          placeholder="Ej: Cra 15 # 93-60, Apto 301"
                          autoComplete="street-address"
                        />
                      </div>
                      {/* Mensaje de validación */}
                      {addressError && (
                        <div className="flex items-center gap-1.5 mt-1.5 mb-2 px-1">
                          <span className="material-symbols-outlined text-amber-500 text-[14px]">warning</span>
                          <p className="text-[11px] text-amber-600 font-medium">{addressError}</p>
                        </div>
                      )}
                      {form.address && !addressError && (
                        <div className="flex items-center gap-1.5 mt-1.5 mb-2 px-1">
                          <span className="material-symbols-outlined text-[#0a7a4e] text-[14px]">check_circle</span>
                          <p className="text-[11px] text-[#0a7a4e] font-medium">Formato de dirección válido</p>
                        </div>
                      )}
                      <p className="text-[11px] text-[#737785] px-1">
                        Si tienes Google Maps activo, escribe para ver sugerencias. Formato: <span className="font-mono">Tipo Núm # Cruce - Puerta</span>
                      </p>
                    </div>
                  )}
                </div>

                {/* ── Paso 4: Tipo de vivienda y acceso ── */}
                <div className="bg-white rounded-2xl border border-[#c3c6d6]/50 p-4">
                  <p className="text-[11px] font-bold text-[#737785] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#0040a1] text-white text-[10px] flex items-center justify-center font-bold">4</span>
                    Tipo de vivienda y acceso
                  </p>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[
                      { key: 'is_apartment', icon: 'apartment',     label: 'Apartamento',       sub: 'En edificio' },
                      { key: 'has_elevator', icon: 'elevator',      label: 'Tiene ascensor',    sub: 'Acceso sin escaleras' },
                      { key: 'is_house',     icon: 'house',         label: 'Casa / Unifamiliar', sub: 'Acceso independiente' },
                    ].map(({ key, icon, label, sub }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => set(key, !form[key])}
                        className={`h-[60px] rounded-xl border text-left px-3 flex items-center gap-3 transition-all ${
                          form[key]
                            ? 'bg-[#eef3ff] border-[#0040a1] text-[#0040a1]'
                            : 'bg-white text-[#424654] border-[#c3c6d6] hover:border-[#0040a1]/40'
                        }`}
                      >
                        <span className={`material-symbols-outlined text-[22px] ${form[key] ? 'text-[#0040a1]' : 'text-[#9ca3af]'}`}>{icon}</span>
                        <div>
                          <p className="text-[12px] font-semibold leading-tight">{label}</p>
                          <p className={`text-[10px] leading-tight ${form[key] ? 'text-[#0040a1]/70' : 'text-[#9ca3af]'}`}>{sub}</p>
                        </div>
                        {form[key] && (
                          <span className="material-symbols-outlined text-[16px] text-[#0040a1] ml-auto">check_circle</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>
                      Referencias para el profesional
                      <span className="text-[11px] text-[#737785] font-normal ml-1">(portería, color edificio, indicaciones)</span>
                    </label>
                    <textarea
                      className="w-full px-4 py-2.5 rounded-xl border border-[#c3c6d6] bg-white focus:border-[#0040a1] focus:ring-2 focus:ring-[#0040a1]/15 focus:outline-none text-[14px] resize-none"
                      rows={2}
                      value={form.housing_notes || ''}
                      onChange={e => set('housing_notes', e.target.value)}
                      placeholder="Ej: Portería principal sobre Cra 15, timbre A-301, edificio de ladrillo rojo…"
                      maxLength={500}
                    />
                    {form.housing_notes && (
                      <p className="text-[11px] text-[#737785] text-right mt-1">{form.housing_notes.length}/500</p>
                    )}
                  </div>
                </div>

                {/* ── Resumen de ubicación guardada ── */}
                {(form.address || builtAddress) && form.city && (
                  <div className="bg-gradient-to-r from-[#f0faf5] to-[#e8f6ef] border border-[#0a7a4e]/20 rounded-2xl px-4 py-3 flex items-start gap-3">
                    <span className="material-symbols-outlined text-[#0a7a4e] text-[22px] mt-0.5 shrink-0">where_to_vote</span>
                    <div>
                      <p className="text-[11px] font-bold text-[#0a7a4e] uppercase tracking-wide mb-0.5">Resumen de ubicación</p>
                      <p className="text-[13px] font-bold text-[#1a1c1e]">{form.address || builtAddress}</p>
                      <p className="text-[12px] text-[#424654]">
                        {[form.sector, form.neighborhood, form.city].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─ Seguridad Social ─ */}
            {activeSection === 'health' && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className={LABEL_CLASS}>{t('patients.eps')}</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {epsList.map(ep => (
                      <button
                        key={ep}
                        type="button"
                        onClick={() => set('eps', ep === form.eps ? '' : ep)}
                        className={`h-[40px] rounded-xl border text-[12px] font-semibold transition-all px-3 ${
                          form.eps === ep
                            ? 'bg-[#0040a1] text-white border-[#0040a1]'
                            : 'bg-white text-[#424654] border-[#c3c6d6] hover:border-[#0040a1]/40'
                        }`}
                      >
                        {ep}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={LABEL_CLASS}>{t('patients.prepaidMed')}</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {prepaidList.map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => set('prepaid_medicine', p)}
                        className={`h-[40px] rounded-xl border text-[12px] font-semibold transition-all px-3 ${
                          form.prepaid_medicine === p
                            ? 'bg-[#006a61] text-white border-[#006a61]'
                            : 'bg-white text-[#424654] border-[#c3c6d6] hover:border-[#006a61]/40'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={LABEL_CLASS}>{t('patients.preferredHosp')}</label>
                  <input
                    className={INPUT_CLASS}
                    value={form.preferred_hospital}
                    onChange={e => set('preferred_hospital', e.target.value)}
                    placeholder={t('patients.preferredHospPh')}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Footer con navegación y guardar ── */}
          <div className="px-6 py-4 border-t border-[#c3c6d6]/30 bg-white rounded-b-2xl shrink-0">
            {error && (
              <div className="mb-3 px-4 py-2 bg-red-50 border border-red-200 text-red-700 rounded-xl text-[13px] flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">error</span>{error}
              </div>
            )}
            <div className="flex items-center gap-3">
              {/* Prev */}
              <button
                type="button"
                onClick={() => {
                  const idx = sections.findIndex(s => s.id === activeSection);
                  if (idx > 0) setActiveSection(sections[idx - 1].id);
                }}
                disabled={activeSection === sections[0].id}
                className="h-[42px] px-4 border border-[#c3c6d6] text-[#424654] rounded-xl font-semibold text-[13px] disabled:opacity-30 hover:bg-[#f3f3f6] transition-all flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                <span className="hidden sm:inline">{t('patients.previous')}</span>
              </button>

              {/* Dots */}
              <div className="flex gap-1.5 flex-1 justify-center">
                {sections.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveSection(s.id)}
                    className={`rounded-full transition-all ${
                      activeSection === s.id
                        ? 'w-6 h-2.5 bg-[#0040a1]'
                        : 'w-2.5 h-2.5 bg-[#c3c6d6] hover:bg-[#0040a1]/40'
                    }`}
                  />
                ))}
              </div>

              {activeSection !== sections[sections.length - 1].id ? (
                <button
                  type="button"
                  onClick={() => {
                    const idx = sections.findIndex(s => s.id === activeSection);
                    setActiveSection(sections[idx + 1].id);
                  }}
                  className="h-[42px] px-4 bg-[#0040a1] text-white rounded-xl font-semibold text-[13px] hover:bg-[#003080] transition-all flex items-center gap-1"
                >
                  <span className="hidden sm:inline">{t('patients.next')}</span>
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={saving}
                  className="h-[42px] px-5 bg-[#0040a1] text-white rounded-xl font-bold text-[14px] hover:bg-[#003080] transition-all flex items-center gap-2 disabled:opacity-60"
                >
                  {saving ? <Spinner sm /> : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">save</span>
                      {t('patients.save_short')}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
