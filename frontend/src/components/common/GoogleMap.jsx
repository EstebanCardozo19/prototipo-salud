import { useEffect, useRef, useState } from 'react';
import { getLocalidadCoords, getCityCoords } from '../../constants/colombiaGeo';
import { useLang } from '../../contexts/LangContext';
import { getRoleLabel } from '../../utils/helpers';

// ─── Leaflet CSS ─────────────────────────────────────────────
// Injected once at module load
if (typeof document !== 'undefined' && !document.getElementById('leaflet-css')) {
  const link = document.createElement('link');
  link.id = 'leaflet-css';
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
}

// ─── Custom marker SVG factory ───────────────────────────────
function makeIcon(L, color, symbol) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
      <ellipse cx="18" cy="42" rx="7" ry="3" fill="rgba(0,0,0,0.18)"/>
      <path d="M18 2 C9 2 2 9 2 18 C2 30 18 42 18 42 C18 42 34 30 34 18 C34 9 27 2 18 2Z"
        fill="${color}" stroke="white" stroke-width="2.5"/>
      <text x="18" y="23" text-anchor="middle" font-family="Material Symbols Outlined,sans-serif"
        font-size="14" fill="white">${symbol}</text>
    </svg>`;
  return L.divIcon({
    html: svg,
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    popupAnchor: [0, -44],
    className: '',
  });
}

// ─── Map Component ───────────────────────────────────────────
export default function InteractiveMap({
  city = 'Bogotá D.C.',
  localidad = '',
  professionals = [],
  patientLocation = null,
  onSelectProfessional,
  className = 'w-full h-[520px] rounded-2xl overflow-hidden',
}) {
  const { t, lang } = useLang();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const [ready, setReady] = useState(false);

  const centerCoords = localidad
    ? getLocalidadCoords(city, localidad)
    : getCityCoords(city);

  // ── 1. Load Leaflet & init map ────────────────────────────
  useEffect(() => {
    let cancelled = false;

    import('leaflet').then(({ default: L }) => {
      if (cancelled || !mapRef.current) return;

      // If map already exists, just pan
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([centerCoords.lat, centerCoords.lng], localidad ? 14 : 12);
        setReady(true);
        return;
      }

      const map = L.map(mapRef.current, {
        center: [centerCoords.lat, centerCoords.lng],
        zoom: localidad ? 14 : 12,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
    // only re-run when city/localidad changes
  }, [city, localidad]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Pan when city / localidad changes (map already init) ─
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.setView([centerCoords.lat, centerCoords.lng], localidad ? 14 : 12);
  }, [city, localidad]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 3. Draw markers whenever data changes ─────────────────
  useEffect(() => {
    if (!ready || !mapInstanceRef.current) return;

    import('leaflet').then(({ default: L }) => {
      const map = mapInstanceRef.current;

      // Clear old markers
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      // Patient / home marker
      if (patientLocation) {
        const pos = patientLocation.lat && patientLocation.lng
          ? [patientLocation.lat, patientLocation.lng]
          : [centerCoords.lat, centerCoords.lng];

        const homeIcon = makeIcon(L, '#e11d48', '🏠');
        const m = L.marker(pos, { icon: homeIcon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family:sans-serif;min-width:140px;">
              <div style="font-weight:700;color:#e11d48;font-size:14px;">🏠 ${patientLocation.patient_name || 'Hogar Familiar'}</div>
              <div style="font-size:12px;color:#4b5563;margin-top:4px;">${patientLocation.fullLocation || city}</div>
            </div>
          `, { maxWidth: 220 });
        markersRef.current.push(m);
      }

      // Professional markers
      professionals.forEach((prof, idx) => {
        const baseLoc = prof.location || localidad || city;
        const base = getLocalidadCoords(city, baseLoc);
        const angle = (idx / Math.max(professionals.length, 1)) * 2 * Math.PI;
        const radius = 0.007 + (idx % 3) * 0.003;
        const pos = [
          base.lat + Math.sin(angle) * radius,
          base.lng + Math.cos(angle) * radius,
        ];

        const isNurse = prof.role === 'nurse';
        const color = isNurse ? '#006a61' : '#0040a1';
        const symbol = isNurse ? '✚' : '👤';

        const icon = makeIcon(L, color, symbol);

        const popupContent = `
          <div style="font-family:sans-serif;min-width:200px;max-width:240px;">
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
              <div style="width:38px;height:38px;border-radius:10px;background:${color};color:#fff;
                display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0;">
                ${prof.full_name?.charAt(0) || '?'}
              </div>
              <div>
                <div style="font-weight:700;font-size:14px;color:#111827;">${prof.full_name}</div>
                <div style="font-size:11px;color:${color};font-weight:600;">${getRoleLabel(prof.role, lang)} · ${prof.location || city}</div>
              </div>
            </div>
            <div style="font-size:13px;font-weight:700;color:#0040a1;margin-bottom:8px;">
              $${Number(prof.hourly_rate || 0).toLocaleString('es-CO')}/h
              ${prof.rating ? `<span style="color:#f59e0b;margin-left:6px;">★ ${prof.rating}</span>` : ''}
            </div>
            <button
              onclick="window.__mapBooking && window.__mapBooking(${JSON.stringify(prof.id || prof.user_id)})"
              style="width:100%;padding:7px 12px;background:${color};color:white;border:none;border-radius:8px;
                font-weight:700;font-size:12px;cursor:pointer;">
              ${t('professional.requestService')}
            </button>
          </div>
        `;

        const marker = L.marker(pos, { icon })
          .addTo(map)
          .bindPopup(popupContent, { maxWidth: 260 });

        marker.on('popupopen', () => {
          window.__mapBooking = (id) => {
            if (onSelectProfessional) onSelectProfessional(prof);
            map.closePopup();
          };
        });

        markersRef.current.push(marker);
      });
    });
  }, [ready, professionals, patientLocation, city, localidad, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 4. Cleanup on unmount ─────────────────────────────────
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      delete window.__mapBooking;
    };
  }, []);

  return (
    <div
      className={`relative ${className} shadow-sm border border-[#c3c6d6]/40 bg-[#e8effc]`}
      style={{ isolation: 'isolate' }}
    >
      {/* Leaflet map mount point */}
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* Loading skeleton */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#f0f4fd] z-10 rounded-2xl">
          <div className="flex flex-col items-center gap-3 text-[#0040a1]">
            <span className="material-symbols-outlined text-[42px] animate-spin" style={{ animationDuration: '1.2s' }}>
              explore
            </span>
            <span className="text-[14px] font-semibold">Cargando mapa…</span>
          </div>
        </div>
      )}

      {/* City badge */}
      {ready && (
        <div className="absolute top-3 left-3 z-[999] bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl
          border border-[#c3c6d6]/50 shadow-md flex items-center gap-2 text-[13px] font-bold text-[#0040a1] pointer-events-none">
          <span className="material-symbols-outlined text-[16px]">location_on</span>
          {localidad ? `${localidad}, ${city}` : city}
          <span className="text-[11px] font-normal text-[#424654] ml-1">
            · {professionals.length} {professionals.length === 1 ? 'profesional' : 'profesionales'}
          </span>
        </div>
      )}
    </div>
  );
}
