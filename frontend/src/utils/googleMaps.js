/**
 * googleMaps.js — Cargador y utilidades para el SDK de Google Maps API
 */

let googleMapsPromise = null;

/**
 * Carga de forma asíncrona y segura el script de Google Maps JavaScript API.
 * Retorna la instancia de `window.google.maps`.
 */
export function loadGoogleMapsScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window not defined'));

  if (window.google && window.google.maps) {
    return Promise.resolve(window.google.maps);
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  const apiKey =
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
    window.__GOOGLE_MAPS_API_KEY__ ||
    '';

  if (!apiKey) {
    // Retornamos null para activar el modo de mapa interactivo fallback sin romper la app
    return Promise.resolve(null);
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById('google-maps-script');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.google.maps));
      existingScript.addEventListener('error', (e) => reject(e));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.type = 'text/javascript';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&loading=async&language=es&region=CO`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (window.google && window.google.maps) {
        resolve(window.google.maps);
      } else {
        reject(new Error('Google Maps API failed to load'));
      }
    };

    script.onerror = (err) => {
      console.warn('Error loading Google Maps API script:', err);
      resolve(null); // Fallback amigable
    };

    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

/**
 * Determina si Google Maps está disponible en el entorno actual.
 */
export function isGoogleMapsAvailable() {
  return typeof window !== 'undefined' && Boolean(window.google?.maps);
}

/**
 * Geocodifica una dirección en Colombia usando Google Maps Geocoding.
 */
export async function geocodeAddress(address) {
  try {
    const maps = await loadGoogleMapsScript();
    if (!maps || !maps.Geocoder) return null;

    const geocoder = new maps.Geocoder();
    return new Promise((resolve) => {
      geocoder.geocode(
        { address, componentRestrictions: { country: 'CO' } },
        (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const loc = results[0].geometry.location;
            resolve({
              lat: loc.lat(),
              lng: loc.lng(),
              formattedAddress: results[0].formatted_address,
              addressComponents: results[0].address_components
            });
          } else {
            resolve(null);
          }
        }
      );
    });
  } catch (e) {
    console.warn('Geocoding error:', e);
    return null;
  }
}
