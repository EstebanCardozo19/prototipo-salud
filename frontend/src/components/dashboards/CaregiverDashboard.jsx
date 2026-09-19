import { useState, useEffect, useMemo } from 'react';
import { useLang } from '../../contexts/LangContext';
import Spinner from '../common/Spinner';
import StarRating from '../common/StarRating';
import RateServiceModal from '../bookings/RateServiceModal';
import BookingFamilyInfo from '../bookings/BookingFamilyInfo';
import ServiceChatModal from '../bookings/ServiceChatModal';
import ServiceCarePlanModal from '../bookings/ServiceCarePlanModal';
import ProfessionalPatientAssistantModal from '../bookings/ProfessionalPatientAssistantModal';
import { INPUT_CLASS, LABEL_CLASS } from '../../constants';
import { getCitiesList, getLocalidadesForCity } from '../../constants/colombiaGeo';
import VerificationSection from './VerificationSection';

const STATUS_LABEL = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', completed: 'Completado', cancelled: 'Cancelado' };
const STATUS_COLOR = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-[#f3f3f6] text-[#737785]',
};

// ─── CaregiverDashboard ──────────────────────────────────────
export default function CaregiverDashboard({ user, token, initialTab = 'profile', showTabs = true }) {
  const { t } = useLang();
  const [activeTab, setActiveTab] = useState(initialTab); // 'profile' | 'services'
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);

  // Servicios / bookings
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [completing, setCompleting] = useState(null); // booking id being completed
  const [ratingModal, setRatingModal] = useState(null); // booking to rate
  const [chatBooking, setChatBooking] = useState(null);
  const [carePlanBooking, setCarePlanBooking] = useState(null);
  const [assistantBooking, setAssistantBooking] = useState(null);

  // Mis reseñas recibidas
  const [myReviews, setMyReviews] = useState([]);

  const [selectedCity, setSelectedCity] = useState('Bogotá D.C.');
  const [selectedLocalidad, setSelectedLocalidad] = useState('');
  const citiesList = useMemo(() => getCitiesList(), []);
  const availableLocalidades = useMemo(() => (selectedCity ? getLocalidadesForCity(selectedCity) : []), [selectedCity]);

  useEffect(() => { loadProfile(); }, []);

  useEffect(() => {
    if (activeTab === 'services') {
      loadBookings();
    }
  }, [activeTab]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/caregivers/me', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const mine = await res.json();
        if (mine) {
          setProfile(mine);
          setForm(mine);
          if (mine.location) {
            const parts = mine.location.split(',').map(s => s.trim());
            if (parts.length > 1) { setSelectedLocalidad(parts[0]); setSelectedCity(parts[1]); }
            else { setSelectedLocalidad(mine.location); }
          }
          // Cargar reseñas del profesional
          const rv = await fetch(`/api/bookings/reviews/${mine.user_id}`, { headers: { Authorization: `Bearer ${token}` } });
          if (rv.ok) setMyReviews(await rv.json());
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadBookings = async () => {
    setLoadingBookings(true);
    try {
      const res = await fetch('/api/bookings/incoming', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setBookings(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoadingBookings(false); }
  };

  const handleComplete = async (bookingId) => {
    setCompleting(bookingId);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/complete`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'completed' } : b));
      }
    } catch (e) { console.error(e); }
    finally { setCompleting(null); }
  };

  const handleDecide = async (bookingId, decision) => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/decide`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: decision }),
      });
      if (res.ok) {
        setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: decision } : b));
      }
    } catch (e) { console.error(e); }
  };

  const save = async (e) => {
    e.preventDefault();
    const fullLocation = selectedLocalidad ? `${selectedLocalidad}, ${selectedCity}` : selectedCity;
    try {
      const res = await fetch('/api/caregivers/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bio: form.bio, location: fullLocation, experience_years: form.experience_years, hourly_rate: form.hourly_rate }),
      });
      if (res.ok) { setProfile(await res.json()); setEditing(false); }
    } catch (e) { console.error(e); }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner /></div>;

  const avgRating = profile?.rating_avg ?? 5.0;
  const ratingCount = profile?.rating_count ?? 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ─── Tabs ── */}
      {showTabs && <div className="flex border-b border-[#c3c6d6]/40 bg-white shrink-0 px-6 pt-6 gap-1">
        {[
          { id: 'profile',  icon: 'account_circle', label: 'Mi Perfil' },
          { id: 'services', icon: 'calendar_month',  label: 'Mis Servicios' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === tab.id ? 'border-[#0040a1] text-[#0040a1]' : 'border-transparent text-[#737785] hover:text-[#424654]'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>}

      <div className="flex-1 overflow-y-auto p-6 sm:p-8">

        {/* ══ TAB: PERFIL ══ */}
        {activeTab === 'profile' && (
          <>
          <div className="mx-auto w-full max-w-7xl space-y-6">
            <h2 className="text-[22px] font-bold text-[#0040a1] mb-5 flex items-center gap-3">
              <span className="material-symbols-outlined text-[26px]">account_circle</span>
              {t('caregiver_dash.title')}
            </h2>

            {!profile ? (
              <div className="bg-[#dae2ff]/40 border border-[#0040a1]/20 rounded-2xl p-6 text-[#0040a1]">
                {t('caregiver_dash.pending')}
              </div>
            ) : !editing ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
                <div className="h-full bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm overflow-hidden">
                  <div className="flex flex-col gap-4 border-b border-[#c3c6d6]/30 bg-[#f9f9fc] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[12px] font-bold uppercase tracking-wide text-[#737785]">Calificación</p>
                      <div className="mt-1 flex items-center gap-3">
                        <span className="text-[32px] font-black leading-none text-amber-500">{avgRating.toFixed(1)}</span>
                        <div>
                          <StarRating value={avgRating} readOnly size="sm" />
                          <p className="mt-0.5 text-[12px] text-[#737785]">{ratingCount} {ratingCount === 1 ? 'calificación' : 'calificaciones'}</p>
                        </div>
                      </div>
                    </div>
                    {ratingCount === 0 && (
                      <p className="max-w-xs text-[12px] text-amber-700 sm:text-right">Tu calificación cambiará cuando recibas reseñas por tus servicios.</p>
                    )}
                  </div>
                  <div className="space-y-3 p-6">
                  {[
                    [t('caregiver_dash.name'), profile.full_name],
                    [t('caregiver_dash.locality'), profile.location],
                    [t('caregiver_dash.experience'), `${profile.experience_years} ${t('professional.years')}`],
                    [t('caregiver_dash.rate'), `$${profile.hourly_rate?.toLocaleString()}/h`],
                    [t('caregiver_dash.bio'), profile.bio || t('caregiver_dash.noBio')],
                  ].map(([k, v]) => (
                    <p key={k} className="text-[14px]">
                      <span className="font-semibold text-[#424654]">{k}:</span>{' '}
                      <span className="text-[#1a1c1e]">{v}</span>
                    </p>
                  ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#c3c6d6]/30 px-6 py-4">
                    <span className={`inline-block text-[12px] font-bold px-3 py-1 rounded-full ${profile.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {profile.status === 'approved' ? t('bookingStatus.approved') : t('bookingStatus.pending')}
                    </span>
                    <button onClick={() => setEditing(true)} className="h-[40px] px-6 bg-[#0040a1] text-white rounded-xl font-semibold text-[14px] hover:bg-[#003080] transition-all">
                      {t('caregiver_dash.editProfile')}
                    </button>
                  </div>
                </div>

                {/* Reseñas recibidas */}
                {myReviews.length > 0 && (
                  <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-5">
                    <p className="text-[13px] font-bold text-[#424654] uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      Reseñas recibidas ({myReviews.length})
                    </p>
                    <div className="flex flex-col gap-2.5 max-h-[260px] overflow-y-auto pr-1">
                      {myReviews.map(r => (
                        <div key={r.id} className="bg-[#f9f9fc] rounded-xl p-3 border border-[#c3c6d6]/30">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[13px] font-semibold text-[#1a1c1e]">{r.family_name || 'Familiar'}</span>
                            <StarRating value={r.rating} readOnly size="sm" />
                          </div>
                          {r.comment && <p className="text-[12px] text-[#424654]">{r.comment}</p>}
                          {r.created_at && <p className="text-[10px] text-[#737785] mt-1">{new Date(r.created_at).toLocaleDateString('es-CO')}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <VerificationSection token={token} className="md:mt-0 h-full" />
              </div>
            ) : (
              <form onSubmit={save} className="max-w-3xl bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLASS}>{t('geo.city')}</label>
                    <select className={INPUT_CLASS} value={selectedCity} onChange={e => { setSelectedCity(e.target.value); setSelectedLocalidad(''); }}>
                      {citiesList.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>{t('geo.locality')}</label>
                    <select className={INPUT_CLASS} value={selectedLocalidad} onChange={e => setSelectedLocalidad(e.target.value)}>
                      <option value="">{t('geo.allLocalities')}</option>
                      {availableLocalidades.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                </div>
                {[
                  [t('caregiver_dash.yearsExp'), 'number', 'experience_years'],
                  [t('caregiver_dash.ratePerHour'), 'number', 'hourly_rate'],
                ].map(([lbl, type, key]) => (
                  <div key={key}>
                    <label className={LABEL_CLASS}>{lbl}</label>
                    <input className={INPUT_CLASS} type={type} value={form[key] ?? ''} onChange={e => setForm({ ...form, [key]: +e.target.value })} />
                  </div>
                ))}
                <div>
                  <label className={LABEL_CLASS}>{t('caregiver_dash.bio')}</label>
                  <textarea className="w-full px-4 py-2 rounded-xl border border-[#c3c6d6] focus:border-[#0040a1] focus:ring-2 focus:ring-[#0040a1]/15 focus:outline-none text-[14px]" rows={3} value={form.bio || ''} onChange={e => setForm({ ...form, bio: e.target.value })} />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="submit" className="h-[40px] px-6 bg-[#0040a1] text-white rounded-xl font-semibold text-[14px] hover:bg-[#003080] transition-all">{t('caregiver_dash.save')}</button>
                  <button type="button" onClick={() => setEditing(false)} className="h-[40px] px-6 bg-[#f3f3f6] text-[#424654] rounded-xl font-semibold text-[14px] hover:bg-[#e8e8ea] transition-all">{t('caregiver_dash.cancel')}</button>
                </div>
              </form>
            )}
          </div>
          </>
        )}

        {/* ══ TAB: SERVICIOS ══ */}
        {activeTab === 'services' && (
          <div className="max-w-2xl">
            <h2 className="text-[20px] font-bold text-[#0040a1] mb-5 flex items-center gap-3">
              <span className="material-symbols-outlined text-[24px]">calendar_month</span>
              Mis Servicios
            </h2>

            {loadingBookings ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : bookings.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <span className="material-symbols-outlined text-[48px] text-[#c3c6d6] mb-3">calendar_month</span>
                <p className="text-[16px] font-semibold text-[#424654]">No tienes solicitudes aún</p>
                <p className="text-[13px] text-[#737785] mt-1">Aquí aparecerán los servicios que los familiares te soliciten</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {bookings.map(b => (
                  <div key={b.id} className="bg-white border border-[#c3c6d6]/50 rounded-2xl p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="text-[15px] font-bold text-[#1a1c1e]">{b.family_name || 'Familiar'}</p>
                        <p className="text-[13px] text-[#737785]">{b.date} · {b.start_hour}:00 – {b.end_hour}:00 h</p>
                      </div>
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_COLOR[b.status] || 'bg-[#f3f3f6] text-[#737785]'}`}>
                        {STATUS_LABEL[b.status] || b.status}
                      </span>
                    </div>
                    <BookingFamilyInfo booking={b} />
                    {b.notes && (
                      <p className="text-[13px] text-[#424654] bg-[#f9f9fc] rounded-xl px-3 py-2 border border-[#c3c6d6]/30 mb-3 line-clamp-2">{b.notes}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {/* Aprobar / Rechazar si pending */}
                      {b.status === 'pending' && (
                        <>
                          <button onClick={() => handleDecide(b.id, 'approved')} className="h-[34px] px-4 bg-[#0040a1] text-white rounded-xl text-[12px] font-semibold hover:bg-[#003080] transition-all flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[15px]">check_circle</span>Aprobar
                          </button>
                          <button onClick={() => handleDecide(b.id, 'rejected')} className="h-[34px] px-4 bg-red-50 text-red-600 border border-red-200 rounded-xl text-[12px] font-semibold hover:bg-red-100 transition-all flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[15px]">cancel</span>Rechazar
                          </button>
                        </>
                      )}
                      {/* Completar si approved */}
                      {b.status === 'approved' && (
                        <>
                          <button onClick={() => setChatBooking(b)} className="h-[34px] px-4 bg-[#0040a1] text-white rounded-xl text-[12px] font-semibold hover:bg-[#003080] transition-all flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[15px]">forum</span>Chat del servicio
                          </button>
                          <button onClick={() => setCarePlanBooking(b)} className="h-[34px] px-4 bg-cyan-700 text-white rounded-xl text-[12px] font-semibold hover:bg-cyan-800 transition-all flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[15px]">medication</span>Plan y asistente
                          </button>
                          <button onClick={() => setAssistantBooking(b)} className="h-[34px] px-4 bg-violet-700 text-white rounded-xl text-[12px] font-semibold hover:bg-violet-800 transition-all flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[15px]">clinical_notes</span>Asistente del paciente
                          </button>
                          <button
                            onClick={() => handleComplete(b.id)}
                            disabled={completing === b.id}
                            className="h-[34px] px-4 bg-green-600 text-white rounded-xl text-[12px] font-semibold hover:bg-green-700 transition-all flex items-center gap-1.5 disabled:opacity-60"
                          >
                            {completing === b.id ? <Spinner sm /> : <><span className="material-symbols-outlined text-[15px]">task_alt</span>Marcar completado</>}
                          </button>
                        </>
                      )}
                      {/* Calificar familiar si completed y no calificado */}
                      {b.status === 'completed' && !b.reviewed_by_professional && (
                        <button
                          onClick={() => setRatingModal(b)}
                          className="h-[34px] px-4 bg-amber-500 text-white rounded-xl text-[12px] font-semibold hover:bg-amber-600 transition-all flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                          Calificar familiar
                        </button>
                      )}
                      {b.status === 'completed' && b.reviewed_by_professional && (
                        <span className="h-[34px] px-3 flex items-center gap-1.5 text-[12px] text-green-700 font-semibold bg-green-50 rounded-xl border border-green-200">
                          <span className="material-symbols-outlined text-[15px]">check_circle</span>Familiar calificado
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de calificación */}
      {ratingModal && (
        <RateServiceModal
          booking={ratingModal}
          token={token}
          role={user.role}
          onClose={() => setRatingModal(null)}
          onSuccess={() => {
            setBookings(prev => prev.map(b => b.id === ratingModal.id ? { ...b, reviewed_by_professional: true } : b));
            setRatingModal(null);
          }}
        />
      )}
      {chatBooking && <ServiceChatModal booking={chatBooking} user={user} token={token} onClose={() => setChatBooking(null)} />}
      {carePlanBooking && <ServiceCarePlanModal booking={carePlanBooking} user={user} token={token} onClose={() => setCarePlanBooking(null)} />}
      {assistantBooking && <ProfessionalPatientAssistantModal booking={assistantBooking} token={token} onClose={() => setAssistantBooking(null)} />}
    </div>
  );
}
