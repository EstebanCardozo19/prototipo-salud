import { useState } from 'react';
import { useLang } from '../../contexts/LangContext';
import TopBar from './TopBar';
import SearchPanel from '../professionals/SearchPanel';
import ChatPanel from '../chat/ChatPanel';
import { CaregiverDashboard, NurseDashboard, AdminDashboard, ProfessionalPanel, ProfessionalCalendar, AvailabilityManager } from '../dashboards';
import AccountPanel from '../account/AccountPanel';
import FamilyCalendar from '../patients/FamilyCalendar';
import ServiceChatsModal from '../bookings/ServiceChatsModal';
import MedicationsScreen from '../medications/MedicationsScreen';

// ─── MainScreen ──────────────────────────────────────────────
export default function MainScreen({ user, token, onLogout, onUnauthorized, onUserUpdate }) {
  const { t } = useLang();
  const [activeNav, setActiveNav] = useState(
    user.role === 'admin' ? 'users' : user.role === 'family' ? 'caregivers' : 'account'
  );
  const [serviceChats, setServiceChats] = useState(null);

  const handleNav = (key) => setActiveNav(key);
  const handleOpenMessages = (bookingId) => setServiceChats({ initialBookingId: bookingId });

  const serviceChatsModal = serviceChats && (
    <ServiceChatsModal
      user={user}
      token={token}
      initialBookingId={serviceChats.initialBookingId}
      onClose={() => setServiceChats(null)}
    />
  );

  // 'account' es transversal a todos los roles
  if (activeNav === 'account') {
    return (
      <div className="h-screen flex flex-col bg-[#f3f3f6] font-sans overflow-hidden">
        <TopBar user={user} token={token} activeNav={activeNav} onNav={handleNav} onLogout={onLogout} onOpenMessages={handleOpenMessages} />
        <main className="flex-1 overflow-hidden relative z-10">
          <AccountPanel user={user} token={token} onUserUpdate={onUserUpdate} />
          {serviceChatsModal}
        </main>
      </div>
    );
  }

  const renderMain = () => {
    if (user.role === 'family') {
      if (activeNav === 'calendar') {
        return <FamilyCalendar token={token} />;
      }
      if (activeNav === 'medications') {
        return <MedicationsScreen user={user} token={token} />;
      }
      return (
        <div className="flex h-full">
          <div className={`flex-1 overflow-hidden ${activeNav !== 'my-requests' ? 'border-r border-[#c3c6d6]/30' : ''}`}>
            <SearchPanel user={user} token={token} activeTab={activeNav} onTabChange={setActiveNav} />
          </div>
          {activeNav !== 'my-requests' && (
            <div className="w-[300px] xl:w-[340px] shrink-0">
              <ChatPanel user={user} token={token} onUnauthorized={onUnauthorized} />
            </div>
          )}
        </div>
      );
    }
    if (user.role === 'caregiver') {
      if (activeNav === 'calendar') return <ProfessionalCalendar token={token} />;
      if (activeNav === 'availability') return <AvailabilityManager token={token} />;
      if (activeNav === 'medications') return <MedicationsScreen user={user} token={token} />;
      return (
        <div className="flex h-full">
          <div className={`flex-1 overflow-hidden ${activeNav !== 'my-requests' ? 'border-r border-[#c3c6d6]/30' : ''}`}>
            <CaregiverDashboard user={user} token={token} initialTab="services" showTabs={false} />
          </div>
          {activeNav !== 'my-requests' && (
            <div className="w-[320px] shrink-0">
              <ProfessionalPanel user={user} token={token} />
            </div>
          )}
        </div>
      );
    }
    if (user.role === 'nurse') {
      if (activeNav === 'calendar') return <ProfessionalCalendar token={token} />;
      if (activeNav === 'availability') return <AvailabilityManager token={token} />;
      if (activeNav === 'medications') return <MedicationsScreen user={user} token={token} />;
      return (
        <div className="flex h-full">
          <div className={`flex-1 overflow-hidden ${activeNav !== 'my-requests' ? 'border-r border-[#c3c6d6]/30' : ''}`}>
            <NurseDashboard user={user} token={token} initialTab="services" showTabs={false} />
          </div>
          {activeNav !== 'my-requests' && (
            <div className="w-[320px] shrink-0">
              <ProfessionalPanel user={user} token={token} />
            </div>
          )}
        </div>
      );
    }
    if (user.role === 'admin') {
      return (
        <div className="h-full overflow-hidden">
          <AdminDashboard token={token} />
        </div>
      );
    }
    return (
      <div className="p-8">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-amber-800">
          {t('common.invalidSession')}
        </div>
        <button
          onClick={onLogout}
          className="mt-4 h-[40px] px-6 bg-[#0040a1] text-white rounded-xl font-semibold"
        >
          {t('common.sessionExpired')}
        </button>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-[#f3f3f6] font-sans overflow-hidden">
      <div className="bg-shape bg-[#0040a1]/15 w-[500px] h-[500px] -top-20 -left-32" />
      <div className="bg-shape bg-[#8df1e3]/20 w-[600px] h-[600px] top-1/3 right-1/4" style={{ animationDelay: '-5s' }} />
      <div className="bg-shape bg-[#dae2ff]/20 w-[400px] h-[400px] -bottom-20 right-10" style={{ animationDelay: '-10s' }} />
      <TopBar user={user} token={token} activeNav={activeNav} onNav={handleNav} onLogout={onLogout} onOpenMessages={handleOpenMessages} />
      <main className="flex-1 overflow-hidden relative z-10">
        {renderMain()}
        {serviceChatsModal}
      </main>
    </div>
  );
}
