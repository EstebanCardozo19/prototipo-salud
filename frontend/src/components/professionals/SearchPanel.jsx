import { useState, useEffect, useMemo } from 'react';
import { useLang } from '../../contexts/LangContext';
import Spinner from '../common/Spinner';
import CaregiverCard from './CaregiverCard';
import NurseCard from './NurseCard';
import GoogleMap from '../common/GoogleMap';
import BookingModal from '../bookings/BookingModal';
import RateServiceModal from '../bookings/RateServiceModal';
import CancelServiceModal from '../bookings/CancelServiceModal';
import CancelledServiceCommentModal from '../bookings/CancelledServiceCommentModal';
import ServiceChatModal from '../bookings/ServiceChatModal';
import ServiceCarePlanModal from '../bookings/ServiceCarePlanModal';
import ProfessionalDetailModal from './ProfessionalDetailModal';
import StarRating from '../common/StarRating';
import { SPECIALTIES, SPECIALTIES_KEYS } from '../../constants';
import { BOGOTA_CITY, getLocalidadesForCity, getFamilyLocations } from '../../constants/colombiaGeo';
import { getAssetUrl, guessGender, getSpecialtyLabel } from '../../utils/helpers';

const PREFS_KEY = 'salud_user_prefs';
const INITIAL_FILTERS = {
  gender: '',
  specialty: '',
  minExp: '',
  priceRanges: [],
  minPrice: '',
  maxPrice: '',
  minRating: '',
  sortBy: 'rating',
};

const normalizeLocality = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

// Debe replicar la regla del backend: la ubicación primaria sirve para el
// mapa; coverage_localities amplía el catálogo y Toda Bogotá cubre las 20.
const coversLocality = (professional, locality) => {
  if (!locality || professional.covers_all_bogota) return true;
  const requested = normalizeLocality(locality);
  return [professional.location, ...(professional.coverage_localities || [])]
    .some(coveredLocality => normalizeLocality(coveredLocality) === requested);
};
const PRICE_RANGES = [
  { id: 'under_50', min: 0, max: 50000, label: 'search.priceUnder50' },
  { id: '50_80', min: 50000, max: 80000, label: 'search.price50to80' },
  { id: '80_120', min: 80000, max: 120000, label: 'search.price80to120' },
  { id: 'over_120', min: 120000, max: Infinity, label: 'search.priceOver120' },
];

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { return {}; }
}

// ─── SearchPanel con cobertura exclusiva en Bogotá D.C. ───────
export default function SearchPanel({ user, token, activeTab, onTabChange }) {
  const { t, lang } = useLang();
  const [searchText, setSearchText] = useState('');
  const [selectedCity, setSelectedCity] = useState(BOGOTA_CITY);
  const [selectedLocalidad, setSelectedLocalidad] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'map'
  const [caregivers, setCaregivers] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  // ── Familiares del usuario para ubicación contextual ────────
  const [familyRecords, setFamilyRecords] = useState([]);
  const [selectedFamilyChip, setSelectedFamilyChip] = useState(null);
  const [bookingModalProf, setBookingModalProf] = useState(null);
  const [chatBooking, setChatBooking] = useState(null);
  const [carePlanBooking, setCarePlanBooking] = useState(null);
  const [cancellationBooking, setCancellationBooking] = useState(null);
  const [cancelledCommentBooking, setCancelledCommentBooking] = useState(null);

  // ── Filtros adicionales ─────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(INITIAL_FILTERS);

  const availableLocalidades = useMemo(
    () => getLocalidadesForCity(BOGOTA_CITY),
    []
  );
  const familyLocations = useMemo(
    () => getFamilyLocations(familyRecords),
    [familyRecords]
  );

  // ── Cargar ciudad preferida desde preferencias del usuario ──
  useEffect(() => {
    const prefs = loadPrefs();
    if (prefs.prefCity === BOGOTA_CITY) {
      setSelectedCity(BOGOTA_CITY);
      setSelectedLocalidad(prefs.prefLocality || '');
    }
  }, []);

  // Escuchar cambios de preferencias en tiempo real
  useEffect(() => {
    const handler = (e) => {
      const { prefCity, prefLocality } = e.detail || {};
      if (prefCity === BOGOTA_CITY) {
        setSelectedCity(BOGOTA_CITY);
        setSelectedLocalidad(prefLocality || '');
        setSelectedFamilyChip(null);
      }
    };
    window.addEventListener('salud:prefsChanged', handler);
    return () => window.removeEventListener('salud:prefsChanged', handler);
  }, []);

  // Cargar historias clínicas de los familiares para conocer sus ubicaciones
  useEffect(() => {
    if (!token) return;
    fetch('/api/clinical-records/', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : []))
      .then(data => {
        setFamilyRecords(data);
        // Solo auto-detectar si NO hay preferencia guardada
        const prefs = loadPrefs();
        if (!prefs.prefCity && data && data.length > 0 && data[0].city === BOGOTA_CITY) {
          setSelectedCity(BOGOTA_CITY);
          if (data[0].neighborhood) {
            setSelectedLocalidad(data[0].neighborhood);
            setSelectedFamilyChip(data[0].id);
          }
        }
      })
      .catch(() => {});
  }, [token]);


  const applyFilters = list => {
    let result = [...list];

    // Solo perfiles con localidad primaria válida de Bogotá. La cobertura
    // adicional no se usa para crear marcadores ni sustituye esa ubicación.
    const bogotaLocalities = availableLocalidades.map(normalizeLocality);
    result = result.filter(p => {
      const location = normalizeLocality(p.location);
      return bogotaLocalities.includes(location);
    });

    // Filtro por Localidad / Comuna específica
    if (selectedLocalidad) {
      result = result.filter(p => coversLocality(p, selectedLocalidad));
    }

    // Filtro por Género
    if (filters.gender) {
      result = result.filter(p => guessGender(p.full_name) === filters.gender);
    }

    // Filtro por Especialidad
    if (filters.specialty) {
      const term = filters.specialty.toLowerCase();
      result = result.filter(p => {
        const spArr = (p.specialties || []).map(s => s.toLowerCase());
        const spKey = (p.specialty || '').toLowerCase();
        const spLabel = (SPECIALTIES[p.specialty] || '').toLowerCase();
        const spTranslated = (getSpecialtyLabel(p.specialty, lang) || '').toLowerCase();
        return (
          spArr.some(s => s.includes(term)) ||
          spKey.includes(term) ||
          spLabel.includes(term) ||
          spTranslated.includes(term)
        );
      });
    }

    // Experiencia mínima
    if (filters.minExp !== '') {
      result = result.filter(p => Number(p.experience_years || 0) >= Number(filters.minExp));
    }

    // Rango de precios: se incluyen perfiles que coincidan con cualquiera de los rangos marcados.
    if (filters.priceRanges.length > 0) {
      result = result.filter(p => {
        const price = Number(p.hourly_rate || 0);
        return filters.priceRanges.some(rangeId => {
          const range = PRICE_RANGES.find(item => item.id === rangeId);
          return range && price >= range.min && price < range.max;
        });
      });
    }

    // Límites escritos manualmente; se combinan con los rangos seleccionados.
    if (filters.minPrice !== '') {
      result = result.filter(p => Number(p.hourly_rate || 0) >= Number(filters.minPrice));
    }
    if (filters.maxPrice !== '') {
      result = result.filter(p => Number(p.hourly_rate || 0) <= Number(filters.maxPrice));
    }

    // Calificación mínima — usar rating_avg del perfil si está disponible, sino calcular de reviews
    if (filters.minRating !== '') {
      result = result.filter(p => {
        const profileRating = p.rating_avg;
        return p.rating_count > 0 && profileRating != null
          && profileRating >= Number(filters.minRating);
      });
    }

    // Ordenamiento
    result.sort((a, b) => {
      if (filters.sortBy === 'price_asc') return Number(a.hourly_rate || 0) - Number(b.hourly_rate || 0);
      if (filters.sortBy === 'price_desc') return Number(b.hourly_rate || 0) - Number(a.hourly_rate || 0);
      if (filters.sortBy === 'exp') return Number(b.experience_years || 0) - Number(a.experience_years || 0);
      // Default: ordenar por rating_avg del perfil
      const getRating = p => p.rating_count > 0 && p.rating_avg != null ? p.rating_avg : -1;
      return getRating(b) - getRating(a);
    });

    return result;
  };

  const activeFilterCount = Object.entries(filters).filter(([k, v]) =>
    k !== 'sortBy' && (Array.isArray(v) ? v.length > 0 : v !== '')
  )
    .length;

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 12000);
      const [cgRes, nRes] = await Promise.all([
        fetch('/api/caregivers/', { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal }),
        fetch('/api/nurses/', { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal }),
      ]);
      clearTimeout(tid);
      const cgList = cgRes.ok ? await cgRes.json() : [];
      const nList = nRes.ok ? await nRes.json() : [];
      setCaregivers(cgList);
      setDoctors(nList);
    } catch (e) {
      console.error('loadAll error:', e.message);
      setLoadError(e.name === 'AbortError'
        ? 'El servidor tardó demasiado. Verifica que el backend esté activo.'
        : `Error al cargar profesionales: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const buscar = async e => {
    e?.preventDefault();
    const q = searchText.trim();
    if (!q) {
      loadAll();
      return;
    }
    setLoading(true);
    try {
      const locationQuery = selectedLocalidad || selectedCity || '';
      const params = new URLSearchParams({
        search: q,
        ...(locationQuery && { location: locationQuery }),
      });
      const [cgRes, nRes] = await Promise.all([
        fetch(`/api/caregivers/?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/nurses/?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const cgList = cgRes.ok ? await cgRes.json() : [];
      const nList = nRes.ok ? await nRes.json() : [];
      setCaregivers(cgList);
      setDoctors(nList);

      if (cgList.length === 0 && nList.length === 0) {
        const body = { mensaje: q, ...(locationQuery && { localidad: locationQuery }) };
        const semRes = await fetch('/api/chat/local', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        if (semRes.ok) {
          const d = await semRes.json();
          if (d.profesionales && d.profesionales.length > 0) {
            setCaregivers(d.profesionales.filter(p => p.role === 'caregiver'));
            setDoctors(d.profesionales.filter(p => p.role === 'nurse'));
          }
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const [myRequests, setMyRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [ratingBooking, setRatingBooking] = useState(null);
  const [detailProfessional, setDetailProfessional] = useState(null);

  const loadMyRequests = async () => {
    setLoadingRequests(true);
    try {
      const res = await fetch('/api/bookings/my-requests', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setMyRequests(await res.json());
      else setMyRequests([]);
    } catch {
      setMyRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'my-requests') loadMyRequests();
  }, [activeTab]);

  const handleCityChange = city => {
    setSelectedCity(BOGOTA_CITY);
    setSelectedLocalidad('');
    setSelectedFamilyChip(null);
  };

  const handleFamilyChipClick = rec => {
    if (selectedFamilyChip === rec.id) {
    // Toggle off -> toda la zona de cobertura
      setSelectedFamilyChip(null);
      setSelectedCity(BOGOTA_CITY);
      setSelectedLocalidad('');
    } else {
      setSelectedFamilyChip(rec.id);
      setSelectedCity(BOGOTA_CITY);
      setSelectedLocalidad(rec.city === BOGOTA_CITY ? rec.neighborhood || '' : '');
    }
  };

  const clearFilters = () => {
    setSearchText('');
    setSelectedCity(BOGOTA_CITY);
    setSelectedLocalidad('');
    setSelectedFamilyChip(null);
    setFilters(INITIAL_FILTERS);
    loadAll();
  };

  const togglePriceRange = rangeId => {
    setFilters(current => ({
      ...current,
      priceRanges: current.priceRanges.includes(rangeId)
        ? current.priceRanges.filter(id => id !== rangeId)
        : [...current.priceRanges, rangeId],
    }));
  };

  const currentList = applyFilters(activeTab === 'caregivers' ? caregivers : doctors);
  const selCls =
    'h-[38px] pl-3 pr-8 rounded-xl border border-[#c3c6d6] bg-white appearance-none focus:border-[#0040a1] focus:outline-none text-[13px] cursor-pointer w-full';

  const selectedPatientRecord = familyRecords.find(r => r.id === selectedFamilyChip) || null;

  return (
    <div className="flex flex-col h-full">
      {/* ── Cabecera sticky — solo en tabs de búsqueda ── */}
      {activeTab !== 'my-requests' && (
        <div className="px-6 pt-4 pb-3 border-b border-[#c3c6d6]/30 bg-white sticky top-0 z-20 shadow-sm">

          {/* Fila 0: Accesos rápidos según los familiares del usuario */}
          {familyLocations.length > 0 && (
            <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 text-[12px]">
              <span className="text-[11px] font-bold text-[#737785] uppercase tracking-wide shrink-0 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-[#0040a1]">favorite</span>
                {t('geo.myFamilyLocations')}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedFamilyChip(null);
                  setSelectedCity(BOGOTA_CITY);
                  setSelectedLocalidad('');
                }}
                className={`px-3 py-1 rounded-full font-semibold border transition-all shrink-0 ${
                  !selectedFamilyChip
                    ? 'bg-[#0040a1] text-white border-[#0040a1]'
                    : 'bg-[#f3f3f6] text-[#424654] border-transparent hover:border-[#0040a1]/30'
                }`}
              >
                {t('geo.allCities')}
              </button>
              {familyRecords.map(rec => (
                <button
                  key={rec.id}
                  type="button"
                  onClick={() => handleFamilyChipClick(rec)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold border transition-all shrink-0 ${
                    selectedFamilyChip === rec.id
                      ? 'bg-[#0040a1] text-white border-[#0040a1] shadow-sm'
                      : 'bg-[#dae2ff]/40 text-[#0040a1] border-[#0040a1]/20 hover:bg-[#dae2ff]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px]">location_on</span>
                  <span>{rec.patient_name} ({rec.neighborhood ? `${rec.neighborhood}, ` : ''}{rec.city || 'Bogotá'})</span>
                </button>
              ))}
            </div>
          )}

          {/* Fila 1: Buscador de texto libre */}
          <form onSubmit={buscar} className="relative mb-3">
            <input
              className="w-full h-[48px] pl-5 pr-[56px] rounded-2xl border border-[#c3c6d6] bg-white
                              focus:border-[#0040a1] focus:ring-4 focus:ring-[#0040a1]/15 focus:outline-none text-[15px] shadow-sm"
              placeholder={t('search.placeholder')}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
            <button
              type="submit"
              disabled={loading}
              className="absolute right-2 top-2 bottom-2 w-[40px] bg-[#0040a1] text-white rounded-xl flex items-center justify-center hover:bg-[#003080] transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-[20px]">search</span>
            </button>
          </form>

          {/* Fila 2: Cobertura Bogotá + localidades + orden + filtros + vista */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* 1. Ciudad de cobertura fija */}
            <div className="relative flex-1 min-w-[160px] max-w-[210px]">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#0040a1] text-[17px] pointer-events-none">
                location_city
              </span>
              <div className="w-full h-[38px] pl-8 pr-3 rounded-xl border border-[#c3c6d6] bg-[#f3f3f6] text-[#424654] text-[13px] font-semibold flex items-center">
                {BOGOTA_CITY}
              </div>
            </div>

            {/* 2. Selector Dinámico de Localidad / Comuna (según la Ciudad seleccionada) */}
            <div className="relative flex-1 min-w-[170px] max-w-[230px]">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#0040a1]/70 text-[17px] pointer-events-none">
                pin_drop
              </span>
              <select
                className="w-full h-[38px] pl-8 pr-7 rounded-xl border border-[#c3c6d6] bg-white appearance-none focus:border-[#0040a1] focus:outline-none text-[13px] font-medium cursor-pointer disabled:bg-[#f3f3f6] disabled:text-[#737785]"
                value={selectedLocalidad}
                onChange={e => {
                  setSelectedLocalidad(e.target.value);
                  setSelectedFamilyChip(null);
                }}
              >
                <option value="">
                  {t('geo.allLocalities')}
                </option>
                {availableLocalidades.map(l => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#737785] text-[17px]">
                expand_more
              </span>
            </div>

            {/* 3. Ordenar por */}
            <div className="relative min-w-[140px] max-w-[170px]">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#0040a1]/60 text-[17px] pointer-events-none">
                sort
              </span>
              <select
                className="w-full h-[38px] pl-8 pr-7 rounded-xl border border-[#c3c6d6] bg-white appearance-none focus:border-[#0040a1] focus:outline-none text-[13px] cursor-pointer"
                value={filters.sortBy}
                onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value }))}
              >
                <option value="rating">{t('search.sortRating')}</option>
                <option value="price_asc">{t('search.sortPriceAsc')}</option>
                <option value="price_desc">{t('search.sortPriceDesc')}</option>
                <option value="exp">{t('search.sortExp')}</option>
              </select>
              <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#737785] text-[17px]">
                expand_more
              </span>
            </div>

            {/* 4. Botón Filtros Avanzados */}
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`h-[38px] px-3.5 rounded-xl font-semibold text-[13px] flex items-center gap-1.5 transition-all border shrink-0
                ${
                  showFilters
                    ? 'bg-[#0040a1] text-white border-[#0040a1]'
                    : 'bg-white text-[#424654] border-[#c3c6d6] hover:border-[#0040a1]/40'
                }`}
            >
              <span className="material-symbols-outlined text-[17px]">tune</span>
              {t('search.filters')}
              {activeFilterCount > 0 && (
                <span
                  className={`text-[11px] font-bold w-4 h-4 rounded-full flex items-center justify-center
                  ${showFilters ? 'bg-white text-[#0040a1]' : 'bg-[#0040a1] text-white'}`}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* 5. Switcher Vista Lista vs Mapa */}
            <div className="flex bg-[#f3f3f6] p-0.5 rounded-xl border border-[#c3c6d6]/60 shrink-0 ml-auto">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
                  viewMode === 'list'
                    ? 'bg-white text-[#0040a1] shadow-sm font-bold'
                    : 'text-[#424654] hover:text-[#0040a1]'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">grid_view</span>
                {t('geo.viewList')}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
                  viewMode === 'map'
                    ? 'bg-[#0040a1] text-white shadow-sm font-bold'
                    : 'text-[#424654] hover:text-[#0040a1]'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">map</span>
                {t('geo.viewMap')}
              </button>
            </div>
          </div>

          {/* Panel de filtros expandible */}
          {showFilters && (
            <div className="mt-3 p-4 bg-[#f3f3f6] rounded-2xl border border-[#c3c6d6]/40">
              <div className="flex justify-end mb-3">
                <button
                  type="button"
                  onClick={clearFilters}
                  disabled={!searchText && !selectedLocalidad && !selectedFamilyChip && activeFilterCount === 0 && filters.sortBy === 'rating'}
                  className="h-[34px] px-3 rounded-xl border border-[#0040a1]/30 bg-white text-[#0040a1] text-[12px] font-semibold flex items-center gap-1.5 transition-all hover:bg-[#dae2ff]/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>
                  {t('search.clearFilters')}
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Género */}
                <div>
                  <label className="block text-[11px] font-bold text-[#424654] mb-1.5 uppercase tracking-wide">
                    {t('search.gender')}
                  </label>
                  <div className="flex gap-2">
                    {[
                      ['', t('search.all')],
                      ['F', t('search.woman')],
                      ['M', t('search.man')],
                    ].map(([v, lbl]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFilters(f => ({ ...f, gender: v }))}
                        className={`flex-1 h-[34px] rounded-xl text-[12px] font-semibold border transition-all
                          ${
                            filters.gender === v
                              ? 'bg-[#0040a1] text-white border-[#0040a1]'
                              : 'bg-white text-[#424654] border-[#c3c6d6] hover:border-[#0040a1]/40'
                          }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Especialidad */}
                <div>
                  <label className="block text-[11px] font-bold text-[#424654] mb-1.5 uppercase tracking-wide">
                    {t('search.specialty')}
                  </label>
                  {activeTab === 'nurses' ? (
                    <div className="relative">
                      <select
                        className={selCls}
                        value={filters.specialty}
                        onChange={e => setFilters(f => ({ ...f, specialty: e.target.value }))}
                      >
                        <option value="">{t('search.allSpecialties')}</option>
                        {SPECIALTIES_KEYS.map(k => (
                          <option key={k} value={k}>
                            {getSpecialtyLabel(k, lang)}
                          </option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#737785] text-[17px]">
                        expand_more
                      </span>
                    </div>
                  ) : (
                    <input
                      className="w-full h-[38px] px-3 rounded-xl border border-[#c3c6d6] bg-white focus:border-[#0040a1] focus:outline-none text-[13px]"
                      placeholder={t('search.specialty_placeholder')}
                      value={filters.specialty}
                      onChange={e => setFilters(f => ({ ...f, specialty: e.target.value }))}
                    />
                  )}
                </div>

                {/* Experiencia mínima */}
                <div>
                  <label className="block text-[11px] font-bold text-[#424654] mb-1.5 uppercase tracking-wide">
                    {t('search.minExp')}
                  </label>
                  <div className="relative">
                    <select
                      className={selCls}
                      value={filters.minExp}
                      onChange={e => setFilters(f => ({ ...f, minExp: e.target.value }))}
                    >
                      <option value="">{t('search.anyExp')}</option>
                      {[1, 2, 3, 5, 8, 10, 15].map(y => (
                        <option key={y} value={y}>
                          {t('search.yearsMin', { n: y })}
                        </option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#737785] text-[17px]">
                      expand_more
                    </span>
                  </div>
                </div>

                {/* Calificación mínima */}
                <div>
                  <label className="block text-[11px] font-bold text-[#424654] mb-1.5 uppercase tracking-wide">
                    {t('search.rating')}
                  </label>
                  <div className="flex gap-1">
                    {['', '3', '4', '5'].map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFilters(f => ({ ...f, minRating: v }))}
                        className={`flex-1 h-[34px] rounded-xl text-[12px] font-semibold border transition-all flex items-center justify-center gap-0.5 ${
                          filters.minRating === v
                            ? 'bg-amber-400 text-white border-amber-400'
                            : 'bg-white text-[#424654] border-[#c3c6d6] hover:border-amber-300'
                        }`}
                      >
                        {v === '' ? (
                          t('search.allRatings')
                        ) : (
                          <>
                            <span className="text-[11px]">★</span>
                            {v}+
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rango de precios */}
                <div className="col-span-2 md:col-span-4">
                  <label className="block text-[11px] font-bold text-[#424654] mb-1.5 uppercase tracking-wide">
                    {t('search.priceRange')}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PRICE_RANGES.map(range => (
                      <label
                        key={range.id}
                        className="flex items-center gap-2 rounded-xl border border-[#c3c6d6] bg-white px-3 py-2 text-[13px] text-[#424654] cursor-pointer hover:border-[#0040a1]/50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={filters.priceRanges.includes(range.id)}
                          onChange={() => togglePriceRange(range.id)}
                          className="h-4 w-4 accent-[#0040a1]"
                        />
                        {t(range.label)}
                      </label>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <div>
                      <label htmlFor="min-price" className="block text-[11px] font-semibold text-[#424654] mb-1">
                        {t('search.minPrice')}
                      </label>
                      <input
                        id="min-price"
                        type="number"
                        min="0"
                        step="1000"
                        inputMode="numeric"
                        placeholder={t('search.pricePlaceholder')}
                        value={filters.minPrice}
                        onChange={e => setFilters(current => ({ ...current, minPrice: e.target.value }))}
                        className="w-full h-[38px] px-3 rounded-xl border border-[#c3c6d6] bg-white focus:border-[#0040a1] focus:outline-none text-[13px]"
                      />
                    </div>
                    <div>
                      <label htmlFor="max-price" className="block text-[11px] font-semibold text-[#424654] mb-1">
                        {t('search.maxPrice')}
                      </label>
                      <input
                        id="max-price"
                        type="number"
                        min="0"
                        step="1000"
                        inputMode="numeric"
                        placeholder={t('search.pricePlaceholder')}
                        value={filters.maxPrice}
                        onChange={e => setFilters(current => ({ ...current, maxPrice: e.target.value }))}
                        className="w-full h-[38px] px-3 rounded-xl border border-[#c3c6d6] bg-white focus:border-[#0040a1] focus:outline-none text-[13px]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Contenido Principal (Lista / Mapa / Mis Solicitudes) ── */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#f3f3f6]/50">
        {loading && activeTab !== 'my-requests' && (
          <div className="flex flex-col items-center py-16 text-[#424654]">
            <Spinner />
            <p className="mt-3 text-[15px]">{t('search.searching')}</p>
          </div>
        )}

        {!loading && loadError && activeTab !== 'my-requests' && (
          <div className="flex flex-col items-center py-16 text-center max-w-md mx-auto">
            <span className="material-symbols-outlined text-[48px] text-red-400 mb-3">wifi_off</span>
            <p className="text-[15px] font-semibold text-[#424654]">No se pudo cargar la lista</p>
            <p className="text-[13px] text-[#737785] mt-1 mb-4">{loadError}</p>
            <button
              onClick={loadAll}
              className="h-[38px] px-5 bg-[#0040a1] text-white rounded-xl text-[13px] font-bold hover:bg-[#003080] transition-all"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* ── Mis Solicitudes ── */}
        {activeTab === 'my-requests' && (
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[18px] font-bold text-[#1a1c1e] flex items-center gap-2">
                <span className="material-symbols-outlined text-[22px] text-[#0040a1]">
                  assignment
                </span>
                {t('myRequests.title')}
              </h2>
              <button
                onClick={loadMyRequests}
                className="text-[13px] text-[#0040a1] font-semibold flex items-center gap-1 hover:underline"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span> {t('myRequests.refresh')}
              </button>
            </div>

            {loadingRequests && (
              <div className="flex flex-col items-center py-16">
                <Spinner />
                <p className="mt-3 text-[15px] text-[#424654]">{t('myRequests.loading')}</p>
              </div>
            )}

            {!loadingRequests && myRequests.length === 0 && (
              <div className="flex flex-col items-center py-16 text-[#424654]">
                <span className="material-symbols-outlined text-[52px] text-[#c3c6d6] mb-3">
                  assignment
                </span>
                <p className="text-[16px] font-semibold">{t('myRequests.empty')}</p>
                <p className="text-[13px] text-[#737785] mt-1">
                  {t('myRequests.emptyHint')}
                </p>
              </div>
            )}

            {!loadingRequests && myRequests.length > 0 && (
              <div className="flex flex-col gap-4">
                {myRequests.map(b => {
                  const statusCfg = {
                    pending: {
                      label: t('bookingStatus.pending'),
                      bgCls: 'bg-amber-100',
                      textCls: 'text-amber-700',
                      icon: 'schedule',
                    },
                    approved: {
                      label: t('bookingStatus.approved'),
                      bgCls: 'bg-green-100',
                      textCls: 'text-green-700',
                      icon: 'check_circle',
                    },
                    rejected: {
                      label: t('bookingStatus.rejected'),
                      bgCls: 'bg-red-100',
                      textCls: 'text-red-700',
                      icon: 'cancel',
                    },
                    completed: {
                      label: t('bookingStatus.completed'),
                      bgCls: 'bg-blue-100',
                      textCls: 'text-blue-700',
                      icon: 'task_alt',
                    },
                    cancelled: {
                      label: t('bookingStatus.cancelled'),
                      bgCls: 'bg-gray-100',
                      textCls: 'text-gray-600',
                      icon: 'block',
                    },
                  }[b.status] || {
                    label: b.status,
                    bgCls: 'bg-gray-100',
                    textCls: 'text-gray-600',
                    icon: 'info',
                  };

                  return (
                    <div
                      key={b.id}
                      className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-4 flex flex-col gap-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailProfessional({
                            user_id: b.professional_user_id, full_name: b.professional_name,
                            photo_url: b.professional_photo_url, role: b.professional_role,
                            experience_years: b.professional_experience_years, specialties: b.professional_specialties,
                            specialty: b.professional_specialty, institution: b.professional_institution,
                            hourly_rate: b.professional_hourly_rate, location: b.professional_location,
                            bio: b.professional_bio, rating_avg: b.professional_rating_avg,
                            rating_count: b.professional_rating_count,
                          })}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left group"
                        >
                          {b.professional_photo_url ? (
                            <img src={getAssetUrl(b.professional_photo_url)} alt={b.professional_name} className="w-11 h-11 rounded-xl object-cover shrink-0" />
                          ) : (
                            <div className="w-11 h-11 rounded-xl bg-[#0040a1] text-white flex items-center justify-center font-bold shrink-0">
                              {(b.professional_name || '?').split(' ').map(name => name[0]).slice(0, 2).join('').toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                          <p className="font-bold text-[15px] text-[#1a1c1e]">
                            {b.professional_name || '—'}
                          </p>
                          <p className="text-[12px] text-[#424654] mt-0.5 capitalize">
                            {b.professional_role === 'caregiver'
                              ? t('myRequests.caregiver')
                              : t('myRequests.nurse_role')}
                            {b.professional_location && ` · ${b.professional_location}`}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            {b.professional_rating_count > 0 && b.professional_rating_avg != null ? (
                              <>
                                <StarRating value={b.professional_rating_avg} readOnly size="sm" />
                                <span className="text-[11px] font-bold text-amber-600">{Number(b.professional_rating_avg).toFixed(1)}</span>
                                <span className="text-[11px] text-[#737785]">({b.professional_rating_count})</span>
                              </>
                            ) : (
                              <span className="text-[11px] text-[#737785]">Sin valoraciones</span>
                            )}
                          </div>
                          </div>
                          <span className="material-symbols-outlined text-[#0040a1] text-[19px] group-hover:translate-x-0.5 transition-transform">chevron_right</span>
                        </button>
                        <span
                          className={`flex items-center gap-1 text-[12px] font-bold px-2.5 py-1 rounded-full shrink-0 ${statusCfg.bgCls} ${statusCfg.textCls}`}
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {statusCfg.icon}
                          </span>
                          {statusCfg.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-[13px] text-[#424654] bg-[#f9f9fc] rounded-xl px-4 py-2.5 border border-[#c3c6d6]/30">
                        <span className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-[#0040a1]/60">
                            calendar_today
                          </span>
                          {b.date}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-[#0040a1]/60">
                            schedule
                          </span>
                          {String(b.start_hour).padStart(2, '0')}:00 —{' '}
                          {String(b.end_hour).padStart(2, '0')}:00
                        </span>
                      </div>
                      {b.notes && (
                        <p className="text-[13px] text-[#424654] bg-[#f9f9fc] rounded-xl px-4 py-2.5 border border-[#c3c6d6]/30 italic">
                          "{b.notes}"
                        </p>
                      )}
                      {b.rejection_reason && (
                        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                          <span className="material-symbols-outlined text-red-500 text-[16px] mt-0.5 shrink-0">
                            info
                          </span>
                          <div>
                            <p className="text-[10px] font-bold text-red-500 uppercase">
                              {t('myRequests.rejectionReason')}
                            </p>
                            <p className="text-[12px] text-red-700">{b.rejection_reason}</p>
                          </div>
                        </div>
                      )}
                      {b.status === 'approved' && <button onClick={() => setCancellationBooking(b)} className="h-[34px] px-4 bg-red-600 text-white rounded-xl text-[12px] font-semibold hover:bg-red-700 transition-all flex items-center gap-1.5"><span className="material-symbols-outlined text-[15px]">event_busy</span>Cancelar servicio</button>}
                      {b.status === 'cancelled' && <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] text-[#424654]"><b>Cancelado por:</b> {b.cancelled_by_name || '—'}{b.cancellation_reason && <><br /><b>Motivo:</b> {b.cancellation_reason}</>}</div>}
                      {b.status === 'cancelled' && b.cancelled_comments?.length > 0 && <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-[#424654]"><b>Comentarios de servicios cancelados</b>{b.cancelled_comments.map(comment => <p key={comment.id} className="mt-1.5"><span className="font-semibold">{comment.author_role === 'family' ? 'Familia' : 'Profesional'}:</span> {comment.comment}</p>)}</div>}
                      {b.status === 'cancelled' && !b.cancelled_comment_by_current_user && <button type="button" onClick={() => setCancelledCommentBooking(b)} className="h-[34px] px-4 bg-[#0040a1] text-white rounded-xl text-[12px] font-semibold hover:bg-[#003080] transition-all flex items-center gap-1.5"><span className="material-symbols-outlined text-[15px]">forum</span>Comentar experiencia</button>}
                      {b.status === 'cancelled' && b.cancelled_comment_by_current_user && <div className="flex items-center gap-1.5 text-[12px] text-green-700 font-semibold"><span className="material-symbols-outlined text-[15px]">check_circle</span>Comentario registrado</div>}
                      {b.status === 'completed' && (
                        <div className="pt-3 border-t border-[#c3c6d6]/30">
                          {b.reviewed_by_family ? (
                            <div className="flex items-center gap-1.5 text-[12px] text-green-700 font-semibold">
                              <span className="material-symbols-outlined text-[16px]">check_circle</span>
                              {t('myRequests.alreadyRated')}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setRatingBooking(b)}
                              className="h-[38px] px-4 bg-amber-500 text-white rounded-xl text-[12px] font-bold hover:bg-amber-600 transition-all flex items-center gap-1.5 shadow-sm"
                            >
                              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                              {t('myRequests.rateProfessional')}
                            </button>
                          )}
                        </div>
                      )}
                      {b.status === 'approved' && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setChatBooking(b)}
                            className="h-[38px] px-4 bg-[#0040a1] text-white rounded-xl text-[12px] font-bold hover:bg-[#003080] transition-all flex items-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-[16px]">forum</span>
                            Chat del servicio
                          </button>
                          <button
                            type="button"
                            onClick={() => setCarePlanBooking(b)}
                            className="h-[38px] px-4 bg-[#f0f4ff] text-[#0040a1] border border-[#0040a1]/30 rounded-xl text-[12px] font-bold hover:bg-[#dae2ff] transition-all flex items-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-[16px]">health_and_safety</span>
                            Plan asistencial
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Vista de Mapa Interactivo ── */}
        {!loading && activeTab !== 'my-requests' && viewMode === 'map' && (
          <div className="max-w-6xl mx-auto flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 p-4 shadow-sm flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[16px] text-[#0040a1] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px]">map</span>
                  {BOGOTA_CITY} — {selectedLocalidad || t('geo.allLocalities')}
                </h3>
                <p className="text-[12px] text-[#737785] mt-0.5">
                  {currentList.length} {t('geo.professionalsInArea')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="h-[36px] px-4 bg-[#f3f3f6] text-[#0040a1] rounded-xl font-semibold text-[12px] hover:bg-[#dae2ff] transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">view_agenda</span>
                {t('geo.viewList')}
              </button>
            </div>

            <GoogleMap
              city={BOGOTA_CITY}
              localidad={selectedLocalidad}
              professionals={currentList}
              patientLocation={selectedPatientRecord ? {
                patient_name: selectedPatientRecord.patient_name,
                fullLocation: `${selectedPatientRecord.neighborhood || ''}, ${selectedPatientRecord.city || ''}`
              } : null}
              onSelectProfessional={prof => setBookingModalProf(prof)}
            />
          </div>
        )}

        {/* ── Vista de Lista / Grid ── */}
        {!loading && activeTab !== 'my-requests' && viewMode === 'list' && (
          <>
            {currentList.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-[#424654]">
                <span className="material-symbols-outlined text-[52px] text-[#c3c6d6] mb-3">
                  {activeTab === 'caregivers' ? 'group' : 'medical_services'}
                </span>
                <p className="text-[16px] font-semibold">
                  {activeTab === 'caregivers'
                    ? t('search.noCaregivers')
                    : t('search.noNurses')}
                </p>
                {selectedCity && (
                  <p className="text-[13px] text-[#737785] mt-1">
                    En {selectedLocalidad ? `${selectedLocalidad}, ${selectedCity}` : selectedCity}
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {activeTab === 'caregivers'
                  ? currentList.map((cg, i) => (
                      <CaregiverCard
                        key={cg.user_id || i}
                        caregiver={cg}
                        index={i}
                        reviews={[]}
                        ratingAvg={cg.rating_avg}
                        ratingCount={cg.rating_count ?? 0}
                        token={token}
                      />
                    ))
                  : currentList.map((d, i) => (
                      <NurseCard
                        key={d.user_id || i}
                        doctor={d}
                        index={i}
                        reviews={[]}
                        ratingAvg={d.rating_avg}
                        ratingCount={d.rating_count ?? 0}
                        token={token}
                      />
                    ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de reserva cuando se interactúa desde el mapa */}
      {bookingModalProf && (
        <BookingModal
          professional={{
            user_id: bookingModalProf.user_id || bookingModalProf.id,
            role: bookingModalProf.role,
            name: bookingModalProf.full_name,
            specialty: bookingModalProf.specialty || (bookingModalProf.specialties || []).join(', '),
            price: bookingModalProf.hourly_rate,
            priceUnit: '/h',
            location: bookingModalProf.location,
          }}
          token={token}
          onClose={() => setBookingModalProf(null)}
          onSuccess={() => {
            setBookingModalProf(null);
            if (activeTab === 'my-requests') loadMyRequests();
          }}
        />
      )}
      {ratingBooking && (
        <RateServiceModal
          booking={ratingBooking}
          token={token}
          role="family"
          onClose={() => setRatingBooking(null)}
          onSuccess={() => {
            setMyRequests(current => current.map(request => (
              request.id === ratingBooking.id ? { ...request, reviewed_by_family: true } : request
            )));
            setRatingBooking(null);
            loadMyRequests();
          }}
        />
      )}
      {cancellationBooking && <CancelServiceModal booking={cancellationBooking} token={token} onClose={() => setCancellationBooking(null)} onSuccess={updated => { setMyRequests(current => current.map(item => item.id === updated.id ? { ...item, ...updated } : item)); setCancellationBooking(null); }} />}
      {cancelledCommentBooking && <CancelledServiceCommentModal booking={cancelledCommentBooking} token={token} onClose={() => setCancelledCommentBooking(null)} onSuccess={async () => { setCancelledCommentBooking(null); await loadMyRequests(); }} />}
      {chatBooking && <ServiceChatModal booking={chatBooking} user={user} token={token} onClose={() => setChatBooking(null)} />}
      {carePlanBooking && <ServiceCarePlanModal booking={carePlanBooking} user={user} token={token} onClose={() => setCarePlanBooking(null)} />}
      {detailProfessional && (
        <ProfessionalDetailModal
          professional={detailProfessional}
          token={token}
          onClose={() => setDetailProfessional(null)}
        />
      )}
    </div>
  );
}
