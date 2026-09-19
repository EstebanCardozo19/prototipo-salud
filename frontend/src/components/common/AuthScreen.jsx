import { useState } from 'react';
import { useLang } from '../../contexts/LangContext';
import { useToast } from '../../contexts/ToastContext';
import Spinner from './Spinner';
import { INPUT_CLASS, LABEL_CLASS } from '../../constants';

// ─── AuthScreen ─────────────────────────────────────────────
export default function AuthScreen({ onLogin }) {
  const { t, lang, setLang } = useLang();
  const { success } = useToast();
  const [tab, setTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('family');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: fullName, role })
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

  const inputCls = INPUT_CLASS.replace('h-[42px]', 'h-[44px]').replace('text-[14px]', 'text-[15px]');
  const labelCls = `${LABEL_CLASS} text-[13px]`;

  return (
    <div className="min-h-screen bg-[#f3f3f6] flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-[#0040a1] px-8 py-7 text-white text-center">
          <span className="material-symbols-outlined text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            favorite
          </span>
          <h1 className="text-[22px] font-bold mt-2">{t('auth.title')}</h1>
          <p className="text-white/70 text-[13px] mt-1">{t('auth.subtitle')}</p>
        </div>

        <div className="p-8">
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
            </form>
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
                  minLength={6}
                />
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
              <button
                type="submit"
                disabled={loading}
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
