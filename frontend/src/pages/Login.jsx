import { useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { Zap, Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, Sun, Moon, Globe, Check, ChevronDown } from 'lucide-react';
import FormLabel from '../components/ui/FormLabel';
import WelcomeModal from '../components/WelcomeModal';
import { useRef, useEffect } from 'react';

function useClickOutside(ref, handler) {
  useEffect(() => {
    const listener = (e) => {
      if (!ref.current || ref.current.contains(e.target)) return;
      handler(e);
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, handler]);
}

export default function LoginPage() {
  const { login, user } = useAuth();
  const { theme, toggleTheme, lang, setLang, t } = useTheme();
  const { error: toastError } = useToast();

  const [form, setForm]       = useState({ email: '', password: '' });
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef(null);
  useClickOutside(langRef, () => setLangOpen(false));
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeName, setWelcomeName] = useState('');
  // Stable identity so WelcomeModal's countdown effect doesn't tear down and
  // restart every time this page re-renders during the login flow.
  const closeWelcome = useCallback(() => setShowWelcome(false), []);

  // Hold the redirect open while the welcome modal is showing — otherwise the
  // guard below fires the moment `user` is set (right after login) and we
  // never get to render the modal at all.
  if (user && !showWelcome) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    // Set this before `login()` resolves — it sets the user internally partway
    // through (before its own awaited call finishes), which would otherwise
    // trigger the guard above and redirect before the modal ever renders.
    setShowWelcome(true);
    try {
      const loggedInUser = await login(form.email, form.password);
      setWelcomeName(loggedInUser?.name || '');
    } catch (err) {
      setShowWelcome(false);
      const msg = err.response?.data?.message || t('invalidCredentials');
      setError(msg);
      toastError(msg);
    } finally {
      setLoading(false);
    }
  };

  const langs = [
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'ur', label: 'اردو',    flag: '🇵🇰' },
  ];

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ backgroundColor: 'var(--bg-base)' }}
    >
      {/* Background glows */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Top-right controls: Theme + Language */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="topbar-btn"
          title={theme === 'dark' ? t('lightMode') : t('darkMode')}
          id="login-theme-toggle"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* Language dropdown */}
        <div className="dropdown-wrap" ref={langRef}>
          <button
            onClick={() => setLangOpen(o => !o)}
            className="topbar-btn flex items-center gap-1.5"
            id="login-lang-toggle"
          >
            <Globe className="w-4 h-4" />
            <span className="text-xs font-semibold">{lang === 'ur' ? 'اردو' : 'EN'}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${langOpen ? 'rotate-180' : ''}`} />
          </button>
          {langOpen && (
            <div className="dropdown-menu">
              {langs.map(l => (
                <div
                  key={l.code}
                  className={`dropdown-item ${lang === l.code ? 'active' : ''}`}
                  onClick={() => { setLang(l.code); setLangOpen(false); }}
                >
                  <span>{l.flag}</span>
                  <span>{l.label}</span>
                  {lang === l.code && <Check className="w-3 h-3 ml-auto" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-full max-w-md animate-fade-in relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center mx-auto mb-4 glow">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            {t('welcomeBack')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('signInSubtitle')}
          </p>
        </div>

        {/* Card */}
        <div className="glass-card p-8">
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-500 rounded-xl px-4 py-3 mb-6 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <FormLabel variant="login" required>{t('emailLabel')}</FormLabel>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                <input
                  type="email"
                  className="input pl-10"
                  placeholder={t('emailPlaceholder')}
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  required
                  id="email"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <FormLabel variant="login" required>{t('passwordLabel')}</FormLabel>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input pl-10 pr-10"
                  placeholder={t('passwordPlaceholder')}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                  id="password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
              disabled={loading}
              id="login-btn"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? t('signingIn') : t('signIn')}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-faint)' }}>
          {t('appVersion')} &mdash; {t('appFull')}
        </p>
        <p className="text-center text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>
          {t('softwareCredit')}
        </p>
      </div>

      {showWelcome && user && (
        <WelcomeModal userName={welcomeName} onClose={closeWelcome} />
      )}
    </div>
  );
}
