import { useState } from 'react';
import { useLang } from '../../contexts/LangContext';
import { useToast } from '../../contexts/ToastContext';
import Spinner from './Spinner';
import { INPUT_CLASS, LABEL_CLASS } from '../../constants';
import { getPasswordValidation } from '../../utils/password';

const SECURITY_QUESTIONS = [
  { value: 'first_pet', label: 'auth.securityQuestionFirstPet' },
  { value: 'birth_city', label: 'auth.securityQuestionBirthCity' },
  { value: 'favorite_teacher', label: 'auth.securityQuestionFavoriteTeacher' },
  { value: 'childhood_friend', label: 'auth.securityQuestionChildhoodFriend' },
  { value: 'favorite_book', label: 'auth.securityQuestionFavoriteBook' },
  { value: 'mother_middle_name', label: 'auth.securityQuestionMotherMiddleName' },
];

function PasswordRequirements({ validation, t }) {
  return (
    <ul className="mt-2 space-y-1 text-[12px]" aria-live="polite">
      {validation.requirements.map(requirement => (
        <li key={requirement.key} className={`flex items-center gap-1.5 ${requirement.met ? 'text-green-600' : 'text-[#737785]'}`}>
          <span className="material-symbols-outlined text-[16px]">{requirement.met ? 'check_circle' : 'radio_button_unchecked'}</span>
          {t(`auth.passwordRequirement${requirement.key[0].toUpperCase()}${requirement.key.slice(1)}`)}
        </li>
      ))}
    </ul>
  );
}

// ─── AuthScreen ─────────────────────────────────────────────
export default function AuthScreen({ onLogin, initialTab = 'login', onBack }) {
  const { t, lang, setLang } = useLang();
  const { success } = useToast();
  const [tab, setTab] = useState(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('family');
  const [dataProcessingAccepted, setDataProcessingAccepted] = useState(false);
  const [securityForm, setSecurityForm] = useState({ question1: '', answer1: '', question2: '', answer2: '' });
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryQuestions, setRecoveryQuestions] = useState(null);
  const [recoveryAnswers, setRecoveryAnswers] = useState({ answer1: '', answer2: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const registrationPasswordValidation = getPasswordValidation(password);
  const recoveryPasswordValidation = getPasswordValidation(recoveryAnswers.password);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || 'Error');
      }
      const data = await res.json();
      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${data.access_token}` }
      });
      if (!meRes.ok) {
        const detail = await meRes.json().catch(() => ({}));
        throw new Error(detail.detail || 'No fue posible validar la sesión.');
      }
      const user = await meRes.json();
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(user));
      onLogin(user, data.access_token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (!registrationPasswordValidation.isValid) {
      setError(t('auth.passwordRequirementsError'));
      return;
    }
    if (!dataProcessingAccepted) {
      setError(t('auth.dataProcessingConsentRequired'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, password, full_name: fullName, role,
          security_question_1: securityForm.question1,
          security_answer_1: securityForm.answer1,
          security_question_2: securityForm.question2,
          security_answer_2: securityForm.answer2,
        })
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || 'Error');
      }
      setTab('login');
      setPassword('');
      success(t('auth.registerSuccess'), { title: t('auth.registerSuccessTitle') });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const showLogin = () => {
    setTab('login');
    setError('');
    setRecoveryQuestions(null);
    setRecoveryAnswers({ answer1: '', answer2: '', password: '', confirm: '' });
  };

  const loadRecoveryQuestions = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/password-recovery/questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: recoveryEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || t('auth.recoveryError'));
      setRecoveryQuestions(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (recoveryAnswers.password !== recoveryAnswers.confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    if (!recoveryPasswordValidation.isValid) {
      setError(t('auth.passwordRequirementsError'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/password-recovery/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: recoveryEmail, security_answer_1: recoveryAnswers.answer1,
          security_answer_2: recoveryAnswers.answer2, new_password: recoveryAnswers.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || t('auth.recoveryError'));
      setPassword('');
      showLogin();
      success(t('auth.recoverySuccess'), { title: t('auth.recoveryTitle') });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputCls = INPUT_CLASS.replace('h-[42px]', 'h-[44px]').replace('text-[14px]', 'text-[15px]');
  const labelCls = `${LABEL_CLASS} text-[13px]`;

  return (
    <div className="min-h-screen bg-[#f3f3f6] flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="relative bg-[#0040a1] px-5 py-6 sm:px-8 sm:py-7 text-white text-center">
          {onBack && <button type="button" onClick={onBack} aria-label="Volver al inicio" className="absolute left-4 top-4 rounded-full p-1 hover:bg-white/10"><span className="material-symbols-outlined">arrow_back</span></button>}
          <span className="material-symbols-outlined text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            favorite
          </span>
          <h1 className="text-[22px] font-bold mt-2">{t('auth.title')}</h1>
          <p className="text-white/70 text-[13px] mt-1">{t('auth.subtitle')}</p>
        </div>

        <div className="p-5 sm:p-8">
          {/* Selector de idioma */}
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
              className="flex items-center gap-1.5 text-[12px] font-bold text-[#0040a1] bg-[#f3f3f6] px-3 py-1.5 rounded-lg hover:bg-[#dae2ff] transition-all"
            >
              <span className="material-symbols-outlined text-[15px]">language</span>
              {lang === 'es' ? 'EN' : 'ES'}
            </button>
          </div>

          <div className="flex bg-[#f3f3f6] rounded-xl p-1 mb-6">
            {['login', 'register'].map(t_tab => (
              <button
                key={t_tab}
                onClick={() => setTab(t_tab)}
                className={`flex-1 h-[36px] rounded-lg text-[14px] font-semibold transition-all ${
                  tab === t_tab
                    ? 'bg-white text-[#0040a1] shadow-sm'
                    : 'text-[#424654]'
                }`}
              >
                {t_tab === 'login' ? t('auth.login') : t('auth.register')}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-[14px]">
              {error}
            </div>
          )}

          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div>
                <label className={labelCls}>{t('auth.email')}</label>
                <input
                  className={inputCls}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>{t('auth.password')}</label>
                <input
                  className={inputCls}
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="mt-2 h-[48px] bg-[#0040a1] text-white rounded-xl font-bold text-[15px] hover:bg-[#0040a1]/90 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Spinner sm /> : t('auth.login')}
              </button>
              <button type="button" onClick={() => { setTab('recovery'); setError(''); }} className="text-[13px] font-semibold text-[#0040a1] hover:underline">
                {t('auth.forgotPassword')}
              </button>
            </form>
          ) : tab === 'recovery' ? (
            !recoveryQuestions ? (
              <form onSubmit={loadRecoveryQuestions} className="flex flex-col gap-4">
                <div><h2 className="font-bold text-[18px] text-[#1a1c1e]">{t('auth.recoveryTitle')}</h2><p className="text-[13px] text-[#737785] mt-1">{t('auth.recoveryHint')}</p></div>
                <div><label className={labelCls}>{t('auth.email')}</label><input className={inputCls} type="email" value={recoveryEmail} onChange={e => setRecoveryEmail(e.target.value)} required /></div>
                <button type="submit" disabled={loading} className="h-[48px] bg-[#0040a1] text-white rounded-xl font-bold text-[15px] disabled:opacity-60">{loading ? <Spinner sm /> : t('auth.continue')}</button>
                <button type="button" onClick={showLogin} className="text-[13px] font-semibold text-[#0040a1] hover:underline">{t('auth.backToLogin')}</button>
              </form>
            ) : (
              <form onSubmit={resetPassword} className="flex flex-col gap-4">
                <div><h2 className="font-bold text-[18px] text-[#1a1c1e]">{t('auth.answerSecurityQuestions')}</h2><p className="text-[13px] text-[#737785] mt-1">{t('auth.recoveryAnswerHint')}</p></div>
                <div><label className={labelCls}>{t(`auth.securityQuestions.${recoveryQuestions.security_question_1}`)}</label><input className={inputCls} type="text" value={recoveryAnswers.answer1} onChange={e => setRecoveryAnswers(v => ({ ...v, answer1: e.target.value }))} required /></div>
                <div><label className={labelCls}>{t(`auth.securityQuestions.${recoveryQuestions.security_question_2}`)}</label><input className={inputCls} type="text" value={recoveryAnswers.answer2} onChange={e => setRecoveryAnswers(v => ({ ...v, answer2: e.target.value }))} required /></div>
                <div>
                  <label className={labelCls}>{t('auth.newPassword')}</label>
                  <input className={inputCls} type="password" minLength={8} value={recoveryAnswers.password} onChange={e => setRecoveryAnswers(v => ({ ...v, password: e.target.value }))} required />
                  <PasswordRequirements validation={recoveryPasswordValidation} t={t} />
                </div>
                <div><label className={labelCls}>{t('auth.confirmPassword')}</label><input className={inputCls} type="password" minLength={8} value={recoveryAnswers.confirm} onChange={e => setRecoveryAnswers(v => ({ ...v, confirm: e.target.value }))} required /></div>
                <button type="submit" disabled={loading} className="h-[48px] bg-[#0040a1] text-white rounded-xl font-bold text-[15px] disabled:opacity-60">{loading ? <Spinner sm /> : t('auth.resetPassword')}</button>
                <button type="button" onClick={showLogin} className="text-[13px] font-semibold text-[#0040a1] hover:underline">{t('auth.backToLogin')}</button>
              </form>
            )
          ) : (
            <form onSubmit={handleRegister} className="flex flex-col gap-4">
              <div>
                <label className={labelCls}>{t('auth.fullName')}</label>
                <input
                  className={inputCls}
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>{t('auth.email')}</label>
                <input
                  className={inputCls}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>{t('auth.password')}</label>
                <input
                  className={inputCls}
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <PasswordRequirements validation={registrationPasswordValidation} t={t} />
              </div>
              <div className="rounded-xl border border-[#c3c6d6]/60 bg-[#f9f9fc] p-4 space-y-3">
                <p className="font-bold text-[14px] text-[#1a1c1e]">{t('auth.securityQuestionsTitle')}</p>
                <p className="text-[12px] text-[#737785]">{t('auth.securityQuestionsHint')}</p>
                {[['question1', 'answer1'], ['question2', 'answer2']].map(([questionKey, answerKey], index) => (
                  <div key={questionKey}>
                    <label className={labelCls}>{t('auth.securityQuestionNumber', { n: index + 1 })}</label>
                    <select className={inputCls} value={securityForm[questionKey]} onChange={e => setSecurityForm(v => ({ ...v, [questionKey]: e.target.value }))} required>
                      <option value="">{t('auth.selectSecurityQuestion')}</option>
                      {SECURITY_QUESTIONS.filter(question => question.value !== securityForm[index === 0 ? 'question2' : 'question1']).map(question => <option key={question.value} value={question.value}>{t(question.label)}</option>)}
                    </select>
                    <input className={`${inputCls} mt-2`} type="text" placeholder={t('auth.securityAnswer')} value={securityForm[answerKey]} onChange={e => setSecurityForm(v => ({ ...v, [answerKey]: e.target.value }))} minLength={2} required />
                  </div>
                ))}
              </div>
              <div>
                <label className={labelCls}>{t('auth.iam')}</label>
                <select
                  className={inputCls}
                  value={role}
                  onChange={e => setRole(e.target.value)}
                >
                  <option value="family">{t('auth.roleFamily')}</option>
                  <option value="caregiver">{t('auth.roleCaregiver')}</option>
                  <option value="nurse">{t('auth.roleNurse')}</option>
                </select>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#c3c6d6]/60 bg-[#f9f9fc] p-3 text-[12px] leading-5 text-[#4a4d57]">
                <input
                  type="checkbox"
                  checked={dataProcessingAccepted}
                  onChange={e => setDataProcessingAccepted(e.target.checked)}
                  required
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#006a61]"
                />
                <span>{t('auth.dataProcessingConsent')}</span>
              </label>
              <button
                type="submit"
                disabled={loading || !dataProcessingAccepted}
                className="mt-2 h-[48px] bg-[#006a61] text-white rounded-xl font-bold text-[15px] hover:bg-[#006a61]/90 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Spinner sm /> : t('auth.createAccount')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
