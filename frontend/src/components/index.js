// Archivo índice para exportar todos los componentes principales

// Common
export { default as Spinner } from './common/Spinner';
export { default as AuthScreen } from './common/AuthScreen';
export { default as TopBar } from './common/TopBar';
export { default as MainScreen } from './common/MainScreen';
export { default as GoogleMap } from './common/GoogleMap';
export { default as GooglePlacesAutocomplete } from './common/GooglePlacesAutocomplete';

// Professionals
export { default as ProfessionalCard } from './professionals/ProfessionalCard';
export { default as CaregiverCard } from './professionals/CaregiverCard';
export { default as NurseCard } from './professionals/NurseCard';
export { default as SearchPanel } from './professionals/SearchPanel';
export { default as ProfessionalDetailModal } from './professionals/ProfessionalDetailModal';

// Bookings
export { default as BookingModal } from './bookings/BookingModal';

// Chat
export { default as ChatPanel } from './chat/ChatPanel';

// Dashboards
export { CaregiverDashboard, NurseDashboard, AdminDashboard, ProfessionalPanel } from './dashboards';

// Patients
export { FamilyPatientPanel, FamilyCalendar, PatientCard, PatientFormModal } from './patients';

// Account
export { AccountPanel } from './account';
