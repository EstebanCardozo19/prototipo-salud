import { useEffect, useRef, useState } from 'react';
import { loadGoogleMapsScript } from '../../utils/googleMaps';
import { getLocalidadesForCity } from '../../constants/colombiaGeo';

// ─── GooglePlacesAutocomplete ────────────────────────────────
export default function GooglePlacesAutocomplete({
  value,
  onChange,
  onPlaceSelected,
  selectedCity = 'Bogotá D.C.',
  placeholder = 'Ej: Cra 15 # 93-60, Bogotá',
  className = '',
}) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const [hasGoogleMaps, setHasGoogleMaps] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadGoogleMapsScript().then(maps => {
      if (!mounted || !maps || !maps.places || !inputRef.current) return;
      setHasGoogleMaps(true);

      try {
        const autocomplete = new maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: 'co' },
          fields: ['address_components', 'geometry', 'formatted_address', 'name'],
          types: ['address', 'geocode', 'establishment'],
        });

        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          if (!place || !place.geometry) return;

          let street = '';
          let streetNumber = '';
          let neighborhood = '';
          let city = selectedCity || '';

          if (place.address_components) {
            for (const comp of place.address_components) {
              const types = comp.types;
              if (types.includes('route')) street = comp.long_name;
              if (types.includes('street_number')) streetNumber = comp.long_name;
              if (types.includes('sublocality') || types.includes('sublocality_level_1') || types.includes('neighborhood')) {
                neighborhood = comp.long_name;
              }
              if (types.includes('locality') || types.includes('administrative_area_level_2')) {
                city = comp.long_name;
              }
            }
          }

          const fullAddress = street ? `${street} ${streetNumber}`.trim() : (place.name || place.formatted_address);
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();

          if (onChange) onChange(fullAddress || place.formatted_address);
          if (onPlaceSelected) {
            onPlaceSelected({
              address: fullAddress || place.formatted_address,
              neighborhood,
              city,
              lat,
              lng,
              formatted_address: place.formatted_address
            });
          }
        });

        autocompleteRef.current = autocomplete;
      } catch (err) {
        console.warn('Google Places Autocomplete initialization warning:', err);
      }
    });

    return () => {
      mounted = false;
      if (autocompleteRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [selectedCity]);

  // Fallback de autocompletado si no hay Google Maps API key
  const handleInputChange = (e) => {
    const val = e.target.value;
    if (onChange) onChange(val);

    if (!hasGoogleMaps && val.trim().length > 1) {
      const locs = getLocalidadesForCity(selectedCity);
      const matched = locs.filter(l => l.toLowerCase().includes(val.toLowerCase()));
      setSuggestions(matched.slice(0, 5));
      setShowSuggestions(matched.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (loc) => {
    const full = `${loc}, ${selectedCity}`;
    if (onChange) onChange(full);
    if (onPlaceSelected) {
      onPlaceSelected({
        address: full,
        neighborhood: loc,
        city: selectedCity,
        lat: null,
        lng: null
      });
    }
    setShowSuggestions(false);
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => {
            if (!hasGoogleMaps && suggestions.length > 0) setShowSuggestions(true);
          }}
          placeholder={placeholder}
          className={className}
          autoComplete="off"
        />
        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[#0040a1]/60 text-[18px] pointer-events-none">
          {hasGoogleMaps ? 'place' : 'search'}
        </span>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white rounded-xl border border-[#c3c6d6] shadow-xl overflow-hidden animate-fade-in-up">
          <div className="px-3 py-1.5 bg-[#f3f3f6] border-b border-[#c3c6d6]/30 text-[11px] font-bold text-[#737785] uppercase tracking-wide flex items-center gap-1">
            <span className="material-symbols-outlined text-[13px] text-[#0040a1]">location_on</span>
            Localidades / Barrios de {selectedCity}
          </div>
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelectSuggestion(s)}
              className="w-full text-left px-3.5 py-2 text-[13px] text-[#1a1c1e] hover:bg-[#0040a1]/5 hover:text-[#0040a1] transition-colors flex items-center gap-2 border-b border-[#c3c6d6]/20 last:border-0"
            >
              <span className="material-symbols-outlined text-[15px] text-[#0040a1]">near_me</span>
              <span>{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
