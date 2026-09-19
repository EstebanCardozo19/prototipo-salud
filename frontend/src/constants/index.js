// ─── Constantes globales ─────────────────────────────────────

export * from './colombiaGeo';

export const LOCALIDADES = [
  '', 'Usaquén', 'Chapinero', 'Santa Fe', 'San Cristóbal', 'Usme',
  'Tunjuelito', 'Bosa', 'Kennedy', 'Fontibón', 'Engativá',
  'Suba', 'Barrios Unidos', 'Teusaquillo', 'Los Mártires',
  'Antonio Nariño', 'Puente Aranda', 'La Candelaria', 'Rafael Uribe Uribe',
];

export const SPECIALTIES_KEYS = [
  'general', 'geriatrics', 'neurology', 'cardiology', 'pulmonology',
  'psychiatry', 'physiatry', 'palliative', 'internal_medicine',
  'endocrinology', 'nephrology', 'orthopedics'
];

export const SPECIALTIES = {
  general: 'Medicina General',
  geriatrics: 'Geriatría',
  neurology: 'Neurología',
  cardiology: 'Cardiología',
  pulmonology: 'Neumología',
  psychiatry: 'Psiquiatría',
  physiatry: 'Fisiatría',
  palliative: 'Cuidados Paliativos',
  internal_medicine: 'Medicina Interna',
  endocrinology: 'Endocrinología',
  nephrology: 'Nefrología',
  orthopedics: 'Ortopedia',
};

export const MOBILITY_OPTIONS_KEYS = ['independiente', 'asistida', 'postrado', 'silla_ruedas'];

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const EMPTY_PATIENT = {
  patient_name: '',
  patient_age: '',
  blood_type: '',
  diagnoses: '',
  takes_medications: false,
  medications: '',
  allergies: '',
  mobility_level: 'independiente',
  special_needs: '',
  emergency_contact: '',
  address: '',
  neighborhood: '',
  city: 'Bogotá D.C.',
  floor_number: '',
  is_apartment: false,
  has_elevator: false,
  housing_notes: '',
  eps: '',
  prepaid_medicine: 'Ninguna',
  preferred_hospital: '',
};

export const TEMPLATES_KEY = 'salud_need_templates';

// Estilos comunes
export const INPUT_CLASS = 'w-full h-[42px] px-4 rounded-xl border border-[#c3c6d6] bg-white focus:border-[#0040a1] focus:ring-2 focus:ring-[#0040a1]/15 focus:outline-none text-[14px]';
export const LABEL_CLASS = 'block text-[12px] font-semibold text-[#424654] mb-1';
