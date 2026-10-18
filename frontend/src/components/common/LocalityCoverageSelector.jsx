import { getLocalidadesForCity, BOGOTA_CITY } from '../../constants/colombiaGeo';

export default function LocalityCoverageSelector({ coverageLocalities = [], coversAllBogota = false, onChange }) {
  const localities = getLocalidadesForCity(BOGOTA_CITY);

  const toggle = locality => {
    const next = coverageLocalities.includes(locality)
      ? coverageLocalities.filter(item => item !== locality)
      : [...coverageLocalities, locality];
    onChange({ coverageLocalities: next, coversAllBogota });
  };

  return (
    <fieldset className="rounded-xl border border-[#c3c6d6]/50 p-4 space-y-3">
      <legend className="px-1 text-[13px] font-bold text-[#424654]">Cobertura de servicio</legend>
      <label className="flex items-center gap-2 text-[13px] font-semibold text-[#0040a1] cursor-pointer">
        <input type="checkbox" checked={coversAllBogota} onChange={e => onChange({ coverageLocalities, coversAllBogota: e.target.checked })} />
        Toda Bogotá D.C.
      </label>
      <p className="text-[12px] text-[#737785]">Selecciona las localidades adicionales donde puedes atender. Tu ubicación principal se conserva para el mapa.</p>
      {!coversAllBogota && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {localities.map(locality => (
            <label key={locality} className="flex items-center gap-1.5 text-[12px] text-[#424654] cursor-pointer">
              <input type="checkbox" checked={coverageLocalities.includes(locality)} onChange={() => toggle(locality)} />
              {locality}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}