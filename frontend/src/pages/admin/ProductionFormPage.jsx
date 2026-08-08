import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Factory } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import FormLabel from '../../components/ui/FormLabel';
import api from '../../api/axios';
import { SHIFTS } from '../../utils/shiftOptions';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY = {
  date: todayStr(), mine_id: '', pit_id: '', bench_id: '', shift: '',
  mineral_id: '', quantity: '', unit: 'kg', supervisor_id: '', remarks: '',
};

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

export default function ProductionFormPage() {
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
  const [allBenches, setAllBenches] = useState([]);
  const [minerals, setMinerals] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const load = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const [pitsRes, benchesRes, mineralsRes, employeesRes] = await Promise.all([
        api.get('/pits', { params: { ...shopParams(), all: 1 } }),
        api.get('/benches', { params: { ...shopParams(), all: 1 } }),
        api.get('/minerals', { params: shopParams() }),
        api.get('/employees', { params: shopParams() }),
      ]);
      setAllPits(pitsRes.data.pits || []);
      setAllBenches(benchesRes.data.benches || []);
      setMinerals(mineralsRes.data.minerals || []);
      setEmployees((employeesRes.data.employees || []).filter(emp =>
        emp.status === 'active' && (emp.Designation?.name || '').trim().toLowerCase() === 'supervisor'
      ));

      if (isEdit) {
        const { data } = await api.get(`/production/${id}`, { params: shopParams() });
        const p = data.entry;
        setForm({
          date: p.date || todayStr(),
          mine_id: p.mine_id ? String(p.mine_id) : '',
          pit_id: p.pit_id ? String(p.pit_id) : '',
          bench_id: p.bench_id ? String(p.bench_id) : '',
          shift: p.shift || '',
          mineral_id: p.mineral_id ? String(p.mineral_id) : '',
          quantity: p.quantity != null ? String(p.quantity) : '',
          unit: p.unit || 'kg',
          supervisor_id: p.supervisor_id ? String(p.supervisor_id) : '',
          remarks: p.remarks || '',
        });
      } else {
        const benchId = searchParams.get('bench_id');
        const preselectedBench = benchId ? benchesRes.data.benches.find(b => String(b.id) === benchId) : null;
        const preselectedPit = preselectedBench
          ? pitsRes.data.pits.find(p => String(p.id) === String(preselectedBench.pit_id))
          : null;
        setForm({
          ...EMPTY,
          mine_id: preselectedPit ? String(preselectedPit.mine_id) : '',
          pit_id: preselectedPit ? String(preselectedPit.id) : '',
          bench_id: preselectedBench ? String(preselectedBench.id) : '',
        });
      }
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
      if (isEdit) navigate('/admin/production');
    } finally {
      setLoading(false);
    }
  }, [isEdit, id, shopParams, shopReady, error, t, navigate, searchParams]);

  useEffect(() => { load(); }, [load]);

  const pitsForMine = allPits.filter(p => form.mine_id && String(p.mine_id) === String(form.mine_id));
  const benchesForPit = allBenches.filter(b => form.pit_id && String(b.pit_id) === String(form.pit_id));

  const onMineralChange = (e) => {
    const mineralId = e.target.value;
    const mineral = minerals.find(m => String(m.id) === mineralId);
    setForm(f => ({ ...f, mineral_id: mineralId, unit: mineral?.unit || f.unit }));
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!form.mine_id || !form.pit_id || !form.bench_id) {
      error(`${t('required') || 'Required'}: ${t('selectBranch') || 'Mine'} / ${t('selectPit')} / ${t('selectBench')}`);
      return;
    }
    if (!form.date) {
      error(`${t('required') || 'Required'}: ${t('date')}`);
      return;
    }
    if (!form.supervisor_id) {
      error(`${t('required') || 'Required'}: ${t('supervisor')}`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        mine_id: parseInt(form.mine_id, 10),
        pit_id: parseInt(form.pit_id, 10),
        bench_id: parseInt(form.bench_id, 10),
        mineral_id: form.mineral_id ? parseInt(form.mineral_id, 10) : null,
        supervisor_id: form.supervisor_id ? parseInt(form.supervisor_id, 10) : null,
        quantity: parseFloat(form.quantity) || 0,
        ...shopParams(),
      };
      if (isEdit) {
        await api.put(`/production/${id}`, payload);
        success(t('productionUpdated'));
      } else {
        await api.post('/production', payload);
        success(t('productionCreated'));
      }
      navigate('/admin/production');
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
        icon={Factory}
        accent="cyan"
        title={isEdit ? (t('editProduction') || 'Edit Production') : (t('createProduction') || 'Create Production')}
        subtitle={t('productionSub') || 'Daily mineral output at a bench'}
        action={
          <button type="button" onClick={() => navigate('/admin/production')} className="btn-secondary flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
          </button>
        }
      />

      <form onSubmit={submit} className="space-y-4">
        <FormSection title={t('mineBasicInfo') || 'Basic Info'}>
          <div>
            <FormLabel required>{t('date')}</FormLabel>
            <input className="input" type="date" required value={form.date} onChange={setF('date')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <FormLabel required>{t('selectBranch') || 'Mine'}</FormLabel>
              <select
                className="input"
                required
                value={form.mine_id}
                onChange={e => setForm(f => ({ ...f, mine_id: e.target.value, pit_id: '', bench_id: '' }))}
              >
                <option value="">{t('selectBranch') || '-- Select Mine --'}</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <FormLabel required>{t('selectPit') || 'Pit'}</FormLabel>
              <select
                className="input"
                required
                disabled={!form.mine_id}
                value={form.pit_id}
                onChange={e => setForm(f => ({ ...f, pit_id: e.target.value, bench_id: '' }))}
              >
                <option value="">{t('selectPit') || '-- Select Pit --'}</option>
                {pitsForMine.map(p => <option key={p.id} value={p.id}>{p.area_name}</option>)}
              </select>
            </div>
            <div>
              <FormLabel required>{t('selectBench') || 'Bench'}</FormLabel>
              <select className="input" required disabled={!form.pit_id} value={form.bench_id} onChange={setF('bench_id')}>
                <option value="">{t('selectBench') || '-- Select Bench --'}</option>
                {benchesForPit.map(b => <option key={b.id} value={b.id}>{b.bench_number}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FormLabel>{t('shift')}</FormLabel>
              <select className="input" value={form.shift} onChange={setF('shift')}>
                <option value="">{t('none') || '--'}</option>
                {SHIFTS.map(s => <option key={s.value} value={s.value}>{t(s.labelKey) || s.value}</option>)}
              </select>
            </div>
            <div>
              <FormLabel required>{t('supervisor')}</FormLabel>
              <select className="input" required value={form.supervisor_id} onChange={setF('supervisor_id')}>
                <option value="">{t('selectSupervisor') || '-- Select Supervisor --'}</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
          </div>
        </FormSection>

        <FormSection title={t('production') || 'Production'}>
          <div>
            <FormLabel>{t('mineralType') || 'Mineral'}</FormLabel>
            <select className="input" value={form.mineral_id} onChange={onMineralChange}>
              <option value="">{t('selectMineral') || '-- Select Mineral --'}</option>
              {minerals.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FormLabel required>{t('quantity')}</FormLabel>
              <input className="input" type="number" min="0" step="0.001" required value={form.quantity} onChange={setF('quantity')} />
            </div>
            <div>
              <FormLabel>{t('unit')}</FormLabel>
              <input className="input" value={form.unit} onChange={setF('unit')} />
            </div>
          </div>
          <div>
            <FormLabel>{t('remarks')}</FormLabel>
            <textarea className="input min-h-[70px]" value={form.remarks} onChange={setF('remarks')} />
          </div>
        </FormSection>

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={() => navigate('/admin/production')} className="btn-secondary">{t('cancel')}</button>
          <button type="submit" disabled={saving} className="btn-primary min-w-[140px]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (t('save') || 'Save')}
          </button>
        </div>
      </form>
    </div>
  );
}
