import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { Building2, Mail, Phone, MapPin, User, ImageUp, Trash2, Loader2 } from 'lucide-react';
import api from '../../api/axios';
import { clearCompanyCache } from '../../utils/reportExport';

// Resize an uploaded image to fit within `max`px (longest side) and return a
// compact PNG data URL. Keeps the logo small enough to live in the DB and to
// embed on every letterhead without bloating documents.
function fileToResizedDataUrl(file, max = 320) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode-failed'));
      img.onload = () => {
        let { width, height } = img;
        if (width > max || height > max) {
          const scale = max / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function CompanyProfile() {
  const { t, lang } = useTheme();
  const { success: showSuccess, error: showError } = useToast();
  const isRTL = lang === 'ur';
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    name: '', owner_name: '', email: '', phone: '', address: '', logo_url: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get('/company');
        const c = data.company || {};
        if (alive) setForm({
          name: c.name || '', owner_name: c.owner_name || '', email: c.email || '',
          phone: c.phone || '', address: c.address || '', logo_url: c.logo_url || '',
        });
      } catch {
        showError(t('somethingWrong'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const handleLogoPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) {
      showError(t('somethingWrong'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showError(t('logoTooLarge'));
      return;
    }
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      setForm(f => ({ ...f, logo_url: dataUrl }));
    } catch {
      showError(t('somethingWrong'));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/company', form);
      clearCompanyCache();
      showSuccess(t('companyProfileSaved'));
    } catch (err) {
      showError(err.response?.data?.message || t('somethingWrong'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
        <div className="h-8 w-56 rounded-lg skeleton" />
        <div className="h-64 rounded-2xl skeleton" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-in" dir={isRTL ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('companyProfile')}</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('companyProfileSub')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Logo */}
        <div className="card space-y-4">
          <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <ImageUp className="w-4 h-4 text-brand-400" /> {t('companyLogo')}
          </h2>

          <div className="flex items-center gap-4 flex-wrap">
            <div
              className="w-28 h-28 rounded-xl border flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-subtle, #ffffff)' }}
            >
              {form.logo_url ? (
                <img src={form.logo_url} alt="logo" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-xs text-center px-2" style={{ color: 'var(--text-muted)' }}>
                  {t('noLogoUploaded')}
                </span>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button" onClick={() => fileRef.current?.click()}
                  className="btn-secondary flex items-center gap-1.5 text-sm"
                >
                  <ImageUp className="w-4 h-4" />
                  {form.logo_url ? t('changeLogo') : t('uploadLogo')}
                </button>
                {form.logo_url && (
                  <button
                    type="button" onClick={() => setForm(f => ({ ...f, logo_url: '' }))}
                    className="btn-secondary flex items-center gap-1.5 text-sm text-red-400"
                  >
                    <Trash2 className="w-4 h-4" /> {t('removeLogo')}
                  </button>
                )}
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('companyLogoHint')}</p>
            </div>
            <input
              ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={handleLogoPick} className="hidden"
            />
          </div>
        </div>

        {/* Company details */}
        <div className="card space-y-4">
          <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Building2 className="w-4 h-4 text-brand-400" /> {t('companyName')}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="form-label">{t('companyName')} *</label>
              <input required value={form.name} onChange={set('name')} className="input-field" />
            </div>
            <div>
              <label className="form-label">{t('ownerName')}</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                <input value={form.owner_name} onChange={set('owner_name')} className="input-field pl-9" />
              </div>
            </div>
            <div>
              <label className="form-label">{t('shopPhone')}</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                <input value={form.phone} onChange={set('phone')} className="input-field pl-9" />
              </div>
            </div>
            <div>
              <label className="form-label">{t('shopEmail')}</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                <input type="email" value={form.email} onChange={set('email')} className="input-field pl-9" />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="form-label">{t('shopAddress')}</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                <textarea value={form.address} onChange={set('address')} rows={2}
                  className="input-field pl-9 resize-none" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving}
            className="btn-primary flex items-center justify-center gap-2 min-w-[160px]">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('saveChanges')}
          </button>
        </div>
      </form>
    </div>
  );
}
