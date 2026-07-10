import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import {
  Store, User, Mail, Phone, MapPin, ChevronLeft,
  Eye, EyeOff, Loader2, CheckCircle
} from 'lucide-react';
import api from '../../api/axios';

const PLANS = ['basic', 'pro', 'enterprise'];

export default function CreateShop() {
  const { t, lang } = useTheme();
  const { success: showSuccess, error: showError } = useToast();
  const navigate = useNavigate();
  const isRTL = lang === 'ur';

  const [form, setForm] = useState({
    // Shop info
    name: '', owner_name: '', email: '', phone: '', address: '', plan: 'basic',
    // First admin
    admin_name: '', admin_email: '', admin_password: ''
  });
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/shops', form);
      showSuccess(t('toastShopCreated'));
      setSuccess(true);
      setTimeout(() => navigate('/superadmin/shops'), 1500);
    } catch (err) {
      const msg = err.response?.data?.message || t('somethingWrong');
      setError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('shopCreatedSuccess')}</h2>
        <p style={{ color: 'var(--text-muted)' }}>{t('redirectingShops')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-in" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Back button */}
      <button
        onClick={() => navigate('/superadmin/shops')}
        className="flex items-center gap-2 text-sm hover:text-brand-400 transition-colors"
        style={{ color: 'var(--text-muted)' }}
      >
        <ChevronLeft className="w-4 h-4" />
        {t('back')}
      </button>

      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('createShop')}</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {t('platformSubtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Shop Info */}
        <div className="card space-y-4">
          <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Store className="w-4 h-4 text-brand-400" /> {t('shopDetails')}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">{t('shopName')} *</label>
              <input
                required value={form.name} onChange={set('name')}
                placeholder="e.g. Ahmed Electronics"
                className="input-field"
                id="shop-name-input"
              />
            </div>
            <div>
              <label className="form-label">{t('ownerName')}</label>
              <input value={form.owner_name} onChange={set('owner_name')}
                placeholder="e.g. Ahmed Khan" className="input-field" />
            </div>
            <div>
              <label className="form-label">{t('shopEmail')}</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                <input type="email" value={form.email} onChange={set('email')}
                  placeholder="shop@example.com" className="input-field pl-9" />
              </div>
            </div>
            <div>
              <label className="form-label">{t('shopPhone')}</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                <input value={form.phone} onChange={set('phone')}
                  placeholder="03001234567" className="input-field pl-9" />
              </div>
            </div>
          </div>

          <div>
            <label className="form-label">{t('shopAddress')}</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <textarea value={form.address} onChange={set('address')}
                rows={2} placeholder="Street, City, Country"
                className="input-field pl-9 resize-none" />
            </div>
          </div>

          <div>
            <label className="form-label">{t('shopPlan')}</label>
            <div className="flex gap-2">
              {PLANS.map(plan => (
                <button
                  key={plan}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, plan }))}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                    form.plan === plan
                      ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                      : 'border-transparent text-sm'
                  }`}
                  style={form.plan !== plan ? { borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' } : {}}
                >
                  {t(`plan${plan.charAt(0).toUpperCase() + plan.slice(1)}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* First Admin */}
        <div className="card space-y-4">
          <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <User className="w-4 h-4 text-purple-400" /> {t('firstAdminAccount')}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">{t('adminName')} *</label>
              <input required value={form.admin_name} onChange={set('admin_name')}
                placeholder="e.g. Branch Manager" className="input-field" id="admin-name-input" />
            </div>
            <div>
              <label className="form-label">{t('adminEmail')} *</label>
              <input required type="email" value={form.admin_email} onChange={set('admin_email')}
                placeholder="admin@shop.com" className="input-field" id="admin-email-input" />
            </div>
          </div>

          <div>
            <label className="form-label">{t('adminPassword')} *</label>
            <div className="relative">
              <input
                required
                type={showPw ? 'text' : 'password'}
                value={form.admin_password}
                onChange={set('admin_password')}
                placeholder="Min. 8 characters"
                className="input-field pr-10"
                minLength={8}
                id="admin-password-input"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-muted)' }}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={() => navigate('/superadmin/shops')}
            className="btn-secondary flex-1" id="create-shop-cancel-btn">
            {t('cancel')}
          </button>
          <button type="submit" disabled={loading}
            className="btn-primary flex-1 flex items-center justify-center gap-2" id="create-shop-submit-btn">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('createShop')}
          </button>
        </div>
      </form>
    </div>
  );
}
