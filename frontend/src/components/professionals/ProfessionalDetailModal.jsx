import { useState, useEffect, useRef } from 'react';
import { useLang } from '../../contexts/LangContext';
import BookingModal from '../bookings/BookingModal';
import StarRating from '../common/StarRating';
import { getAssetUrl, getRoleLabel, getSpecialtyLabel } from '../../utils/helpers';
import { getCityCoords, getLocalidadCoords } from '../../constants/colombiaGeo';

// Inyectar CSS de Leaflet una sola vez
if (typeof document !== 'undefined' && !document.getElementById('leaflet-css')) {
  const link = document.createElement('link');
  link.id = 'leaflet-css';
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
}

// ── Mini-mapa de ubicación del profesional ───────────────────
function ProfessionalMiniMap({ location, name, role }) {
  const mapRef        = useRef(null);
  const instanceRef   = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    import('leaflet').then(({ default: L }) => {
      if (cancelled || !mapRef.current) return;

      // Parsear la ubicación: "Localidad, Ciudad" o "Ciudad"
      let city = 'Bogotá D.C.';
      let localidad = '';
      if (location) {
        const parts = location.split(',').map(s => s.trim());
        if (parts.length >= 2) { localidad = parts[0]; city = parts[1]; }
        else { city = parts[0]; }
      }

      const coords = localidad
        ? getLocalidadCoords(city, localidad)
        : getCityCoords(city);

      // Destruir instancia previa si existe
      if (instanceRef.current) {
        instanceRef.current.remove();
        instanceRef.current = null;
      }

      const map = L.map(mapRef.current, {
        center: [coords.lat, coords.lng],
        zoom: localidad ? 14 : 12,
        zoomControl: true,
        scrollWheelZoom: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      // Marker del profesional
      const color  = role === 'nurse' ? '#006a61' : '#0040a1';
      const symbol = role === 'nurse' ? '✚' : '👤';
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
          <ellipse cx="18" cy="42" rx="7" ry="3" fill="rgba(0,0,0,0.2)"/>
          <path d="M18 2C9 2 2 9 2 18C2 30 18 42 18 42C18 42 34 30 34 18C34 9 27 2 18 2Z"
            fill="${color}" stroke="white" stroke-width="2.5"/>
          <text x="18" y="23" text-anchor="middle" font-family="sans-serif"
            font-size="13" fill="white" font-weight="bold">${symbol}</text>
        </svg>`;

      const icon = L.divIcon({
        html: svg,
        iconSize: [36, 44],
        iconAnchor: [18, 44],
        popupAnchor: [0, -46],
        className: '',
      });

      const displayName = name || 'Profesional';
      L.marker([coords.lat, coords.lng], { icon })
        .addTo(map)
        .bindPopup(
          `<div style="font-family:sans-serif;min-width:130px;">
            <strong style="color:${color};font-size:13px;">${displayName}</strong><br/>
            <span style="font-size:11px;color:#4b5563;">${location || city}</span>
          </div>`,
          { maxWidth: 200 }
        )
        .openPopup();

      instanceRef.current = map;
      setReady(true);
    });

    return () => {
      cancelled = true;
      if (instanceRef.current) {
        instanceRef.current.remove();
        instanceRef.current = null;
      }
    };
  }, [location, name, role]);

  return (
    <div className="relative w-full h-[200px] rounded-2xl overflow-hidden border border-[#c3c6d6]/40 shadow-sm bg-[#e8effc]">
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#f0f4fd]">
          <div className="flex flex-col items-center gap-2 text-[#0040a1]">
            <span className="material-symbols-outlined text-[32px] animate-spin"
              style={{ animationDuration: '1.2s' }}>explore</span>
            <span className="text-[12px] font-semibold">Cargando mapa…</span>
          </div>
        </div>
      )}
      {/* Badge de ubicación */}
      {ready && location && (
        <div className="absolute bottom-2 left-2 z-[999] bg-white/95 backdrop-blur-sm px-2.5 py-1
          rounded-xl border border-[#c3c6d6]/50 shadow text-[11px] font-semibold text-[#0040a1]
          flex items-center gap-1 pointer-events-none">
          <span className="material-symbols-outlined text-[13px]">location_on</span>
          {location}
        </div>
      )}
    </div>
  );
}

// ─── ProfessionalDetailModal ──────────────────────────────────
export default function ProfessionalDetailModal({ professional, token, reviews = [], onClose }) {
  const { t, lang } = useLang();
  const [showBooking, setShowBooking] = useState(false);
  const [activeTab, setActiveTab]     = useState('info'); // 'info' | 'map' | 'reviews'

  const initials = (professional.full_name || '?')
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const avgRating = professional.rating_avg != null
    ? Number(professional.rating_avg)
    : reviews.length
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : 5.0;

  const ratingCount = professional.rating_count ?? reviews.length;

  return (
    <>
      {/* Overlay a pantalla completa, centrado con padding que respeta la TopBar */}
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        style={{ background: 'rgba(10,15,30,0.70)', backdropFilter: 'blur(8px)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        {/*
          El modal ocupa como máximo el 90% de la altura visible menos padding.
          overflow-hidden en el wrapper + flex flex-col garantiza que
          el footer NUNCA se va de la pantalla.
        */}
        <div
          className="bg-white rounded-2xl shadow-2xl w-full flex flex-col"
          style={{
            maxWidth: 560,
            height: 'calc(100vh - 80px)',
            maxHeight: 700,
          }}
        >
          {/* ── Hero — compacto para no comerse el espacio vertical ── */}
          <div className="relative bg-gradient-to-br from-[#0040a1] to-[#0056d2] px-5 py-4 flex items-center gap-4 shrink-0">
            <button onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25 transition-all z-10">
              <span className="material-symbols-outlined text-white text-[19px]">close</span>
            </button>

            {professional.photo_url ? (
              <img src={getAssetUrl(professional.photo_url)} alt={professional.full_name}
                className="w-[56px] h-[56px] rounded-xl object-cover border-2 border-white/30 shadow-lg shrink-0" />
            ) : (
              <div className="w-[56px] h-[56px] rounded-xl bg-white/20 text-white flex items-center justify-center text-xl font-bold shrink-0 border-2 border-white/30">
                {initials}
              </div>
            )}

            <div className="flex-1 min-w-0 pr-8">
              <h2 className="text-white font-bold text-[17px] leading-tight truncate">
                {professional.full_name}
              </h2>
              <p className="text-white/70 text-[11px] mt-0.5 truncate">
                {getRoleLabel(professional.role, lang)}
                {professional.location && ` · ${professional.location}`}
              </p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-white font-bold text-[18px]">
                  ${Number(professional.hourly_rate || 0).toLocaleString('es-CO')}
                  <span className="text-[11px] font-normal text-white/60 ml-1">{t('professional.perHour')}</span>
                </span>
                <div className="flex items-center gap-1 bg-amber-400/20 border border-amber-300/30 rounded-lg px-2 py-0.5">
                  <StarRating value={avgRating} readOnly size="sm" />
                  <span className="text-amber-200 font-bold text-[12px] ml-0.5">{avgRating.toFixed(1)}</span>
                  <span className="text-amber-300/70 text-[10px]">({ratingCount})</span>
                </div>
                {professional.similitud && (
                  <span className="text-[10px] bg-[#8df1e3]/20 text-[#8df1e3] border border-[#8df1e3]/30 px-2 py-0.5 rounded-lg font-semibold">
                    {Math.round(professional.similitud * 100)}{t('professional.compatibility')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Tabs: Info / Ubicación / Reseñas ── */}
          <div className="flex border-b border-[#c3c6d6]/40 bg-[#f9f9fc] shrink-0">
            {[
              { id: 'info',    icon: 'person',      label: 'Perfil'    },
              { id: 'map',     icon: 'location_on', label: 'Ubicación' },
              { id: 'reviews', icon: 'star',        label: `Reseñas${reviews.length > 0 ? ` (${reviews.length})` : ''}` },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[12px] font-semibold border-b-2 transition-all ${
                  activeTab === tab.id
                    ? 'border-[#0040a1] text-[#0040a1] bg-white'
                    : 'border-transparent text-[#737785] hover:text-[#424654]'
                }`}>
                <span className="material-symbols-outlined text-[15px]"
                  style={tab.id === 'reviews' ? { fontVariationSettings: "'FILL' 1" } : {}}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Cuerpo scrolleable ── */}
          <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#c3c6d6 transparent' }}>

            {/* ── TAB: PERFIL ── */}
            {activeTab === 'info' && (
              <div className="p-5 flex flex-col gap-4">
                {/* Experiencia */}
                <div className="flex items-center gap-3 bg-[#f3f3f6] rounded-xl px-4 py-3 border border-[#c3c6d6]/30">
                  <span className="material-symbols-outlined text-[#0040a1]/60 text-[22px]">schedule</span>
                  <div>
                    <p className="text-[10px] font-bold text-[#737785] uppercase tracking-wide">{t('professional.experience')}</p>
                    <p className="text-[15px] font-semibold text-[#1a1c1e]">{professional.experience_years} {t('professional.years')}</p>
                  </div>
                </div>

                {/* Institución */}
                {professional.institution && (
                  <div className="flex items-center gap-3 bg-[#f3f3f6] rounded-xl px-4 py-3 border border-[#c3c6d6]/30">
                    <span className="material-symbols-outlined text-[#0040a1]/60 text-[22px]">local_hospital</span>
                    <div>
                      <p className="text-[10px] font-bold text-[#737785] uppercase tracking-wide">Institución</p>
                      <p className="text-[15px] font-semibold text-[#1a1c1e]">{professional.institution}</p>
                    </div>
                  </div>
                )}

                {/* Especialidades */}
                {((professional.specialties || []).length > 0 || professional.specialty) && (
                  <div>
                    <p className="text-[10px] font-bold text-[#737785] uppercase tracking-wide mb-2">{t('search.specialty')}</p>
                    <div className="flex flex-wrap gap-2">
                      {(professional.specialties || (professional.specialty ? [professional.specialty] : [])).map((s, i) => (
                        <span key={i} className="bg-[#dae2ff] text-[#0040a1] text-[12px] font-semibold px-3 py-1 rounded-full">
                          {getSpecialtyLabel(s, lang) || s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bio */}
                {professional.bio && (
                  <div>
                    <p className="text-[10px] font-bold text-[#737785] uppercase tracking-wide mb-2">{t('professional.aboutMe')}</p>
                    <p className="text-[13px] text-[#424654] leading-relaxed bg-[#f9f9fc] rounded-xl p-4 border border-[#c3c6d6]/30">
                      {professional.bio}
                    </p>
                  </div>
                )}

                {/* Cta rápida al mapa si hay ubicación */}
                {professional.location && (
                  <button onClick={() => setActiveTab('map')}
                    className="flex items-center gap-2 text-[12px] font-semibold text-[#0040a1] hover:underline">
                    <span className="material-symbols-outlined text-[15px]">location_on</span>
                    Ver en el mapa → {professional.location}
                  </button>
                )}
              </div>
            )}

            {/* ── TAB: MAPA ── */}
            {activeTab === 'map' && (
              <div className="p-5 flex flex-col gap-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-[#0040a1] text-[20px]">location_on</span>
                  <div>
                    <p className="text-[14px] font-bold text-[#1a1c1e]">Ubicación del profesional</p>
                    <p className="text-[12px] text-[#737785]">{professional.location || 'Ubicación no especificada'}</p>
                  </div>
                </div>
                <ProfessionalMiniMap
                  location={professional.location}
                  name={professional.full_name}
                  role={professional.role}
                />
                <p className="text-[11px] text-[#737785] text-center">
                  La ubicación corresponde a la zona donde opera el profesional, no a una dirección exacta.
                </p>
              </div>
            )}

            {/* ── TAB: RESEÑAS ── */}
            {activeTab === 'reviews' && (
              <div className="p-5 flex flex-col gap-3">
                {/* Resumen de rating */}
                <div className="bg-gradient-to-r from-amber-50 to-amber-100/40 border border-amber-200/60 rounded-2xl px-5 py-4 flex items-center gap-4">
                  <div className="text-[42px] font-black text-amber-500 leading-none">{avgRating.toFixed(1)}</div>
                  <div>
                    <StarRating value={avgRating} readOnly size="md" />
                    <p className="text-[11px] text-[#737785] mt-0.5">
                      {ratingCount} {ratingCount === 1 ? 'calificación' : 'calificaciones'}
                    </p>
                  </div>
                </div>

                {reviews.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-center">
                    <span className="material-symbols-outlined text-[40px] text-[#c3c6d6] mb-2"
                      style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                    <p className="text-[14px] font-semibold text-[#424654]">Sin reseñas todavía</p>
                    <p className="text-[12px] text-[#737785] mt-1">Las reseñas aparecen tras completar un servicio</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {reviews.map((r, i) => (
                      <div key={i} className="bg-[#f9f9fc] rounded-xl p-3.5 border border-[#c3c6d6]/30">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[13px] font-semibold text-[#1a1c1e]">
                            {r.family_name || t('roles.family')}
                          </span>
                          <StarRating value={r.rating} readOnly size="sm" />
                        </div>
                        {r.comment && (
                          <p className="text-[13px] text-[#424654] leading-relaxed">{r.comment}</p>
                        )}
                        {r.created_at && (
                          <p className="text-[10px] text-[#737785] mt-1.5">
                            {new Date(r.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Footer — siempre visible, nunca scrolleable ── */}
          <div className="px-4 py-3 border-t border-[#c3c6d6]/30 bg-white rounded-b-2xl flex gap-3 shrink-0">
            <button onClick={onClose}
              className="flex-1 h-[42px] border border-[#c3c6d6] text-[#424654] rounded-xl font-semibold text-[13px] hover:bg-[#f3f3f6] transition-all">
              {t('professional.close')}
            </button>
            <button onClick={() => setShowBooking(true)}
              className="flex-1 h-[42px] bg-[#0040a1] text-white rounded-xl font-bold text-[13px] hover:bg-[#003080] transition-all flex items-center justify-center gap-2 shadow-md">
              <span className="material-symbols-outlined text-[17px]">calendar_add_on</span>
              {t('professional.requestService')}
            </button>
          </div>
        </div>
      </div>

      {showBooking && (
        <BookingModal
          professional={{
            user_id:   professional.user_id,
            role:      professional.role,
            name:      professional.full_name,
            specialty: professional.specialty_display
              || (professional.specialties || []).map(s => getSpecialtyLabel(s, lang)).join(', ')
              || professional.specialty || '',
            price:     professional.hourly_rate,
            priceUnit: t('professional.perHour'),
            location:  professional.location,
          }}
          token={token}
          onClose={() => setShowBooking(false)}
          onSuccess={() => { setShowBooking(false); onClose(); }}
        />
      )}
    </>
  );
}
