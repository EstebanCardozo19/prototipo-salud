/**
 * colombiaGeo.js — Catálogo geográfico de la zona de cobertura
 * Bogotá D.C. y municipios cercanos de Cundinamarca, con localidades/comunas, barrios y coordenadas.
 */

/**
 * Barrios conocidos agrupados por: ciudad → localidad (clave normalizada a minúsculas).
 * Se usa para sugerir barrios dentro de una localidad seleccionada.
 */
export const BARRIOS_POR_LOCALIDAD = {
  'bogotá d.c.': {
    'usaquén': ['Santa Bárbara', 'Cedritos', 'Toberín', 'Country Club', 'La Uribe', 'Niza', 'Unicentro', 'San Patricio', 'Los Alcázares', 'La Calleja', 'Paseo de los Libertadores'],
    'chapinero': ['El Nogal', 'Rosales', 'Chico Norte', 'Chico Sur', 'Chicó Reservado', 'Quinta Camacho', 'Galerías', 'Chapinero Central', 'El Refugio', 'Belgravia', 'Lourdes'],
    'santa fe': ['La Macarena', 'La Perseverancia', 'Las Aguas', 'Centro Internacional', 'Egipto', 'La Concordia', 'La Candelaria'],
    'san cristóbal': ['20 de Julio', 'San Cristóbal Sur', 'La Gloria', 'Sosiego', 'El Ramajal', 'San Blas'],
    'usme': ['Gran Yomasa', 'Comuneros', 'Alfonso López', 'La Flora', 'Danubio'],
    'tunjuelito': ['Tunal', 'Abraham Lincoln', 'Venecia', 'San Benito', 'Fátima'],
    'bosa': ['El Porvenir', 'Bosa Centro', 'San Pablo', 'José Antonio Galán', 'Apogeo', 'Primavera'],
    'kennedy': ['Castilla', 'Timiza', 'Kennedy Central', 'Carvajal', 'Patio Bonito', 'Las Margaritas', 'Américas'],
    'fontibón': ['Fontibón Centro', 'Capellanía', 'Modelia', 'Zona Franca', 'Versalles', 'Granjas de Techo'],
    'engativá': ['Boyacá Real', 'Bolivia', 'Engativá Centro', 'Florencia', 'La Primavera', 'Quirigua', 'Santa Cecilia'],
    'suba': ['Alhambra', 'Suba Centro', 'Tibabuyes', 'Lisboa', 'Niza', 'La Floresta', 'El Rincon', 'Casa Blanca Suba', 'San José de Bavaria', 'Britalia'],
    'barrios unidos': ['Doce de Octubre', 'Los Andes', 'Siete de Agosto', 'Colombia', 'El Lago', 'Alczar'],
    'teusaquillo': ['Teusaquillo', 'Palermo', 'Galerías', 'Armenia', 'La Soledad', 'Ciudad Salitre'],
    'los mártires': ['Santa Isabel', 'Eduardo Santos', 'La Pepita', 'El Listón', 'Ricaurte'],
    'antonio nariño': ['Ciudad Jardín Sur', 'Policarpa', 'Restrepo', 'San Antonio', 'Los Libertadores'],
    'puente aranda': ['Puente Aranda', 'Ciudad Montes', 'Muzú', 'Primavera', 'Salazar Gomez', 'Zona Industrial'],
    'la candelaria': ['La Candelaria', 'La Concordia', 'Belén', 'Egipto', 'Catedral'],
    'rafael uribe uribe': ['Diana Turbay', 'Quiroga', 'Marruecos', 'Molinos', 'Marco Fidel Suárez'],
    'ciudad bolívar': ['Lucero', 'El Tesoro', 'Perdomo', 'Ismael Perdomo', 'Arborizadora', 'Ierómandrópolis'],
  },
  'medellín': {
    'el poblado (comuna 14)': ['Patio Bonito', 'El Tesoro', 'Las Lomas', 'Manila', 'Astorga', 'Lalinde', 'La Florida', 'Castropol', 'Los Naranjos', 'Alejandría'],
    'laureles - estadio (comuna 11)': ['Laureles', 'Estadio', 'Los Conquistadores', 'Suramericana', 'Naranjal', 'San Joaquín'],
    'belén (comuna 16)': ['Belén Centro', 'La Mota', 'Las Violetas', 'Rincón', 'Rodeo Alto', 'Fátima', 'Nuevo Belén'],
    'la candelaria - centro (comuna 10)': ['La Candelaria', 'Boston', 'Villa Hermosa', 'El Chagualo', 'Colón', 'San Benito'],
    'buenos aires (comuna 9)': ['Buenos Aires', 'Barrio Enciso', 'Loreto', 'La Milagrosa', 'Las Mirlas'],
    'la américa (comuna 12)': ['La América', 'La Floresta', 'Los Colores', 'Nutibara', 'Santa Lucía', 'El Danubio'],
    'robledo (comuna 7)': ['Robledo', 'Aures', 'Bello Horizonte', 'Picacho', 'El Diamante', 'Palenque'],
    'aranjuez (comuna 4)': ['Aranjuez', 'La Piñuela', 'San Isidro', 'Las Esmeraldas', 'Bermejal', 'Palermo'],
  },
  'cali': {
    'comuna 2 (santa mónica, versalles, granada, chipichape)': ['Santa Mónica', 'Versalles', 'Granada', 'Chipichape', 'El Peñón', 'Normandía'],
    'comuna 17 (ciudad jardín, el limonar, capri)': ['Ciudad Jardín', 'El Limonar', 'Capri', 'Caney', 'La Hacienda', 'El Ingenio'],
    'comuna 19 (san fernando, tequendama, imbanaco)': ['San Fernando', 'Tequendama', 'Imbanaco', 'Nueva Tequendama', 'Colseguros', 'Cristóbal Colón'],
    'comuna 3 (san antonio, el peñón, centro)': ['San Antonio', 'El Peñón', 'Centro', 'Alameda', 'Santa Rosa', 'Sucre'],
    'comuna 22 (pance, ciudad jardín sur)': ['Pance', 'Ciudad Jardín Sur', 'Valle del Lili', 'Cañasgordas'],
  },
  'barranquilla': {
    'localidad riomar (alto prado, villa santos, buenavista)': ['Alto Prado', 'Villa Santos', 'Buenavista', 'Altos del Prado', 'Villa Campestre', 'Miramar'],
    'localidad norte-centro histórico (el prado, boston, bellavista)': ['El Prado', 'Boston', 'Bellavista', 'El Golf', 'Recreo', 'Ciudad Jardín'],
    'localidad suroccidente (la victoria, san felipe)': ['La Victoria', 'San Felipe', 'Boyacá', 'Las Nieves', 'La Luz'],
  },
  'bucaramanga': {
    'cabecera del llano (comuna 12)': ['Cabecera del Llano', 'La Aurora', 'Estoril', 'El Bosque', 'San Alonso'],
    'centro (comuna 15)': ['Centro', 'Sotomayor', 'García Rovira', 'Los Búcaros', 'La Concordia'],
    'floridablanca (cañaveral / ruitoque)': ['Cañaveral', 'Ruitoque', 'Lagos del Cacique', 'Prados del Norte', 'El Bosque'],
  },
};

/**
 * Obtiene los barrios sugeridos para una ciudad + localidad dadas.
 * @param {string} cityName - Nombre de la ciudad
 * @param {string} localidadName - Nombre de la localidad / comuna
 * @returns {string[]} Lista de barrios sugeridos (puede ser vacía)
 */
export function getBarriosForLocalidad(cityName, localidadName) {
  if (!cityName || !localidadName) return [];
  const cityKey = cityName.toLowerCase().trim();
  const locKey = localidadName.toLowerCase().trim();
  const cityBarrios = BARRIOS_POR_LOCALIDAD[cityKey];
  if (!cityBarrios) return [];
  // Búsqueda exacta primero, luego parcial
  if (cityBarrios[locKey]) return cityBarrios[locKey];
  const matchKey = Object.keys(cityBarrios).find(k => k.includes(locKey) || locKey.includes(k));
  return matchKey ? cityBarrios[matchKey] : [];
}

export const COLOMBIA_GEO = {
  'Bogotá D.C.': {
    department: 'Bogotá D.C.',
    coords: { lat: 4.7110, lng: -74.0721 },
    localidades: [
      { name: 'Usaquén', coords: { lat: 4.7016, lng: -74.0305 } },
      { name: 'Chapinero', coords: { lat: 4.6548, lng: -74.0565 } },
      { name: 'Santa Fe', coords: { lat: 4.6041, lng: -74.0682 } },
      { name: 'San Cristóbal', coords: { lat: 4.5684, lng: -74.0833 } },
      { name: 'Usme', coords: { lat: 4.4500, lng: -74.1333 } },
      { name: 'Tunjuelito', coords: { lat: 4.5772, lng: -74.1353 } },
      { name: 'Bosa', coords: { lat: 4.6192, lng: -74.1914 } },
      { name: 'Kennedy', coords: { lat: 4.6294, lng: -74.1539 } },
      { name: 'Fontibón', coords: { lat: 4.6738, lng: -74.1444 } },
      { name: 'Engativá', coords: { lat: 4.7008, lng: -74.1167 } },
      { name: 'Suba', coords: { lat: 4.7481, lng: -74.0939 } },
      { name: 'Barrios Unidos', coords: { lat: 4.6689, lng: -74.0772 } },
      { name: 'Teusaquillo', coords: { lat: 4.6417, lng: -74.0858 } },
      { name: 'Los Mártires', coords: { lat: 4.6083, lng: -74.0906 } },
      { name: 'Antonio Nariño', coords: { lat: 4.5883, lng: -74.1039 } },
      { name: 'Puente Aranda', coords: { lat: 4.6228, lng: -74.1158 } },
      { name: 'La Candelaria', coords: { lat: 4.5969, lng: -74.0728 } },
      { name: 'Rafael Uribe Uribe', coords: { lat: 4.5700, lng: -74.1100 } },
      { name: 'Ciudad Bolívar', coords: { lat: 4.5428, lng: -74.1611 } },
      { name: 'Sumapaz', coords: { lat: 4.0417, lng: -74.3167 } }
    ]
  },
  // Municipios de cobertura regional: máximo aproximado de dos horas desde Bogotá.
  'Soacha': {
    department: 'Cundinamarca',
    coords: { lat: 4.5794, lng: -74.2168 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.5794, lng: -74.2168 } }]
  },
  'Chía': {
    department: 'Cundinamarca',
    coords: { lat: 4.8623, lng: -74.0561 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.8623, lng: -74.0561 } }]
  },
  'La Calera': {
    department: 'Cundinamarca',
    coords: { lat: 4.7207, lng: -73.9693 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.7207, lng: -73.9693 } }]
  },
  'Cota': {
    department: 'Cundinamarca',
    coords: { lat: 4.8091, lng: -74.0980 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.8091, lng: -74.0980 } }]
  },
  'Funza': {
    department: 'Cundinamarca',
    coords: { lat: 4.7164, lng: -74.2110 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.7164, lng: -74.2110 } }]
  },
  'Mosquera': {
    department: 'Cundinamarca',
    coords: { lat: 4.7059, lng: -74.2302 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.7059, lng: -74.2302 } }]
  },
  'Madrid': {
    department: 'Cundinamarca',
    coords: { lat: 4.7337, lng: -74.2642 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.7337, lng: -74.2642 } }]
  },
  'Facatativá': {
    department: 'Cundinamarca',
    coords: { lat: 4.8137, lng: -74.3545 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.8137, lng: -74.3545 } }]
  },
  'Cajicá': {
    department: 'Cundinamarca',
    coords: { lat: 4.9186, lng: -74.0278 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.9186, lng: -74.0278 } }]
  },
  'Zipaquirá': {
    department: 'Cundinamarca',
    coords: { lat: 5.0221, lng: -74.0048 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 5.0221, lng: -74.0048 } }]
  },
  'Sopó': {
    department: 'Cundinamarca',
    coords: { lat: 4.9075, lng: -73.9391 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.9075, lng: -73.9391 } }]
  },
  'Tocancipá': {
    department: 'Cundinamarca',
    coords: { lat: 4.9653, lng: -73.9130 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.9653, lng: -73.9130 } }]
  },
  'Tabio': {
    department: 'Cundinamarca',
    coords: { lat: 4.9173, lng: -74.0936 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.9173, lng: -74.0936 } }]
  },
  'Tenjo': {
    department: 'Cundinamarca',
    coords: { lat: 4.8727, lng: -74.1442 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.8727, lng: -74.1442 } }]
  },
  'Gachancipá': {
    department: 'Cundinamarca',
    coords: { lat: 4.9911, lng: -73.8712 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.9911, lng: -73.8712 } }]
  },
  'Nemocón': {
    department: 'Cundinamarca',
    coords: { lat: 5.0672, lng: -73.8776 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 5.0672, lng: -73.8776 } }]
  },
  'El Rosal': {
    department: 'Cundinamarca',
    coords: { lat: 4.8520, lng: -74.2594 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.8520, lng: -74.2594 } }]
  },
  'Bojacá': {
    department: 'Cundinamarca',
    coords: { lat: 4.7333, lng: -74.3417 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.7333, lng: -74.3417 } }]
  },
  'Sibaté': {
    department: 'Cundinamarca',
    coords: { lat: 4.4915, lng: -74.2596 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.4915, lng: -74.2596 } }]
  },
  'Fusagasugá': {
    department: 'Cundinamarca',
    coords: { lat: 4.3371, lng: -74.3638 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.3371, lng: -74.3638 } }]
  },
  'La Mesa': {
    department: 'Cundinamarca',
    coords: { lat: 4.6300, lng: -74.4610 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.6300, lng: -74.4610 } }]
  },
  'Girardot': {
    department: 'Cundinamarca',
    coords: { lat: 4.3031, lng: -74.8047 },
    localidades: [{ name: 'Zona urbana', coords: { lat: 4.3031, lng: -74.8047 } }]
  },
  'Medellín': {
    department: 'Antioquia',
    coords: { lat: 6.2442, lng: -75.5812 },
    localidades: [
      { name: 'El Poblado (Comuna 14)', coords: { lat: 6.2089, lng: -75.5678 } },
      { name: 'Laureles - Estadio (Comuna 11)', coords: { lat: 6.2464, lng: -75.5925 } },
      { name: 'Belén (Comuna 16)', coords: { lat: 6.2289, lng: -75.5989 } },
      { name: 'Guayabal (Comuna 15)', coords: { lat: 6.2167, lng: -75.5861 } },
      { name: 'La Candelaria - Centro (Comuna 10)', coords: { lat: 6.2486, lng: -75.5689 } },
      { name: 'Buenos Aires (Comuna 9)', coords: { lat: 6.2403, lng: -75.5519 } },
      { name: 'La América (Comuna 12)', coords: { lat: 6.2550, lng: -75.6022 } },
      { name: 'San Javier - Comuna 13', coords: { lat: 6.2522, lng: -75.6178 } },
      { name: 'Robledo (Comuna 7)', coords: { lat: 6.2758, lng: -75.5975 } },
      { name: 'Castilla (Comuna 5)', coords: { lat: 6.2917, lng: -75.5750 } },
      { name: 'Aranjuez (Comuna 4)', coords: { lat: 6.2789, lng: -75.5606 } },
      { name: 'Manrique (Comuna 3)', coords: { lat: 6.2694, lng: -75.5489 } },
      { name: 'Santa Cruz (Comuna 2)', coords: { lat: 6.2972, lng: -75.5583 } },
      { name: 'Popular (Comuna 1)', coords: { lat: 6.2989, lng: -75.5458 } },
      { name: 'Villa Hermosa (Comuna 8)', coords: { lat: 6.2556, lng: -75.5444 } },
      { name: 'Doce de Octubre (Comuna 6)', coords: { lat: 6.3056, lng: -75.5833 } },
      { name: 'Envigado (Área Metropolitana)', coords: { lat: 6.1689, lng: -75.5847 } },
      { name: 'Itagüí (Área Metropolitana)', coords: { lat: 6.1844, lng: -75.6008 } },
      { name: 'Sabaneta (Área Metropolitana)', coords: { lat: 6.1517, lng: -75.6150 } },
      { name: 'Bello (Área Metropolitana)', coords: { lat: 6.3375, lng: -75.5581 } },
      { name: 'Rionegro (Oriente Antioqueño)', coords: { lat: 6.1550, lng: -75.3739 } }
    ]
  },
  'Cali': {
    department: 'Valle del Cauca',
    coords: { lat: 3.4516, lng: -76.5320 },
    localidades: [
      { name: 'Comuna 22 (Pance, Ciudad Jardín Sur)', coords: { lat: 3.3556, lng: -76.5333 } },
      { name: 'Comuna 17 (Ciudad Jardín, El Limonar, Capri)', coords: { lat: 3.3889, lng: -76.5278 } },
      { name: 'Comuna 19 (San Fernando, Tequendama, Imbanaco)', coords: { lat: 3.4278, lng: -76.5444 } },
      { name: 'Comuna 2 (Santa Mónica, Versalles, Granada, Chipichape)', coords: { lat: 3.4722, lng: -76.5278 } },
      { name: 'Comuna 3 (San Antonio, El Peñón, Centro)', coords: { lat: 3.4472, lng: -76.5389 } },
      { name: 'Comuna 4 (La Flora, Salomia, Santander)', coords: { lat: 3.4833, lng: -76.5167 } },
      { name: 'Comuna 1 (Terrón Colorado, Vista Hermosa)', coords: { lat: 3.4556, lng: -76.5583 } },
      { name: 'Comuna 5 (Los Andes, Torres de Comfandi)', coords: { lat: 3.4778, lng: -76.4944 } },
      { name: 'Comuna 8 (Las Américas, Benjamín Herrera)', coords: { lat: 3.4444, lng: -76.5056 } },
      { name: 'Comuna 10 (El Guabal, San Judas)', coords: { lat: 3.4167, lng: -76.5167 } },
      { name: 'Comuna 14 (Alfonso Bonilla, Marroquín)', coords: { lat: 3.4222, lng: -76.4833 } },
      { name: 'Jamundí (Área Metropolitana)', coords: { lat: 3.2606, lng: -76.5417 } },
      { name: 'Palmira', coords: { lat: 3.5394, lng: -76.3036 } },
      { name: 'Yumbo', coords: { lat: 3.5828, lng: -76.4950 } }
    ]
  },
  'Barranquilla': {
    department: 'Atlántico',
    coords: { lat: 10.9685, lng: -74.7813 },
    localidades: [
      { name: 'Localidad Riomar (Alto Prado, Villa Santos, Buenavista)', coords: { lat: 11.0111, lng: -74.8250 } },
      { name: 'Localidad Norte-Centro Histórico (El Prado, Boston, Bellavista)', coords: { lat: 10.9944, lng: -74.8056 } },
      { name: 'Localidad Suroccidente (La Victoria, San Felipe)', coords: { lat: 10.9667, lng: -74.8167 } },
      { name: 'Localidad Suroriente (Simón Bolívar, Las Nieves)', coords: { lat: 10.9444, lng: -74.7778 } },
      { name: 'Localidad Metropolitana (Murillo, Santa María)', coords: { lat: 10.9333, lng: -74.8083 } },
      { name: 'Villa Campestre / Puerto Colombia', coords: { lat: 11.0250, lng: -74.8500 } },
      { name: 'Soledad (Área Metropolitana)', coords: { lat: 10.9167, lng: -74.7667 } }
    ]
  },
  'Cartagena': {
    department: 'Bolívar',
    coords: { lat: 10.3910, lng: -75.4794 },
    localidades: [
      { name: 'Localidad Histórica (Bocagrande, Castillogrande, Manga, Centro)', coords: { lat: 10.4083, lng: -75.5500 } },
      { name: 'Crespo / Cabrero / Marbella', coords: { lat: 10.4389, lng: -75.5167 } },
      { name: 'Localidad De la Virgen y Turística (Las Gaviotas, Los Alpes)', coords: { lat: 10.3944, lng: -75.4833 } },
      { name: 'Localidad Industrial y de la Bahía (Mamonal, Campestre)', coords: { lat: 10.3444, lng: -75.4944 } },
      { name: 'Zona Norte (La Boquilla, Manzanillo del Mar)', coords: { lat: 10.4833, lng: -75.4667 } }
    ]
  },
  'Bucaramanga': {
    department: 'Santander',
    coords: { lat: 7.1254, lng: -73.1198 },
    localidades: [
      { name: 'Cabecera del Llano (Comuna 12)', coords: { lat: 7.1167, lng: -73.1083 } },
      { name: 'Sotomayor (Comuna 12)', coords: { lat: 7.1200, lng: -73.1139 } },
      { name: 'San Francisco (Comuna 3)', coords: { lat: 7.1333, lng: -73.1222 } },
      { name: 'Centro (Comuna 15)', coords: { lat: 7.1194, lng: -73.1250 } },
      { name: 'Provenza (Comuna 10)', coords: { lat: 7.0889, lng: -73.1167 } },
      { name: 'San Alonso (Comuna 13)', coords: { lat: 7.1278, lng: -73.1111 } },
      { name: 'Real de Minas (Comuna 7)', coords: { lat: 7.1056, lng: -73.1278 } },
      { name: 'Floridablanca (Cañaveral / Ruitoque)', coords: { lat: 7.0667, lng: -73.0889 } },
      { name: 'Piedecuesta', coords: { lat: 7.0000, lng: -73.0500 } },
      { name: 'Girón', coords: { lat: 7.0700, lng: -73.1700 } }
    ]
  },
  'Pereira': {
    department: 'Risaralda',
    coords: { lat: 4.8133, lng: -75.6961 },
    localidades: [
      { name: 'Circunvalar / Pinares / Los Alpes', coords: { lat: 4.8111, lng: -75.6861 } },
      { name: 'Centro / Boston', coords: { lat: 4.8167, lng: -75.6944 } },
      { name: 'Cerritos', coords: { lat: 4.8056, lng: -75.7833 } },
      { name: 'Cuba / San Fernando', coords: { lat: 4.7944, lng: -75.7278 } },
      { name: 'Dosquebradas (Área Metropolitana)', coords: { lat: 4.8333, lng: -75.6800 } }
    ]
  },
  'Manizales': {
    department: 'Caldas',
    coords: { lat: 5.0689, lng: -75.5174 },
    localidades: [
      { name: 'Palogrande / El Cable / Milán', coords: { lat: 5.0583, lng: -75.4917 } },
      { name: 'Centro / Chipre', coords: { lat: 5.0700, lng: -75.5222 } },
      { name: 'La Enea / San Marcel', coords: { lat: 5.0333, lng: -75.4500 } },
      { name: 'La Sultana / Minitas', coords: { lat: 5.0500, lng: -75.4778 } },
      { name: 'Villamaría', coords: { lat: 5.0444, lng: -75.5167 } }
    ]
  },
  'Armenia': {
    department: 'Quindío',
    coords: { lat: 4.5339, lng: -75.6811 },
    localidades: [
      { name: 'Zona Norte (Castellana, Coinca, Nogal)', coords: { lat: 4.5500, lng: -75.6667 } },
      { name: 'Centro / Bolívar', coords: { lat: 4.5361, lng: -75.6778 } },
      { name: 'Zona Sur / Granada', coords: { lat: 4.5167, lng: -75.6944 } },
      { name: 'Calarcá', coords: { lat: 4.5294, lng: -75.6417 } }
    ]
  },
  'Cúcuta': {
    department: 'Norte de Santander',
    coords: { lat: 7.8939, lng: -72.5078 },
    localidades: [
      { name: 'La Riviera / Caobos / Colsag', coords: { lat: 7.8917, lng: -72.4944 } },
      { name: 'Centro / Quinta Oriental', coords: { lat: 7.8972, lng: -72.5056 } },
      { name: 'Prados del Este / Guaimaral', coords: { lat: 7.8833, lng: -72.4833 } },
      { name: 'Atalaya / Comuneros', coords: { lat: 7.9167, lng: -72.5333 } },
      { name: 'Los Patios / Villa del Rosario', coords: { lat: 7.8333, lng: -72.5000 } }
    ]
  },
  'Ibagué': {
    department: 'Tolima',
    coords: { lat: 4.4389, lng: -75.2322 },
    localidades: [
      { name: 'El Vergel / Piedrapintada / Calambeo', coords: { lat: 4.4444, lng: -75.2167 } },
      { name: 'Centro / La Pola', coords: { lat: 4.4361, lng: -75.2389 } },
      { name: 'Salado / Santa Ana', coords: { lat: 4.4667, lng: -75.1667 } },
      { name: 'Picaleña / Mirolindo', coords: { lat: 4.4167, lng: -75.1833 } }
    ]
  },
  'Santa Marta': {
    department: 'Magdalena',
    coords: { lat: 11.2408, lng: -74.1990 },
    localidades: [
      { name: 'Centro Histórico / Bahía / Prado', coords: { lat: 11.2444, lng: -74.2111 } },
      { name: 'El Rodadero / Gaira', coords: { lat: 11.2000, lng: -74.2278 } },
      { name: 'Bello Horizonte / Pozos Colorados', coords: { lat: 11.1556, lng: -74.2333 } },
      { name: 'Mamatoco / Bavaria', coords: { lat: 11.2333, lng: -74.1833 } },
      { name: 'Taganga', coords: { lat: 11.2667, lng: -74.1944 } }
    ]
  },
  'Villavicencio': {
    department: 'Meta',
    coords: { lat: 4.1420, lng: -73.6266 },
    localidades: [
      { name: 'El Buque / Barzal / Trapiche', coords: { lat: 4.1472, lng: -73.6389 } },
      { name: 'Centro / Siete de Agosto', coords: { lat: 4.1500, lng: -73.6333 } },
      { name: 'La Esperanza / Morichal', coords: { lat: 4.1333, lng: -73.6167 } },
      { name: 'Porfía / Ciudad Porfía', coords: { lat: 4.0833, lng: -73.6500 } }
    ]
  },
  'Pasto': {
    department: 'Nariño',
    coords: { lat: 1.2136, lng: -77.2811 },
    localidades: [
      { name: 'Centro / Plaza de Nariño', coords: { lat: 1.2144, lng: -77.2783 } },
      { name: 'Maridíaz / Pandiaco / Morasurco', coords: { lat: 1.2278, lng: -77.2889 } },
      { name: 'Lorenzo de Aldana / Tamasagra', coords: { lat: 1.2056, lng: -77.2722 } }
    ]
  },
  'Neiva': {
    department: 'Huila',
    coords: { lat: 2.9273, lng: -75.2819 },
    localidades: [
      { name: 'Zona Oriente (Ipanema, Las Ceibas, Altico)', coords: { lat: 2.9333, lng: -75.2722 } },
      { name: 'Centro / Quirinal', coords: { lat: 2.9278, lng: -75.2889 } },
      { name: 'Zona Norte (Cándido, Santa Inés)', coords: { lat: 2.9556, lng: -75.2944 } }
    ]
  },
  'Valledupar': {
    department: 'Cesar',
    coords: { lat: 10.4631, lng: -73.2532 },
    localidades: [
      { name: 'Novalito / Los Cortijos / Alfonso López', coords: { lat: 10.4722, lng: -73.2500 } },
      { name: 'Centro / Guatapurí', coords: { lat: 10.4667, lng: -73.2556 } },
      { name: 'La Nevada / Dangond', coords: { lat: 10.4833, lng: -73.2722 } }
    ]
  },
  'Montería': {
    department: 'Córdoba',
    coords: { lat: 8.7479, lng: -75.8814 },
    localidades: [
      { name: 'El Recreo / La Castellana / Costa de Oro', coords: { lat: 8.7667, lng: -75.8667 } },
      { name: 'Centro / Pasatiempo', coords: { lat: 8.7500, lng: -75.8833 } },
      { name: 'Margen Izquierda (La Granja, Mogambo)', coords: { lat: 8.7333, lng: -75.9000 } }
    ]
  },
  'Popayán': {
    department: 'Cauca',
    coords: { lat: 2.4419, lng: -76.6063 },
    localidades: [
      { name: 'Centro Histórico / Caldas', coords: { lat: 2.4417, lng: -76.6067 } },
      { name: 'Sector Norte (Bello Horizonte, La Estancia)', coords: { lat: 2.4611, lng: -76.5944 } },
      { name: 'Sector Sur / Pandiguando', coords: { lat: 2.4278, lng: -76.6167 } }
    ]
  },
  'Tunja': {
    department: 'Boyacá',
    coords: { lat: 5.5353, lng: -73.3678 },
    localidades: [
      { name: 'Centro Histórico / Maldonado', coords: { lat: 5.5333, lng: -73.3611 } },
      { name: 'Zona Norte (Unicentro, Mesopotamia, Cooservicios)', coords: { lat: 5.5556, lng: -73.3500 } },
      { name: 'Duitama / Sogamoso', coords: { lat: 5.8278, lng: -73.0333 } }
    ]
  },
  'Sincelejo': {
    department: 'Sucre',
    coords: { lat: 9.3047, lng: -75.3978 },
    localidades: [
      { name: 'Centro / Majagual / La Selva', coords: { lat: 9.3000, lng: -75.3944 } },
      { name: 'Venecia / Ford / Boston', coords: { lat: 9.3167, lng: -75.4056 } }
    ]
  },
  'Riohacha': {
    department: 'La Guajira',
    coords: { lat: 11.5444, lng: -72.9072 },
    localidades: [
      { name: 'Centro / El Muelle / Arimaca', coords: { lat: 11.5444, lng: -72.9056 } },
      { name: 'Coquivacoa / José Antonio Galán', coords: { lat: 11.5333, lng: -72.9167 } }
    ]
  },
  'San Andrés': {
    department: 'San Andrés y Providencia',
    coords: { lat: 12.5847, lng: -81.7006 },
    localidades: [
      { name: 'North End / Centro / Spratt Bight', coords: { lat: 12.5833, lng: -81.7000 } },
      { name: 'San Luis / Sound Bay', coords: { lat: 12.5333, lng: -81.7167 } },
      { name: 'La Loma', coords: { lat: 12.5500, lng: -81.7167 } }
    ]
  }
};

/** Municipios habilitados para la prestación del servicio. */
export const SERVICE_CITIES = [
  'Bogotá D.C.', 'Soacha', 'Chía', 'La Calera', 'Cota', 'Funza', 'Mosquera',
  'Madrid', 'Facatativá', 'Cajicá', 'Zipaquirá', 'Sopó', 'Tocancipá', 'Tabio',
  'Tenjo', 'Gachancipá', 'Nemocón', 'El Rosal', 'Bojacá', 'Sibaté',
  'Fusagasugá', 'La Mesa', 'Girardot'
];

/**
 * Obtiene la lista de nombres de ciudades disponibles.
 */
export function getCitiesList() {
  return SERVICE_CITIES;
}

/**
 * Obtiene el departamento al que pertenece una ciudad.
 */
export function getDepartmentForCity(cityName) {
  if (!cityName) return '';
  return COLOMBIA_GEO[cityName]?.department || '';
}

/**
 * Obtiene la lista de ciudades que pertenecen a un departamento.
 */
export function getCitiesForDepartment(dept) {
  if (!dept) return getCitiesList();
  return SERVICE_CITIES.filter(city => COLOMBIA_GEO[city]?.department === dept);
}

/**
 * Obtiene la lista única de departamentos disponibles en el catálogo.
 */
export function getDepartmentsList() {
  const depts = new Set(SERVICE_CITIES.map(city => COLOMBIA_GEO[city]?.department));
  return Array.from(depts).sort();
}

/**
 * Obtiene las localidades/comunas para una ciudad dada.
 * Si la ciudad no está en el catálogo, devuelve un arreglo genérico.
 */
export function getLocalidadesForCity(cityName) {
  if (!cityName) return [];
  const city = COLOMBIA_GEO[cityName];
  if (city && city.localidades) {
    return city.localidades.map(l => l.name);
  }
  return [];
}

/**
 * Obtiene las coordenadas centrales de una ciudad.
 */
export function getCityCoords(cityName) {
  if (!cityName) return { lat: 4.7110, lng: -74.0721 }; // Default Bogotá
  const city = COLOMBIA_GEO[cityName];
  return city?.coords || { lat: 4.7110, lng: -74.0721 };
}

/**
 * Obtiene las coordenadas aproximadas de una localidad/comuna dentro de una ciudad.
 */
export function getLocalidadCoords(cityName, localidadName) {
  if (!cityName) return getCityCoords('Bogotá D.C.');
  const city = COLOMBIA_GEO[cityName];
  if (!city) return { lat: 4.7110, lng: -74.0721 };
  if (!localidadName) return city.coords;

  const loc = (city.localidades || []).find(
    l => l.name.toLowerCase().includes(localidadName.toLowerCase()) ||
         localidadName.toLowerCase().includes(l.name.toLowerCase())
  );
  return loc ? loc.coords : city.coords;
}

/**
 * Extrae las ubicaciones únicas de los familiares registrados por el usuario.
 * @param {Array} clinicalRecords Lista de historias clínicas del usuario
 * @returns {Array} [{ patient_name, city, neighborhood, fullLocation }]
 */
export function getFamilyLocations(clinicalRecords = []) {
  if (!clinicalRecords || clinicalRecords.length === 0) return [];
  const list = [];
  const seen = new Set();

  for (const rec of clinicalRecords) {
    const city = rec.city || 'Bogotá D.C.';
    const neighborhood = rec.neighborhood || '';
    const key = `${city}__${neighborhood}`;
    if (!seen.has(key)) {
      seen.add(key);
      list.push({
        patient_name: rec.patient_name || 'Familiar',
        city,
        neighborhood,
        address: rec.address || '',
        fullLocation: neighborhood ? `${neighborhood}, ${city}` : city
      });
    }
  }
  return list;
}
