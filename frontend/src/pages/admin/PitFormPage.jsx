import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, CircleDot } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import FormLabel from '../../components/ui/FormLabel';
import api from '../../api/axios';
import { MINE_STATUSES } from '../../utils/mineStatus';

function emptyForm(mineId) {
  return { mine_id: mineId || '', area_name: '', status: 'active', gps_coordinates: '', notes: '' };
}

function FormSection({ title, children }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-3.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</span>
      </div>
      <div className="px-5 py-5 space-y-3">{children}</div>
    </div>
  );
}

export default function PitFormPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams, branches, shopReady } = useShopApi();
  const isRTL = lang === 'ur';

  const [form, setForm] = useState(() => emptyForm(searchParams.get('mine_id')));
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const load = useCallback(async () => {
    if (!isEdit) {
      setForm(emptyForm(searchParams.get('mine_id')));
      return;
    }
    if (!shopReady) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/pits/${id}`, { params: shopParams() });
      const p = data.pit;
      setForm({
        mine_id: p.mine_id ? String(p.mine_id) : '',
        area_name: p.area_name || '',
        status: p.status || 'active',
        gps_coordinates: p.gps_coordinates || '',
        notes: p.notes || '',
      });
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
      navigate('/admin/pits');
    } finally {
      setLoading(false);
    }
  }, [isEdit, id, shopParams, shopReady, error, t, navigate, searchParams]);

  useEffect(() => { load(); }, [load]);

  const submit = async (ev) => {
    ev.preventDefault();
    if (!form.mine_id) {
      error(`${t('required') || 'Required'}: ${t('selectBranch') || 'Mine'}`);
      return;
    }
    if (!form.area_name?.trim()) {
      error(`${t('required') || 'Required'}: ${t('areaName')}`);
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, mine_id: parseInt(form.mine_id, 10), ...shopParams() };
      if (isEdit) {
        await api.put(`/pits/${id}`, payload);
        success(t('pitUpdated'));
      } else {
        await api.post('/pits', payload);
        success(t('pitCreated'));
      }
      navigate('/admin/pits');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>;
  }

  return (
    <div className="space-y-6 w-full" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={CircleDot}
        accent="cyan"
        title={isEdit ? (t('editPit') || 'Edit Pit') : (t('createPit') || 'Create Pit')}
        subtitle={t('pitsSub') || 'Excavation area within a mine'}
        action={
          <button type="button" onClick={() => navigate('/admin/pits')} className="btn-secondary flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
          </button>
        }
      />

      <form onSubmit={submit} className="space-y-4">
        <FormSection title={t('mineBasicInfo') || 'Basic Info'}>
          <div>
            <FormLabel required>{t('selectBranch') || 'Mine'}</FormLabel>
            <select className="input" required value={form.mine_id} onChange={setF('mine_id')}>
              <option value="">{t('selectBranch') || '-- Select Mine --'}</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <FormLabel required>{t('areaName')}</FormLabel>
            <input className="input" required value={form.area_name} onChange={setF('area_name')} />
          </div>
          <div>
            <FormLabel>{t('status')}</FormLabel>
            <select className="input" value={form.status} onChange={setF('status')}>
              {MINE_STATUSES.map(s => (
                <option key={s.value} value={s.value}>{t(s.labelKey) || s.value}</option>
              ))}
            </select>
          </div>
          <div>
            <FormLabel>{t('gpsCoordinates') || 'GPS Coordinates'}</FormLabel>
            <input className="input" placeholder="e.g. 30.1798° N, 66.9750° E" value={form.gps_coordinates} onChange={setF('gps_coordinates')} />
          </div>
          <div>
            <FormLabel>{t('notes')}</FormLabel>
            <textarea className="input min-h-[70px]" value={form.notes} onChange={setF('notes')} />
          </div>
        </FormSection>

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={() => navigate('/admin/pits')} className="btn-secondary">{t('cancel')}</button>
          <button type="submit" disabled={saving} className="btn-primary min-w-[140px]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (t('save') || 'Save')}
          </button>
        </div>
      </form>
    </div>
  );
}
