import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Layers } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import FormLabel from '../../components/ui/FormLabel';
import api from '../../api/axios';
import { MINE_STATUSES } from '../../utils/mineStatus';

const EMPTY = { mine_id: '', pit_id: '', bench_number: '', elevation: '', status: 'active' };

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

export default function BenchFormPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams, branches, shopReady } = useShopApi();
  const isRTL = lang === 'ur';

  const [form, setForm] = useState(EMPTY);
  const [allPits, setAllPits] = useState([]);
  const [previewNumber, setPreviewNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const load = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const { data: pitsData } = await api.get('/pits', { params: shopParams() });
      setAllPits(pitsData.pits || []);

      if (isEdit) {
        const { data } = await api.get(`/benches/${id}`, { params: shopParams() });
        const b = data.bench;
        setForm({
          mine_id: b.Pit?.mine_id ? String(b.Pit.mine_id) : '',
          pit_id: b.pit_id ? String(b.pit_id) : '',
          bench_number: b.bench_number || '',
          elevation: b.elevation || '',
          status: b.status || 'active',
        });
        setPreviewNumber(b.bench_number || '');
      } else {
        const pitId = searchParams.get('pit_id');
        const preselectedPit = pitId ? pitsData.pits.find(p => String(p.id) === pitId) : null;
        setForm({
          mine_id: preselectedPit ? String(preselectedPit.mine_id) : '',
          pit_id: preselectedPit ? String(preselectedPit.id) : '',
          bench_number: '', elevation: '', status: 'active',
        });
        try {
          const { data } = await api.get('/benches/next-code', { params: shopParams() });
          setPreviewNumber(data.bench_number || '');
        } catch {
          setPreviewNumber('');
        }
      }
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
      if (isEdit) navigate('/admin/benches');
    } finally {
      setLoading(false);
    }
  }, [isEdit, id, shopParams, shopReady, error, t, navigate, searchParams]);

  useEffect(() => { load(); }, [load]);

  const pitsForMine = allPits.filter(p => form.mine_id && String(p.mine_id) === String(form.mine_id));

  const submit = async (ev) => {
    ev.preventDefault();
    if (!form.pit_id) {
      error(`${t('required') || 'Required'}: ${t('selectPit')}`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        pit_id: parseInt(form.pit_id, 10),
        elevation: form.elevation,
        status: form.status,
        ...shopParams(),
      };
      if (isEdit) {
        await api.put(`/benches/${id}`, payload);
        success(t('benchUpdated'));
      } else {
        await api.post('/benches', payload);
        success(t('benchCreated'));
      }
      navigate('/admin/benches');
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
        icon={Layers}
        accent="cyan"
        title={isEdit ? (t('editBench') || 'Edit Bench') : (t('createBench') || 'Create Bench')}
        subtitle={isEdit ? previewNumber : (t('benchesSub') || 'Terraced level within a pit')}
        action={
          <button type="button" onClick={() => navigate('/admin/benches')} className="btn-secondary flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
          </button>
        }
      />

      <form onSubmit={submit} className="space-y-4">
        <FormSection title={t('mineBasicInfo') || 'Basic Info'}>
          <div>
            <FormLabel required>{t('selectBranch') || 'Mine'}</FormLabel>
            <select
              className="input"
              required
              value={form.mine_id}
              onChange={e => setForm(f => ({ ...f, mine_id: e.target.value, pit_id: '' }))}
            >
              <option value="">{t('selectBranch') || '-- Select Mine --'}</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <FormLabel required>{t('selectPit') || 'Pit'}</FormLabel>
            <select className="input" required disabled={!form.mine_id} value={form.pit_id} onChange={setF('pit_id')}>
              <option value="">{t('selectPit') || '-- Select Pit --'}</option>
              {pitsForMine.map(p => <option key={p.id} value={p.id}>{p.area_name}</option>)}
            </select>
          </div>
          <div>
            <FormLabel>{t('benchNumber')}</FormLabel>
            <input className="input opacity-70" disabled value={previewNumber || (t('autoGenerated') || 'Auto-generated')} />
          </div>
          <div>
            <FormLabel>{t('elevation')}</FormLabel>
            <input className="input" placeholder="e.g. 1250m" value={form.elevation} onChange={setF('elevation')} />
          </div>
          <div>
            <FormLabel>{t('status')}</FormLabel>
            <select className="input" value={form.status} onChange={setF('status')}>
              {MINE_STATUSES.map(s => (
                <option key={s.value} value={s.value}>{t(s.labelKey) || s.value}</option>
              ))}
            </select>
          </div>
        </FormSection>

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={() => navigate('/admin/benches')} className="btn-secondary">{t('cancel')}</button>
          <button type="submit" disabled={saving} className="btn-primary min-w-[140px]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (t('save') || 'Save')}
          </button>
        </div>
      </form>
    </div>
  );
}
