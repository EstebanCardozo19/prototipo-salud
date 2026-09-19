import { useState, useRef, useEffect, useMemo } from 'react';
import { useLang } from '../../contexts/LangContext';
import Spinner from '../common/Spinner';
import FamilyPatientPanel from '../patients/FamilyPatientPanel';
import CaregiverDashboard from '../dashboards/CaregiverDashboard';
import NurseDashboard from '../dashboards/NurseDashboard';
import { INPUT_CLASS, LABEL_CLASS } from '../../constants';
import { getRoleLabel } from '../../utils/helpers';
import { getCitiesList, getLocalidadesForCity } from '../../constants/colombiaGeo';

// ─── Clave en localStorage para las preferencias ──────────────
const PREFS_KEY = 'salud_user_prefs';

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
  } catch {
    return {};
  }
}

// ─── AccountPanel — edición de perfil para todos los roles ──
export default function AccountPanel({ user, token, onUserUpdate }) {
  const { t, lang, setLang } = useLang();
  const [activeTab, setActiveTab] = useState('profile');
  const [form, setForm] = useState({ full_name: user.full_name, email: user.email, phone: '' });
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [msg, setMsg] = useState(null);
  const [pwMsg, setPwMsg] = useState(null);
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifSms, setNotifSms] = useState(false);

  // ── Foto de perfil ──────────────────────────────────────────
  const [photoUrl, setPhotoUrl] = useState(user.photo_url || null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoMsg, setPhotoMsg] = useState(null);
  const fileInputRef = useRef(null);

  // ── Preferencias de ubicación ───────────────────────────────
  const savedPrefs = loadPrefs();
  const [prefCity, setPrefCity] = useState(savedPrefs.prefCity || '');
  const [prefLocality, setPrefLocality] = useState(savedPrefs.prefLocality || '');
  const [prefMsg, setPrefMsg] = useState(null);
  const [familyRecords, setFamilyRecords] = useState([]);

  const citiesList = useMemo(() => getCitiesList(), []);
  const availableLocalidades = useMemo(
    () => (prefCity ? getLocalidadesForCity(prefCity) : []),
    [prefCity]
  );

  // Cargar familiares para auto-detectar ubicaciones
  useEffect(() => {
    if (!token) return;
    fetch('/api/clinical-records/', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : [])
      .then(data => setFamilyRecords(Array.isArray(data) ? data : []))
      .catch(() => setFamilyRecords([]));
  }, [token]);

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setPhotoMsg(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload/profile-photo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || t('account.photoError'));
      }
      const updated = await res.json();
      setPhotoUrl(updated.photo_url);
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      const newUser = { ...stored, photo_url: updated.photo_url };
      localStorage.setItem('user', JSON.stringify(newUser));
      if (onUserUpdate) onUserUpdate(newUser);
      setPhotoMsg({ type: 'ok', text: t('account.photoOk') });
    } catch (err) {
      setPhotoMsg({ type: 'err', text: err.message || t('account.photoError') });
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleDeletePhoto = async () => {
    setUploadingPhoto(true);
    setPhotoMsg(null);
    try {
      await fetch('/api/upload/profile-photo', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setPhotoUrl(null);
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      const newUser = { ...stored, photo_url: null };
      localStorage.setItem('user', JSON.stringify(newUser));
      if (onUserUpdate) onUserUpdate(newUser);
      setPhotoMsg({ type: 'ok', text: t('account.photoDeleted') });
    } catch {
      setPhotoMsg({ type: 'err', text: t('account.deletePhotoError') });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const initials = user.full_name
    ? user.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const roleBadgeStyle = {
    family:    { bg: '#dae2ff', color: '#0040a1' },
    caregiver: { bg: '#d1fae5', color: '#065f46' },
    nurse:     { bg: '#ccfbf1', color: '#0f766e' },
    admin:     { bg: '#1f2937', color: '#ffffff' },
  }[user.role] || { bg: '#e5e7eb', color: '#374151' };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      const updated = { ...stored, full_name: form.full_name };
      localStorage.setItem('user', JSON.stringify(updated));
      if (onUserUpdate) onUserUpdate(updated);
      setMsg({ type: 'ok', text: t('account.savedOk') });
    } catch {
      setMsg({ type: 'err', text: t('account.saveError') });
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwMsg(null);
    if (pwForm.next !== pwForm.confirm) {
      setPwMsg({ type: 'err', text: t('account.passwordMismatch') });
      return;
    }
    if (pwForm.next.length < 6) {
      setPwMsg({ type: 'err', text: t('account.passwordShort') });
      return;
    }
    setSavingPw(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.next }),
      });
      if (res.ok) {
        setPwMsg({ type: 'ok', text: t('account.passwordOk') });
        setPwForm({ current: '', next: '', confirm: '' });
      } else {
        const d = await res.json();
        setPwMsg({ type: 'err', text: d.detail || t('account.passwordError') });
      }
    } catch {
      setPwMsg({ type: 'err', text: t('account.noConnection') });
    } finally {
      setSavingPw(false);
    }
  };

  // ── Guardar preferencias de ubicación ───────────────────────
  const savePreferences = () => {
    setPrefMsg(null);
    try {
      const prefs = loadPrefs();
      const updated = { ...prefs, prefCity, prefLocality, notifEmail, notifSms };
      localStorage.setItem(PREFS_KEY, JSON.stringify(updated));
      // Disparar evento para que SearchPanel pueda escuchar el cambio
      window.dispatchEvent(new CustomEvent('salud:prefsChanged', { detail: updated }));
      setPrefMsg({ type: 'ok', text: t('account.prefSaved') });
      setTimeout(() => setPrefMsg(null), 3000);
    } catch {
      setPrefMsg({ type: 'err', text: t('account.saveError') });
    }
  };

  // Aplicar ciudad/localidad de un familiar
  const applyFamilyLocation = (rec) => {
    if (rec.city) {
      setPrefCity(rec.city);
      setPrefLocality(rec.neighborhood || '');
    }
  };

  const sideNavItems = [
    { key: 'profile',     icon: 'person',            label: t('account.profile')     },
    ...(['caregiver', 'nurse'].includes(user.role) ? [{ key: 'professional-profile', icon: 'badge', label: 'Mi perfil profesional' }] : []),
    { key: 'security',    icon: 'lock',              label: t('account.security')    },
    { key: 'preferences', icon: 'tune',              label: t('account.preferences') },
    ...(user.role === 'family' ? [{ key: 'family', icon: 'group', label: t('account.myFamily') }] : []),
  ];

  return (
    <div className="flex h-full bg-[#f3f3f6] overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <div className="w-[220px] shrink-0 bg-white border-r border-[#c3c6d6]/40 flex flex-col py-8 px-4 gap-6">
        {/* Avatar y nombre */}
        <div className="flex flex-col items-center gap-2 pb-6 border-b border-[#c3c6d6]/40">
          <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={user.full_name}
                className="w-16 h-16 rounded-full object-cover border-2 border-[#0040a1]/20 shadow-md"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[#0040a1] text-white flex items-center justify-center text-2xl font-bold shadow-md">
                {initials}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploadingPhoto
                ? <Spinner sm />
                : <span className="material-symbols-outlined text-white text-[20px]">photo_camera</span>}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handlePhotoChange}
          />
          <p className="font-bold text-[15px] text-[#1a1c1e] text-center leading-tight">{user.full_name}</p>
          <p className="text-[12px] text-[#737785]">{user.email}</p>
          {/* Chip de ciudad preferida en sidebar */}
          {prefCity && (
            <div className="flex items-center gap-1 text-[11px] bg-[#dae2ff] text-[#0040a1] px-2.5 py-0.5 rounded-full font-semibold mt-0.5">
              <span className="material-symbols-outlined text-[12px]">location_on</span>
              {prefLocality ? `${prefLocality}, ${prefCity}` : prefCity}
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-1">
          {sideNavItems.map(item => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`flex items-center gap-3 px-4 h-[42px] rounded-xl text-[14px] font-semibold transition-all text-left ${
                activeTab === item.key
                  ? 'bg-[#f3f3f6] text-[#0040a1]'
                  : 'text-[#424654] hover:bg-[#f3f3f6] hover:text-[#0040a1]'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

      </div>

      {/* ── Contenido principal ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-8">
        <h2 className="text-[26px] font-bold text-[#0040a1] mb-8 flex items-center gap-3">
          <span className="material-symbols-outlined text-[28px]">manage_accounts</span>
          {t('account.title')}
        </h2>

        {/* ─ Profile ─ */}
        {activeTab === 'profile' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-6">
              {/* Header tarjeta */}
              <div className="flex items-center gap-4 mb-6 pb-5 border-b border-[#c3c6d6]/30">
                <div className="relative group shrink-0">
                  <div className="relative cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt={user.full_name}
                        className="w-20 h-20 rounded-full object-cover border-2 border-[#0040a1]/20 shadow-md"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-[#0040a1] text-white flex items-center justify-center text-3xl font-bold shadow-md">
                        {initials}
                      </div>
                    )}
                    <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {uploadingPhoto ? <Spinner sm /> : <span className="material-symbols-outlined text-white text-[22px]">photo_camera</span>}
                    </div>
                  </div>
                  {photoUrl && (
                    <button
                      type="button"
                      onClick={handleDeletePhoto}
                      disabled={uploadingPhoto}
                      className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all shadow-md"
                      title={t('account.deletePhoto')}
                    >
                      <span className="material-symbols-outlined text-[13px]">close</span>
                    </button>
                  )}
                </div>
                <div>
                  <p className="font-bold text-[18px] text-[#1a1c1e]">{user.full_name}</p>
                  <p className="text-[13px] text-[#737785]">{user.email}</p>
                  <span
                    className="inline-block mt-1.5 text-[11px] font-bold px-3 py-0.5 rounded-full"
                    style={{ background: roleBadgeStyle.bg, color: roleBadgeStyle.color }}
                  >
                    {getRoleLabel(user.role, lang)}
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="mt-2 flex items-center gap-1 text-[12px] text-[#0040a1] font-semibold hover:underline disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[14px]">upload</span>
                    {uploadingPhoto ? t('account.uploading') : t('account.changePhoto')}
                  </button>
                  {photoMsg && (
                    <p className={`text-[12px] mt-1 ${photoMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
                      {photoMsg.text}
                    </p>
                  )}
                </div>
              </div>
              <form onSubmit={saveProfile} className="flex flex-col gap-5">
                <div>
                  <label className={LABEL_CLASS}>{t('account.fullName')}</label>
                  <input
                    className={INPUT_CLASS}
                    value={form.full_name}
                    onChange={e => setForm({ ...form, full_name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>{t('account.email')}</label>
                  <input
                    className={`${INPUT_CLASS} bg-[#f3f3f6] cursor-not-allowed opacity-70`}
                    value={form.email}
                    disabled
                    title={t('account.emailCannotChange')}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>{t('account.phone')}</label>
                  <input
                    className={INPUT_CLASS}
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder={t('account.phonePlaceholder')}
                  />
                </div>
                {msg && <p className={`text-[13px] ${msg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</p>}
                <button
                  type="submit"
                  disabled={saving}
                  className="h-[46px] bg-[#0040a1] text-white rounded-xl font-bold text-[15px] hover:bg-[#003080] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {saving ? <Spinner sm /> : t('account.saveChanges')}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ─ Professional profile ─ */}
        {activeTab === 'professional-profile' && user.role === 'caregiver' && (
          <CaregiverDashboard user={user} token={token} showTabs={false} />
        )}
        {activeTab === 'professional-profile' && user.role === 'nurse' && (
          <NurseDashboard user={user} token={token} showTabs={false} />
        )}

        {/* ─ Security ─ */}
        {activeTab === 'security' && (
          <div className="max-w-xl">
            <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-6">
              <h3 className="font-bold text-[17px] text-[#1a1c1e] mb-5 flex items-center gap-2">
                <span className="material-symbols-outlined text-[22px] text-[#0040a1]">lock</span>
                {t('account.changePassword')}
              </h3>
              <form onSubmit={savePassword} className="flex flex-col gap-5">
                <div>
                  <label className={LABEL_CLASS}>{t('account.currentPassword')}</label>
                  <input
                    className={INPUT_CLASS}
                    type="password"
                    value={pwForm.current}
                    onChange={e => setPwForm({ ...pwForm, current: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>{t('account.newPassword')}</label>
                  <input
                    className={INPUT_CLASS}
                    type="password"
                    value={pwForm.next}
                    onChange={e => setPwForm({ ...pwForm, next: e.target.value })}
                    required
                    minLength={6}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>{t('account.confirmPassword')}</label>
                  <input
                    className={INPUT_CLASS}
                    type="password"
                    value={pwForm.confirm}
                    onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })}
                    required
                    minLength={6}
                  />
                </div>
                {pwMsg && (
                  <p className={`text-[13px] ${pwMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                    {pwMsg.text}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={savingPw}
                  className="h-[46px] bg-[#0040a1] text-white rounded-xl font-bold text-[15px] hover:bg-[#003080] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {savingPw ? <Spinner sm /> : t('account.updatePassword')}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ─ Preferences ─ */}
        {activeTab === 'preferences' && (
          <div className="max-w-2xl flex flex-col gap-5">

            {/* ─ Tarjeta: Ubicación de búsqueda predeterminada ─ */}
            <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-6">
              <h3 className="font-bold text-[17px] text-[#1a1c1e] mb-1 flex items-center gap-2">
                <span className="material-symbols-outlined text-[22px] text-[#0040a1]">my_location</span>
                {t('account.prefLocationTitle')}
              </h3>
              <p className="text-[13px] text-[#737785] mb-5">{t('account.prefLocationHint')}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {/* Ciudad preferida */}
                <div>
                  <label className={LABEL_CLASS}>{t('geo.preferredCity')}</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#0040a1] text-[17px] pointer-events-none">
                      location_city
                    </span>
                    <select
                      className="w-full h-[42px] pl-9 pr-7 rounded-xl border border-[#c3c6d6] bg-white appearance-none focus:border-[#0040a1] focus:ring-2 focus:ring-[#0040a1]/15 focus:outline-none text-[14px]"
                      value={prefCity}
                      onChange={e => {
                        setPrefCity(e.target.value);
                        setPrefLocality('');
                      }}
                    >
                      <option value="">{t('geo.allCities')}</option>
                      {citiesList.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#737785] text-[17px]">
                      expand_more
                    </span>
                  </div>
                </div>

                {/* Localidad preferida */}
                <div>
                  <label className={LABEL_CLASS}>{t('geo.preferredLocality')}</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#0040a1]/70 text-[17px] pointer-events-none">
                      pin_drop
                    </span>
                    <select
                      className="w-full h-[42px] pl-9 pr-7 rounded-xl border border-[#c3c6d6] bg-white appearance-none focus:border-[#0040a1] focus:ring-2 focus:ring-[#0040a1]/15 focus:outline-none text-[14px] disabled:bg-[#f3f3f6] disabled:text-[#737785]"
                      value={prefLocality}
                      onChange={e => setPrefLocality(e.target.value)}
                      disabled={!prefCity || availableLocalidades.length === 0}
                    >
                      <option value="">
                        {prefCity ? t('geo.allLocalities') : t('geo.selectCityFirst')}
                      </option>
                      {availableLocalidades.map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#737785] text-[17px]">
                      expand_more
                    </span>
                  </div>
                </div>
              </div>

              {/* Preview de la preferencia activa */}
              {prefCity && (
                <div className="flex items-center gap-2 bg-[#f0f4fd] border border-[#0040a1]/15 rounded-xl px-4 py-3 mb-4">
                  <span className="material-symbols-outlined text-[#0040a1] text-[20px]">location_on</span>
                  <div>
                    <p className="text-[13px] font-bold text-[#0040a1]">
                      {prefLocality ? `${prefLocality}, ${prefCity}` : prefCity}
                    </p>
                    <p className="text-[11px] text-[#737785]">{t('geo.preferredCityHint')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setPrefCity(''); setPrefLocality(''); }}
                    className="ml-auto text-[11px] text-[#e11d48] font-semibold hover:underline flex items-center gap-0.5"
                  >
                    <span className="material-symbols-outlined text-[13px]">close</span>
                    {t('account.prefReset')}
                  </button>
                </div>
              )}
            </div>

            {/* ─ Tarjeta: Ubicaciones de familiares ─ */}
            <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-6">
              <h3 className="font-bold text-[17px] text-[#1a1c1e] mb-1 flex items-center gap-2">
                <span className="material-symbols-outlined text-[22px] text-[#0040a1]">family_restroom</span>
                {t('account.prefFromFamilyTitle')}
              </h3>
              <p className="text-[13px] text-[#737785] mb-4">{t('account.prefFromFamilyHint')}</p>

              {familyRecords.length === 0 ? (
                <div className="flex items-center gap-3 bg-[#f3f3f6] rounded-xl px-4 py-4">
                  <span className="material-symbols-outlined text-[#c3c6d6] text-[28px]">person_search</span>
                  <p className="text-[13px] text-[#737785]">{t('geo.noFamilyDetected')}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {familyRecords.map(rec => {
                    const city = rec.city || '';
                    const locality = rec.neighborhood || '';
                    const isActive = prefCity === city && prefLocality === locality;

                    return (
                      <div
                        key={rec.id}
                        className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#dae2ff]/60 border-[#0040a1]/40 shadow-sm'
                            : 'bg-[#f9f9fc] border-[#c3c6d6]/50 hover:border-[#0040a1]/30 hover:bg-[#f0f4fd]'
                        }`}
                        onClick={() => applyFamilyLocation(rec)}
                      >
                        {/* Icono + Nombre */}
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-[14px] shrink-0 ${
                            isActive ? 'bg-[#0040a1]' : 'bg-[#6b7cf6]'
                          }`}>
                            {rec.patient_name?.charAt(0) || '?'}
                          </div>
                          <div>
                            <p className="font-bold text-[14px] text-[#1a1c1e] leading-tight">{rec.patient_name}</p>
                            {city ? (
                              <p className="text-[12px] text-[#737785] flex items-center gap-1 mt-0.5">
                                <span className="material-symbols-outlined text-[13px] text-[#0040a1]/60">location_on</span>
                                {locality ? `${locality}, ${city}` : city}
                              </p>
                            ) : (
                              <p className="text-[12px] text-[#737785] italic">Sin ubicación registrada</p>
                            )}
                          </div>
                        </div>

                        {/* Badge de estado */}
                        {isActive ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold bg-[#0040a1] text-white px-2.5 py-1 rounded-full shrink-0">
                            <span className="material-symbols-outlined text-[13px]">check</span>
                            Activa
                          </span>
                        ) : city ? (
                          <span className="text-[11px] font-semibold text-[#0040a1] shrink-0 flex items-center gap-1 opacity-70">
                            {t('account.prefApplyFrom')}
                            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ─ Tarjeta: Idioma de la aplicación ─ */}
            <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-6">
              <h3 className="font-bold text-[17px] text-[#1a1c1e] mb-1 flex items-center gap-2">
                <span className="material-symbols-outlined text-[22px] text-[#0040a1]">language</span>
                {lang === 'es' ? 'Idioma de la aplicación' : 'Application language'}
              </h3>
              <p className="text-[13px] text-[#737785] mb-4">
                {lang === 'es'
                  ? 'Elige el idioma en que quieres ver la plataforma.'
                  : 'Choose the language you want to use in the platform.'}
              </p>
              <div className="flex gap-3">
                {[
                  { code: 'es', flag: '🇨🇴', name: 'Español',  hint: 'Español (Colombia)' },
                  { code: 'en', flag: '🇺🇸', name: 'English',  hint: 'English (US)' },
                ].map(opt => (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => setLang(opt.code)}
                    className={`flex-1 flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all text-left ${
                      lang === opt.code
                        ? 'border-[#0040a1] bg-[#f0f4fd] shadow-sm'
                        : 'border-[#c3c6d6]/50 bg-white hover:border-[#0040a1]/40 hover:bg-[#f9f9fc]'
                    }`}
                  >
                    <span className="text-[28px] leading-none">{opt.flag}</span>
                    <div>
                      <p className={`font-bold text-[14px] ${lang === opt.code ? 'text-[#0040a1]' : 'text-[#1a1c1e]'}`}>
                        {opt.name}
                      </p>
                      <p className="text-[11px] text-[#737785]">{opt.hint}</p>
                    </div>
                    {lang === opt.code && (
                      <span className="ml-auto material-symbols-outlined text-[#0040a1] text-[20px]">check_circle</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* ─ Tarjeta: Notificaciones ─ */}
            <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-6">
              <h3 className="font-bold text-[17px] text-[#1a1c1e] mb-5 flex items-center gap-2">
                <span className="material-symbols-outlined text-[22px] text-[#0040a1]">notifications</span>
                {t('account.notifTitle')}
              </h3>
              <div className="flex flex-col gap-5">
                {[
                  { key: 'email', label: t('account.notifEmail'), desc: t('account.notifEmailDesc'), val: notifEmail, set: setNotifEmail },
                  { key: 'sms',   label: t('account.notifSms'),   desc: t('account.notifSmsDesc'),   val: notifSms,   set: setNotifSms   },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-[14px] text-[#1a1c1e]">{item.label}</p>
                      <p className="text-[12px] text-[#737785]">{item.desc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => item.set(v => !v)}
                      className={`w-12 h-6 rounded-full transition-colors shrink-0 relative ${item.val ? 'bg-[#0040a1]' : 'bg-[#c3c6d6]'}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${item.val ? 'left-6' : 'left-0.5'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Botón Guardar todo */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={savePreferences}
                className="h-[46px] px-8 bg-[#0040a1] text-white rounded-xl font-bold text-[15px] hover:bg-[#003080] transition-all flex items-center gap-2 shadow-sm"
              >
                <span className="material-symbols-outlined text-[20px]">save</span>
                {t('account.prefSave')}
              </button>
              {prefMsg && (
                <p className={`text-[13px] font-semibold ${prefMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                  {prefMsg.text}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ─ My Family (CRUD completo) ─ */}
        {activeTab === 'family' && user.role === 'family' && (
          <FamilyPatientPanel token={token} />
        )}
      </div>
    </div>
  );
}
