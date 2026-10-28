import { useState, useRef, useEffect, useMemo } from 'react';
import { useLang } from '../../contexts/LangContext';
import Spinner from '../common/Spinner';
import FamilyPatientPanel from '../patients/FamilyPatientPanel';
import CaregiverDashboard from '../dashboards/CaregiverDashboard';
import NurseDashboard from '../dashboards/NurseDashboard';
import { INPUT_CLASS, LABEL_CLASS } from '../../constants';
import { getAssetUrl, getRoleLabel } from '../../utils/helpers';
import { BOGOTA_CITY, getLocalidadesForCity } from '../../constants/colombiaGeo';
import { getPasswordValidation } from '../../utils/password';

const SECURITY_QUESTIONS = [
  'first_pet', 'birth_city', 'favorite_teacher', 'childhood_friend', 'favorite_book', 'mother_middle_name',
];

// ─── Clave en localStorage para las preferencias ──────────────
const PREFS_KEY = 'salud_user_prefs';
const COLOMBIAN_MOBILE_PHONE = /^3\d{9}$/;

function PasswordRequirements({ validation, t }) {
  return (
    <ul className="mt-2 space-y-1 text-[12px]" aria-live="polite">
      {validation.requirements.map(requirement => (
        <li key={requirement.key} className={`flex items-center gap-1.5 ${requirement.met ? 'text-green-600' : 'text-[#737785]'}`}>
          <span className="material-symbols-outlined text-[16px]">{requirement.met ? 'check_circle' : 'radio_button_unchecked'}</span>
          {t(`account.passwordRequirement${requirement.key[0].toUpperCase()}${requirement.key.slice(1)}`)}
        </li>
      ))}
    </ul>
  );
}

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
  const [form, setForm] = useState({ full_name: user.full_name, email: user.email, phone: user.phone || '' });
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [msg, setMsg] = useState(null);
  const [pwMsg, setPwMsg] = useState(null);
  const [securityQuestionsForm, setSecurityQuestionsForm] = useState({ current: '', question1: '', answer1: '', question2: '', answer2: '' });
  const [securityQuestionsConfigured, setSecurityQuestionsConfigured] = useState(null);
  const [savingSecurityQuestions, setSavingSecurityQuestions] = useState(false);
  const [securityQuestionsMsg, setSecurityQuestionsMsg] = useState(null);
  const newPasswordValidation = getPasswordValidation(pwForm.next);

  // ── Foto de perfil ──────────────────────────────────────────
  const [photoUrl, setPhotoUrl] = useState(user.photo_url || null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoMsg, setPhotoMsg] = useState(null);
  const fileInputRef = useRef(null);

  // ── Preferencias de ubicación ───────────────────────────────
  const savedPrefs = loadPrefs();
  const [prefCity, setPrefCity] = useState(BOGOTA_CITY);
  const [prefLocality, setPrefLocality] = useState(savedPrefs.prefLocality || '');
  const [prefMsg, setPrefMsg] = useState(null);
  const [familyRecords, setFamilyRecords] = useState([]);
  const [recognitions, setRecognitions] = useState(null);
  const [recognitionsError, setRecognitionsError] = useState('');

  // ── Verificación de cédula (solo familia) ──────────────────
  const [familyVerif, setFamilyVerif] = useState(null);
  const [familyVerifLoading, setFamilyVerifLoading] = useState(false);
  const [familyVerifUploading, setFamilyVerifUploading] = useState(false);
  const [familyVerifMsg, setFamilyVerifMsg] = useState(null);
  const cedFileRef = useRef(null);

  const availableLocalidades = useMemo(
    () => getLocalidadesForCity(BOGOTA_CITY),
    []
  );

  useEffect(() => {
    if (user.role !== 'family' || !token) return;
    fetch('/api/clinical-records/', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : [])
      .then(data => setFamilyRecords(Array.isArray(data) ? data : []))
      .catch(() => setFamilyRecords([]));
  }, [token, user.role]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/auth/security-questions', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        setSecurityQuestionsConfigured(data.configured);
        setSecurityQuestionsForm(current => ({ ...current, question1: data.security_question_1 || '', question2: data.security_question_2 || '' }));
      })
      .catch(() => setSecurityQuestionsConfigured(false));
  }, [token]);

  useEffect(() => {
    if (!['caregiver', 'nurse'].includes(user.role) || !token) return;
    let active = true;
    fetch('/api/recognitions/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => {
        if (!response.ok) throw new Error('No fue posible cargar los reconocimientos.');
        return response.json();
      })
      .then(data => { if (active) setRecognitions(data); })
      .catch(error => { if (active) setRecognitionsError(error.message); });
    return () => { active = false; };
  }, [user.role, token]);

  useEffect(() => {
    if (user.role !== 'family' || !token || activeTab !== 'verification') return;
    setFamilyVerifLoading(true);
    fetch('/api/family-verification/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => setFamilyVerif(data))
      .catch(() => setFamilyVerif(null))
      .finally(() => setFamilyVerifLoading(false));
  }, [user.role, token, activeTab]);

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
    setMsg(null);
    if (form.phone && !COLOMBIAN_MOBILE_PHONE.test(form.phone)) {
      setMsg({ type: 'err', text: t('account.phoneInvalid') });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: form.phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || t('account.saveError'));

      const updated = { ...user, ...data };
      if (onUserUpdate) onUserUpdate(updated);
      setForm(current => ({ ...current, full_name: data.full_name, phone: data.phone || '' }));
      setMsg({ type: 'ok', text: t('account.savedOk') });
    } catch (error) {
      setMsg({ type: 'err', text: error.message || t('account.saveError') });
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
    if (!newPasswordValidation.isValid) {
      setPwMsg({ type: 'err', text: t('account.passwordRequirementsError') });
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

  const saveSecurityQuestions = async (e) => {
    e.preventDefault();
    setSecurityQuestionsMsg(null);
    if (securityQuestionsForm.question1 === securityQuestionsForm.question2) {
      setSecurityQuestionsMsg({ type: 'err', text: t('account.securityQuestionsDifferent') });
      return;
    }
    setSavingSecurityQuestions(true);
    try {
      const res = await fetch('/api/auth/security-questions', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          current_password: securityQuestionsForm.current,
          security_question_1: securityQuestionsForm.question1,
          security_answer_1: securityQuestionsForm.answer1,
          security_question_2: securityQuestionsForm.question2,
          security_answer_2: securityQuestionsForm.answer2,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || t('account.securityQuestionsError'));
      setSecurityQuestionsConfigured(true);
      setSecurityQuestionsForm(current => ({ ...current, current: '', answer1: '', answer2: '' }));
      setSecurityQuestionsMsg({ type: 'ok', text: t('account.securityQuestionsOk') });
    } catch (error) {
      setSecurityQuestionsMsg({ type: 'err', text: error.message || t('account.securityQuestionsError') });
    } finally {
      setSavingSecurityQuestions(false);
    }
  };

  // ── Guardar preferencias de ubicación ───────────────────────
  const savePreferences = () => {
    setPrefMsg(null);
    try {
      const prefs = loadPrefs();
      const updated = { ...prefs, prefCity, prefLocality };
      localStorage.setItem(PREFS_KEY, JSON.stringify(updated));
      // Disparar evento para que SearchPanel pueda escuchar el cambio
      window.dispatchEvent(new CustomEvent('salud:prefsChanged', { detail: updated }));
      setPrefMsg({ type: 'ok', text: t('account.prefSaved') });
      setTimeout(() => setPrefMsg(null), 3000);
    } catch {
      setPrefMsg({ type: 'err', text: t('account.saveError') });
    }
  };

  const applyFamilyLocation = (record) => {
    if (record.city === BOGOTA_CITY) {
      setPrefCity(BOGOTA_CITY);
      setPrefLocality(record.neighborhood || '');
    }
  };

  const sideNavItems = [
    { key: 'profile',     icon: 'person',            label: t('account.profile')     },
    ...(['caregiver', 'nurse'].includes(user.role) ? [{ key: 'professional-profile', icon: 'badge', label: 'Mi perfil profesional' }] : []),
    ...(['caregiver', 'nurse'].includes(user.role) ? [{ key: 'recognitions', icon: 'workspace_premium', label: 'Mis reconocimientos' }] : []),
    { key: 'security',    icon: 'lock',              label: t('account.security')    },
    { key: 'preferences', icon: 'tune',              label: t('account.preferences') },
    ...(user.role === 'family' ? [{ key: 'family', icon: 'group', label: t('account.myFamily') }] : []),
    ...(user.role === 'family' ? [{ key: 'verification', icon: 'verified_user', label: 'Mi verificación' }] : []),
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
                src={getAssetUrl(photoUrl)}
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
          {user.role === 'family' && prefCity && (
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
                        src={getAssetUrl(photoUrl)}
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
                    className={`${INPUT_CLASS} bg-[#f3f3f6] cursor-not-allowed opacity-70`}
                    value={form.full_name}
                    disabled
                    title="El nombre solo puede ser modificado por un administrador"
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
                    inputMode="numeric"
                    value={form.phone}
                    onChange={e => {
                      const phone = e.target.value;
                      if (/^\d{0,10}$/.test(phone)) setForm({ ...form, phone });
                    }}
                    placeholder={t('account.phonePlaceholder')}
                    maxLength={10}
                    pattern="3[0-9]{9}"
                    aria-describedby="phone-help"
                  />
                  <p id="phone-help" className="mt-1 text-[12px] text-[#737785]">{t('account.phoneHint')}</p>
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

        {activeTab === 'recognitions' && ['caregiver', 'nurse'].includes(user.role) && (
          <div className="max-w-3xl">
            <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-6">
              <div className="flex items-start gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#dae2ff] text-[#0040a1] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined">workspace_premium</span>
                </div>
                <div>
                  <h3 className="font-bold text-[18px] text-[#1a1c1e]">Mis reconocimientos</h3>
                  <p className="text-[13px] text-[#737785] mt-1">Se asignan automáticamente con servicios completados y valoraciones verificadas.</p>
                </div>
              </div>
              {recognitionsError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{recognitionsError}</p>}
              {!recognitions && !recognitionsError && <div className="py-8 flex justify-center"><Spinner /></div>}
              {recognitions && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                    <div className="rounded-xl bg-[#f3f3f6] p-3"><p className="text-[11px] text-[#737785]">Servicios completados</p><p className="text-[22px] font-bold text-[#0040a1]">{recognitions.metrics.completed_services}</p></div>
                    <div className="rounded-xl bg-[#f3f3f6] p-3"><p className="text-[11px] text-[#737785]">Valoraciones de 4 o 5</p><p className="text-[22px] font-bold text-[#0040a1]">{recognitions.metrics.verified_excellent_reviews}</p></div>
                    <div className="rounded-xl bg-[#f3f3f6] p-3"><p className="text-[11px] text-[#737785]">Promedio actual</p><p className="text-[22px] font-bold text-[#0040a1]">{recognitions.metrics.rating_average?.toFixed(1) || '—'}</p></div>
                  </div>
                  <div className="space-y-3">
                    {recognitions.recognitions.map(recognition => (
                      <article key={recognition.code} className={`rounded-2xl border p-4 flex gap-3 ${recognition.awarded ? 'border-[#0040a1]/25 bg-[#f0f4fd]' : 'border-[#c3c6d6]/40 bg-white'}`}>
                        <div className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center ${recognition.awarded ? 'bg-[#0040a1] text-white' : 'bg-[#f3f3f6] text-[#737785]'}`}><span className="material-symbols-outlined">{recognition.icon}</span></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap justify-between gap-2"><h4 className="font-bold text-[14px] text-[#1a1c1e]">{recognition.name}</h4><span className={`text-[11px] font-bold ${recognition.awarded ? 'text-[#0040a1]' : 'text-[#737785]'}`}>{recognition.awarded ? 'Obtenido' : `${recognition.progress}/${recognition.target}`}</span></div>
                          <p className="mt-1 text-[12px] text-[#424654]">{recognition.awarded ? recognition.description : recognition.requirement}</p>
                          {!recognition.awarded && <div className="mt-2 h-1.5 bg-[#dae2ff] rounded-full overflow-hidden"><div className="h-full bg-[#0040a1] rounded-full" style={{ width: `${(recognition.progress / recognition.target) * 100}%` }} /></div>}
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
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
                    minLength={8}
                  />
                  <PasswordRequirements validation={newPasswordValidation} t={t} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>{t('account.confirmPassword')}</label>
                  <input
                    className={INPUT_CLASS}
                    type="password"
                    value={pwForm.confirm}
                    onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })}
                    required
                    minLength={8}
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
            <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-6 mt-5">
              <h3 className="font-bold text-[17px] text-[#1a1c1e] mb-1 flex items-center gap-2">
                <span className="material-symbols-outlined text-[22px] text-[#0040a1]">quiz</span>
                {t('account.securityQuestionsTitle')}
              </h3>
              <p className="text-[13px] text-[#737785] mb-5">
                {securityQuestionsConfigured ? t('account.securityQuestionsConfigured') : t('account.securityQuestionsMissing')}
              </p>
              <form onSubmit={saveSecurityQuestions} className="flex flex-col gap-4">
                <div>
                  <label className={LABEL_CLASS}>{t('account.currentPassword')}</label>
                  <input className={INPUT_CLASS} type="password" value={securityQuestionsForm.current} onChange={e => setSecurityQuestionsForm(v => ({ ...v, current: e.target.value }))} required />
                </div>
                {[['question1', 'answer1'], ['question2', 'answer2']].map(([questionKey, answerKey], index) => (
                  <div key={questionKey}>
                    <label className={LABEL_CLASS}>{t('account.securityQuestionNumber', { n: index + 1 })}</label>
                    <select className={INPUT_CLASS} value={securityQuestionsForm[questionKey]} onChange={e => setSecurityQuestionsForm(v => ({ ...v, [questionKey]: e.target.value }))} required>
                      <option value="">{t('account.selectSecurityQuestion')}</option>
                      {SECURITY_QUESTIONS.filter(question => question !== securityQuestionsForm[index === 0 ? 'question2' : 'question1']).map(question => <option key={question} value={question}>{t(`auth.securityQuestions.${question}`)}</option>)}
                    </select>
                    <input className={`${INPUT_CLASS} mt-2`} type="text" placeholder={t('account.securityAnswer')} value={securityQuestionsForm[answerKey]} onChange={e => setSecurityQuestionsForm(v => ({ ...v, [answerKey]: e.target.value }))} minLength={2} required />
                  </div>
                ))}
                <button type="submit" disabled={savingSecurityQuestions} className="h-[44px] px-6 bg-[#006a61] text-white rounded-xl font-bold text-[14px] hover:bg-[#00574f] transition-all flex items-center justify-center gap-2 disabled:opacity-60 self-start">
                  {savingSecurityQuestions ? <Spinner sm /> : <><span className="material-symbols-outlined text-[19px]">save</span>{t('account.saveSecurityQuestions')}</>}
                </button>
                {securityQuestionsMsg && <p className={`text-[13px] font-semibold ${securityQuestionsMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{securityQuestionsMsg.text}</p>}
              </form>
            </div>
          </div>
        )}

        {/* ─ Preferences ─ */}
        {activeTab === 'preferences' && (
          <div className="max-w-2xl flex flex-col gap-5">

            {user.role === 'family' && (<>
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
                    <div className="w-full h-[42px] pl-9 pr-3 rounded-xl border border-[#c3c6d6] bg-[#f3f3f6] text-[#424654] text-[14px] font-semibold flex items-center">
                      {BOGOTA_CITY}
                    </div>
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
                      disabled={availableLocalidades.length === 0}
                    >
                      <option value="">
                        {t('geo.allLocalities')}
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
                    onClick={() => { setPrefCity(BOGOTA_CITY); setPrefLocality(''); }}
                    className="ml-auto text-[11px] text-[#e11d48] font-semibold hover:underline flex items-center gap-0.5"
                  >
                    <span className="material-symbols-outlined text-[13px]">close</span>
                    {t('account.prefReset')}
                  </button>
                </div>
              )}
            </div>

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
                    {familyRecords.map(record => {
                      const city = record.city || '';
                      const locality = record.neighborhood || '';
                      const isActive = prefCity === city && prefLocality === locality;

                      return (
                        <div
                          key={record.id}
                          className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 transition-all ${
                            city === BOGOTA_CITY ? 'cursor-pointer' : 'cursor-default opacity-70'
                          } ${
                            isActive
                              ? 'bg-[#dae2ff]/60 border-[#0040a1]/40 shadow-sm'
                              : 'bg-[#f9f9fc] border-[#c3c6d6]/50 hover:border-[#0040a1]/30 hover:bg-[#f0f4fd]'
                          }`}
                          onClick={() => applyFamilyLocation(record)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-[14px] shrink-0 ${
                              isActive ? 'bg-[#0040a1]' : 'bg-[#6b7cf6]'
                            }`}>
                              {record.patient_name?.charAt(0) || '?'}
                            </div>
                            <div>
                              <p className="font-bold text-[14px] text-[#1a1c1e] leading-tight">{record.patient_name}</p>
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

                          {isActive ? (
                            <span className="flex items-center gap-1 text-[11px] font-bold bg-[#0040a1] text-white px-2.5 py-1 rounded-full shrink-0">
                              <span className="material-symbols-outlined text-[13px]">check</span>
                              Activa
                            </span>
                          ) : city === BOGOTA_CITY ? (
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
            </>)}

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

            {user.role === 'family' && (<>
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
            </>)}
          </div>
        )}

        {/* ─ My Family (CRUD completo) ─ */}
        {activeTab === 'family' && user.role === 'family' && (
          <FamilyPatientPanel token={token} />
        )}

        {/* ─ Verificación de cédula (solo familia) ─ */}
        {activeTab === 'verification' && user.role === 'family' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6 pb-5 border-b border-[#c3c6d6]/30">
                <span className="material-symbols-outlined text-[28px] text-[#0040a1]">verified_user</span>
                <div>
                  <h3 className="text-[17px] font-bold text-[#1a1c1e]">Verificación de identidad</h3>
                  <p className="text-[13px] text-[#737785] mt-0.5">Sube tu cédula para que un administrador la verifique. Una vez aprobada, podrás contratar servicios.</p>
                </div>
              </div>

              {familyVerifLoading ? (
                <div className="py-6 flex justify-center"><Spinner sm /></div>
              ) : (
                <>
                  {/* Estado actual */}
                  {familyVerif && (
                    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl mb-5 text-[13px] font-semibold ${
                      familyVerif.status === 'approved' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                      familyVerif.status === 'rejected' ? 'bg-red-50 text-red-800 border border-red-200' :
                      familyVerif.has_document ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                      'bg-[#f3f3f6] text-[#424654] border border-[#c3c6d6]/40'
                    }`}>
                      <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {familyVerif.status === 'approved' ? 'verified' :
                         familyVerif.status === 'rejected' ? 'cancel' :
                         familyVerif.has_document ? 'schedule' : 'upload_file'}
                      </span>
                      {familyVerif.status === 'approved' ? 'Identidad verificada — puedes contratar servicios' :
                       familyVerif.status === 'rejected' ? 'Documento rechazado — sube un nuevo documento' :
                       familyVerif.has_document ? 'Documento en revisión — te notificaremos el resultado' :
                       'Sin documento — sube tu cédula para activar la contratación'}
                    </div>
                  )}

                  {/* Motivo de rechazo */}
                  {familyVerif?.status === 'rejected' && familyVerif.rejection_reason && (
                    <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-[13px] text-red-800">
                      <p className="font-bold mb-1">Motivo del rechazo:</p>
                      <p>{familyVerif.rejection_reason}</p>
                    </div>
                  )}

                  {/* Subir / reemplazar cédula */}
                  {familyVerif?.status !== 'approved' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${familyVerif?.has_document ? 'bg-emerald-50 text-emerald-600' : 'bg-[#f3f3f6] text-[#737785]'}`}>
                            <span className="material-symbols-outlined" style={familyVerif?.has_document ? { fontVariationSettings: "'FILL' 1" } : {}}>
                              {familyVerif?.has_document ? 'description' : 'badge'}
                            </span>
                          </div>
                          <div>
                            <p className="text-[14px] font-semibold text-[#1a1c1e]">Cédula de ciudadanía</p>
                            <p className="text-[12px] text-[#737785]">
                              {familyVerif?.has_document ? 'Documento subido' : 'Pendiente de cargar'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={familyVerifUploading}
                          onClick={() => cedFileRef.current?.click()}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#004099] text-[#004099] text-[14px] font-semibold hover:bg-[#004099]/5 transition-colors bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {familyVerifUploading ? <Spinner sm /> : (
                            <>
                              <span className="material-symbols-outlined text-[18px]">{familyVerif?.has_document ? 'refresh' : 'upload'}</span>
                              {familyVerif?.has_document ? 'Reemplazar' : 'Subir cédula'}
                            </>
                          )}
                        </button>
                        <input
                          ref={cedFileRef}
                          type="file"
                          accept="application/pdf,image/jpeg,image/png"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
                              setFamilyVerifMsg({ type: 'err', text: 'Solo se aceptan PDF, JPEG o PNG.' });
                              return;
                            }
                            if (file.size > 10 * 1024 * 1024) {
                              setFamilyVerifMsg({ type: 'err', text: 'El archivo no puede superar 10 MB.' });
                              return;
                            }
                            setFamilyVerifUploading(true);
                            setFamilyVerifMsg(null);
                            const formData = new FormData();
                            formData.append('file', file);
                            try {
                              const res = await fetch('/api/family-verification/documents/cedula', {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${token}` },
                                body: formData,
                              });
                              if (!res.ok) {
                                const d = await res.json().catch(() => ({}));
                                throw new Error(d.detail || 'No fue posible subir el documento.');
                              }
                              const updated = await res.json();
                              setFamilyVerif(updated);
                              setFamilyVerifMsg({ type: 'ok', text: 'Cédula subida correctamente. El administrador la revisará pronto.' });
                            } catch (err) {
                              setFamilyVerifMsg({ type: 'err', text: err.message });
                            } finally {
                              setFamilyVerifUploading(false);
                            }
                          }}
                        />
                      </div>

                      <p className="text-[12px] text-[#737785]">Formatos aceptados: PDF, JPEG o PNG. Máximo 10 MB.</p>

                      {familyVerifMsg && (
                        <p className={`text-[13px] font-medium ${familyVerifMsg.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
                          {familyVerifMsg.text}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Cédula aprobada: confirmar que ya puede contratar */}
                  {familyVerif?.status === 'approved' && (
                    <p className="text-[13px] text-emerald-700">
                      Tu identidad ha sido verificada. Ya puedes contratar cuidadores y enfermeros.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
