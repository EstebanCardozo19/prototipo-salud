/**
 * Modal "Ver perfil del familiar" para el panel de solicitudes del profesional.
 *
 * Sigue el mismo patrón visual que ProfessionalDetailModal:
 * hero compacto + pestañas Perfil / Ubicación / Reseñas.
 */
import { useState, useRef, useEffect } from 'react';
import StarRating from '../common/StarRating';
import { getAssetUrl, getMobilityLabel } from '../../utils/helpers';
import { useLang } from '../../contexts/LangContext';
import {
  getLocalidadCoords,
  getCityCoords,
} from '../../constants/colombiaGeo';

// ── Mini mapa del paciente ────────────────────────────────────
function FamilyMiniMap({ neighborhood, city }) {
  const mapRef      = useRef(null);
  const instanceRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    import('leaflet').then(({ default: L }) => {
      if (cancelled || !mapRef.current) return;

      const coords = neighborhood
        ? getLocalidadCoords(city || 'Bogotá D.C.', neighborhood)
        : getCityCoords(city || 'Bogotá D.C.');

      if (instanceRef.current) {
        instanceRef.current.remove();
        instanceRef.current = null;
      }

      const map = L.map(mapRef.current, {
        center: [coords.lat, coords.lng],
        zoom: neighborhood ? 14 : 12,
        zoomControl: true,
        scrollWheelZoom: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
          <ellipse cx="18" cy="42" rx="7" ry="3" fill="rgba(0,0,0,0.2)"/>
          <path d="M18 2C9 2 2 9 2 18C2 30 18 42 18 42C18 42 34 30 34 18C34 9 27 2 18 2Z"
            fill="#0040a1" stroke="white" stroke-width="2.5"/>
          <text x="18" y="23" text-anchor="middle" font-family="sans-serif"
            font-size="13" fill="white" font-weight="bold">🏠</text>
        </svg>`;

      const icon = L.divIcon({
        html: svg,
        iconSize: [36, 44],
        iconAnchor: [18, 44],
        popupAnchor: [0, -46],
        className: '',
      });

      const label = [neighborhood, city].filter(Boolean).join(', ') || 'Bogotá D.C.';
      L.marker([coords.lat, coords.lng], { icon })
        .addTo(map)
        .bindPopup(
          `<div style="font-family:sans-serif;min-width:130px;">
            <strong style="color:#0040a1;font-size:13px;">Zona del paciente</strong><br/>
            <span style="font-size:11px;color:#4b5563;">${label}</span>
          </div>`,
          { maxWidth: 200 },
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
  }, [neighborhood, city]);

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
      {ready && (
        <div className="absolute bottom-2 left-2 z-[999] bg-white/95 backdrop-blur-sm px-2.5 py-1
          rounded-xl border border-[#c3c6d6]/50 shadow text-[11px] font-semibold text-[#0040a1]
          flex items-center gap-1 pointer-events-none">
          <span className="material-symbols-outlined text-[13px]">location_on</span>
          {[neighborhood, city].filter(Boolean).join(', ') || 'Bogotá D.C.'}
        </div>
      )}
    </div>
  );
}

// ── FamilyDetailModal ─────────────────────────────────────────
export default function FamilyDetailModal({ booking, onClose }) {
  const { lang } = useLang();
  const [activeTab, setActiveTab] = useState('info'); // 'info' | 'map' | 'reviews'

  const initials = (booking.family_name || 'F')
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const reviews         = booking.family_recent_reviews         || [];
  const cancelledComments = booking.family_recent_cancelled_comments || [];
  const ratingCount     = booking.family_rating_count || 0;
  const ratingAvg       = booking.family_rating_avg   || 0;

  const location = [booking.patient_neighborhood, booking.patient_city]
    .filter(Boolean).join(', ');

  const housing = [
    booking.patient_is_apartment === true  ? 'Apartamento' :
    booking.patient_is_apartment === false ? 'Casa'        : null,
    booking.patient_floor_number != null   ? `Piso ${booking.patient_floor_number}` : null,
    booking.patient_has_elevator === true  ? 'Con ascensor' : null,
  ].filter(Boolean).join(' · ');

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(10,15,30,0.70)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full flex flex-col"
        style={{ maxWidth: 560, height: 'calc(100vh - 80px)', maxHeight: 700 }}
      >
        {/* ── Hero ── */}
        <div className="relative bg-gradient-to-br from-[#0040a1] to-[#0056d2] px-5 py-4 flex items-center gap-4 shrink-0">
          <button onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25 transition-all z-10">
            <span className="material-symbols-outlined text-white text-[19px]">close</span>
          </button>

          {booking.family_photo_url ? (
            <img src={getAssetUrl(booking.family_photo_url)} alt={booking.family_name}
              className="w-[56px] h-[56px] rounded-xl object-cover border-2 border-white/30 shadow-lg shrink-0" />
          ) : (
            <div className="w-[56px] h-[56px] rounded-xl bg-white/20 text-white flex items-center justify-center text-xl font-bold shrink-0 border-2 border-white/30">
              {initials}
            </div>
          )}

          <div className="flex-1 min-w-0 pr-8">
            <h2 className="text-white font-bold text-[17px] leading-tight truncate">
              {booking.family_name || 'Familiar'}
            </h2>
            <p className="text-white/70 text-[11px] mt-0.5">Familia solicitante</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {ratingCount > 0 ? (
                <div className="flex items-center gap-1 bg-amber-400/20 border border-amber-300/30 rounded-lg px-2 py-0.5">
                  <StarRating value={ratingAvg} readOnly size="sm" />
                  <span className="text-amber-200 font-bold text-[12px] ml-0.5">{Number(ratingAvg).toFixed(1)}</span>
                  <span className="text-amber-300/70 text-[10px]">({ratingCount})</span>
                </div>
              ) : (
                <span className="text-white/60 text-[11px]">Sin valoraciones previas</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
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
              {/* Paciente */}
              <div className="bg-[#f3f3f6] rounded-xl px-4 py-3 border border-[#c3c6d6]/30 flex flex-col gap-1.5">
                <p className="text-[10px] font-bold text-[#737785] uppercase tracking-wide">Paciente</p>
                <p className="text-[15px] font-semibold text-[#1a1c1e]">
                  {booking.patient_name || 'No especificado'}
                  {booking.patient_age != null && ` · ${booking.patient_age} años`}
                </p>
                {booking.patient_mobility_level && (
                  <p className="text-[13px] text-[#424654]">
                    <span className="font-semibold">Movilidad:</span>{' '}
                    {getMobilityLabel(booking.patient_mobility_level, lang)}
                  </p>
                )}
              </div>

              {/* Vivienda */}
              {housing && (
                <div className="flex items-center gap-3 bg-[#f3f3f6] rounded-xl px-4 py-3 border border-[#c3c6d6]/30">
                  <span className="material-symbols-outlined text-[#0040a1]/60 text-[22px]">home</span>
                  <div>
                    <p className="text-[10px] font-bold text-[#737785] uppercase tracking-wide">Vivienda</p>
                    <p className="text-[14px] font-semibold text-[#1a1c1e]">{housing}</p>
                  </div>
                </div>
              )}

              {/* Dirección autorizada */}
              {booking.patient_address && (
                <div className="flex items-center gap-3 bg-[#f3f3f6] rounded-xl px-4 py-3 border border-[#c3c6d6]/30">
                  <span className="material-symbols-outlined text-[#0040a1]/60 text-[22px]">home_pin</span>
                  <div>
                    <p className="text-[10px] font-bold text-[#737785] uppercase tracking-wide">Dirección autorizada</p>
                    <p className="text-[14px] font-semibold text-[#1a1c1e]">{booking.patient_address}</p>
                  </div>
                </div>
              )}

              {/* CTA al mapa */}
              {location && (
                <button onClick={() => setActiveTab('map')}
                  className="flex items-center gap-2 text-[12px] font-semibold text-[#0040a1] hover:underline">
                  <span className="material-symbols-outlined text-[15px]">location_on</span>
                  Ver en el mapa → {location}
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
                  <p className="text-[14px] font-bold text-[#1a1c1e]">Zona del paciente</p>
                  <p className="text-[12px] text-[#737785]">{location || 'Ubicación no especificada'}</p>
                </div>
              </div>
              <FamilyMiniMap
                neighborhood={booking.patient_neighborhood}
                city={booking.patient_city}
              />
              <p className="text-[11px] text-[#737785] text-center">
                La ubicación corresponde a la zona del barrio/localidad del paciente, no a la dirección exacta.
              </p>
            </div>
          )}

          {/* ── TAB: RESEÑAS ── */}
          {activeTab === 'reviews' && (
            <div className="p-5 flex flex-col gap-3">
              {/* Resumen rating */}
              <div className="bg-gradient-to-r from-amber-50 to-amber-100/40 border border-amber-200/60 rounded-2xl px-5 py-4 flex items-center gap-4">
                {ratingCount > 0 ? (
                  <>
                    <div className="text-[42px] font-black text-amber-500 leading-none">
                      {Number(ratingAvg).toFixed(1)}
                    </div>
                    <div>
                      <StarRating value={ratingAvg} readOnly size="md" />
                      <p className="text-[11px] text-[#737785] mt-0.5">
                        {ratingCount} {ratingCount === 1 ? 'calificación' : 'calificaciones'}
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-[15px] font-semibold text-[#737785]">Sin valoraciones previas</p>
                )}
              </div>

              {/* Lista de reseñas */}
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
                          {r.professional_name || 'Profesional'}
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

              {/* Comentarios de cancelaciones */}
              <section className="mt-2 border-t border-[#c3c6d6]/30 pt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h4 className="text-[14px] font-bold text-[#1a1c1e]">Comentarios de servicios cancelados</h4>
                  <span className="text-[11px] text-[#737785]">No afectan la calificación</span>
                </div>
                {cancelledComments.length === 0 ? (
                  <p className="py-4 text-[13px] text-[#737785]">No hay comentarios públicos de servicios cancelados.</p>
                ) : (
                  <div className="mt-3 flex flex-col gap-2.5">
                    {cancelledComments.map((item, i) => (
                      <article key={item.id ?? i} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                        <span className="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                          Servicio cancelado
                        </span>
                        <p className="mt-1.5 text-[13px] text-[#424654] leading-relaxed">{item.comment}</p>
                        {item.created_at && (
                          <p className="mt-1.5 text-[10px] text-[#737785]">
                            {new Date(item.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-4 py-3 border-t border-[#c3c6d6]/30 bg-white rounded-b-2xl shrink-0">
          <button onClick={onClose}
            className="w-full h-[42px] border border-[#c3c6d6] text-[#424654] rounded-xl font-semibold text-[13px] hover:bg-[#f3f3f6] transition-all">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
