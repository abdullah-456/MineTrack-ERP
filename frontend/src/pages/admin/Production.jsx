import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Factory, Plus, Edit, Trash2, Loader2, Search, Sun, Sunset, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import api from '../../api/axios';
import { formatProductionTotal } from '../../utils/productionFormat';
import { SHIFTS } from '../../utils/shiftOptions';

function StatCard({ icon: Icon, title, value, color }) {
  return (
    <div className="stat-card flex items-center gap-3">
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{value || '—'}</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{title}</p>
      </div>
    </div>
  );
}

export default function Production() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams, branches, shopReady } = useShopApi();
  const navigate = useNavigate();
  const isRTL = lang === 'ur';

  const [entries, setEntries] = useState([]);
  const [pits, setPits] = useState([]);
  const [benches, setBenches] = useState([]);
  const [minerals, setMinerals] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [stats, setStats] = useState({ today: [], week: [], month: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mineFilter, setMineFilter] = useState('');
  const [pitFilter, setPitFilter] = useState('');
  const [benchFilter, setBenchFilter] = useState('');
  const [mineralFilter, setMineralFilter] = useState('');
  const [supervisorFilter, setSupervisorFilter] = useState('');
  const [shiftFilter, setShiftFilter] = useState('');

  const scopeParams = useCallback(() => {
    const p = {};
    if (mineFilter) p.mine_id = mineFilter;
    if (pitFilter) p.pit_id = pitFilter;
    if (benchFilter) p.bench_id = benchFilter;
    if (mineralFilter) p.mineral_id = mineralFilter;
    if (supervisorFilter) p.supervisor_id = supervisorFilter;
    if (shiftFilter) p.shift = shiftFilter;
    return p;
  }, [mineFilter, pitFilter, benchFilter, mineralFilter, supervisorFilter, shiftFilter]);

  const fetchData = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const [eRes, pRes, bRes, mRes, sRes, empRes] = await Promise.all([
        api.get('/production', { params: { ...shopParams(), ...scopeParams() } }),
        api.get('/pits', { params: { ...shopParams(), all: 1, ...(mineFilter ? { mine_id: mineFilter } : {}) } }),
        api.get('/benches', { params: { ...shopParams(), all: 1, ...(pitFilter ? { pit_id: pitFilter } : mineFilter ? { mine_id: mineFilter } : {}) } }),
        api.get('/minerals', { params: shopParams() }),
        api.get('/production/stats', { params: { ...shopParams(), ...scopeParams() } }),
        api.get('/employees', { params: shopParams() }),
      ]);
      setEntries(eRes.data.entries || []);
      setPits(pRes.data.pits || []);
      setBenches(bRes.data.benches || []);
      setMinerals(mRes.data.minerals || []);
      setStats(sRes.data || { today: [], week: [], month: [] });
      setSupervisors((empRes.data.employees || []).filter(emp =>
        emp.status === 'active' && (emp.Designation?.name || '').trim().toLowerCase() === 'supervisor'
      ));
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, shopReady, scopeParams, mineFilter, pitFilter, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (p) => {
    const ok = await confirm({ title: t('delete'), message: t('confirmDeleteProduction'), confirmLabel: t('delete'), cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      await api.delete(`/production/${p.id}`, { params: shopParams() });
      success(t('productionDeleted'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const shiftLabel = (s) => {
    if (!s) return '—';
    const map = { morning: t('shiftMorning'), evening: t('shiftEvening'), night: t('shiftNight') };
    return map[s] || s;
  };

  const filtered = entries.filter(p => !search.trim() || [
    p.Mine?.name, p.Pit?.area_name, p.Bench?.bench_number, p.Mineral?.name, p.Supervisor?.name, p.shift,
  ].some(v => (v || '').toLowerCase().includes(search.trim().toLowerCase())));

  const activeFilterLabel = [
    mineFilter && branches.find(b => String(b.id) === String(mineFilter))?.name,
    pitFilter && pits.find(p => String(p.id) === String(pitFilter))?.area_name,
    benchFilter && benches.find(b => String(b.id) === String(benchFilter))?.bench_number,
    mineralFilter && minerals.find(m => String(m.id) === String(mineralFilter))?.name,
    shiftFilter && shiftLabel(shiftFilter),
    supervisorFilter && supervisors.find(s => String(s.id) === String(supervisorFilter))?.name,
  ].filter(Boolean).join(' / ');

  const cardTitle = (base) => (activeFilterLabel ? `${activeFilterLabel} — ${base}` : base);

  // Price isn't logged per entry — value it at the produced mineral's default
  // price (same convention as the Reports Hub Production report).
  const amountFor = (p) => {
    const price = parseFloat(minerals.find(m => m.id === p.mineral_id)?.default_price) || 0;
    return (parseFloat(p.quantity) || 0) * price;
  };

  // Quantity is grouped by unit before summing — a filtered view can still mix
  // kg/tons/carats, and a flat sum across units would be meaningless.
  const quantityTotalsByUnit = Object.values(filtered.reduce((acc, p) => {
    const unit = p.unit || '';
    const row = acc[unit] || (acc[unit] = { unit, total: 0 });
    row.total += parseFloat(p.quantity) || 0;
    return acc;
  }, {}));
  const exportTotals = filtered.length ? {
    __label: t('total') || 'Total',
    quantity: formatProductionTotal(quantityTotalsByUnit),
    amount: filtered.reduce((sum, p) => sum + amountFor(p), 0),
  } : null;

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Factory}
        accent="cyan"
        title={t('production')}
        subtitle={t('productionSub')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={`${t('production') || 'Production Minerals'} Report`}
              signature
              columns={[
                { header: t('date') || 'Date', key: 'date', width: 1 },
                { header: t('mineColumnLabel') || 'Mine', render: p => p.Mine?.name || '', width: 1.2 },
                { header: t('pitColumnLabel') || 'Pit', render: p => p.Pit?.area_name || '', width: 1.2 },
                { header: t('benchColumnLabel') || 'Bench', render: p => p.Bench?.bench_number || '', width: 1 },
                { header: t('mineralType') || 'Mineral', render: p => p.Mineral?.name || '', width: 1.2 },
                { header: t('quantity') || 'Qty', key: 'quantity', width: 1 },
                { header: t('unit') || 'Unit', key: 'unit', width: 0.8 },
                { header: t('amount') || 'Amount', key: 'amount', render: amountFor, money: true, width: 1.2 },
              ]}
              rows={filtered}
              totals={exportTotals}
              filename="production.pdf"
            />
            <button type="button" onClick={() => navigate('/admin/production/create')} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('createProduction')}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={Sun} title={cardTitle(t('todaysProduction'))} value={formatProductionTotal(stats.today)} color="bg-emerald-500/20 text-emerald-500" />
        <StatCard icon={Sunset} title={cardTitle(t('weeklyProduction'))} value={formatProductionTotal(stats.week)} color="bg-indigo-500/20 text-indigo-500" />
        <StatCard icon={Moon} title={cardTitle(t('monthlyProduction'))} value={formatProductionTotal(stats.month)} color="bg-purple-500/20 text-purple-500" />
      </div>

      <div className="glass-card p-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingInlineStart: '2.5rem' }}
            placeholder={t('searchProduction') || 'Search mine, pit, bench, mineral, supervisor…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input max-w-xs" value={mineFilter} onChange={e => { setMineFilter(e.target.value); setPitFilter(''); setBenchFilter(''); }}>
          <option value="">{t('allBranches') || 'All Mines'}</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="input max-w-xs" disabled={!mineFilter} value={pitFilter} onChange={e => { setPitFilter(e.target.value); setBenchFilter(''); }}>
          <option value="">{t('selectPit') || 'All Pits'}</option>
          {pits.map(p => <option key={p.id} value={p.id}>{p.area_name}</option>)}
        </select>
        <select className="input max-w-xs" disabled={!pitFilter} value={benchFilter} onChange={e => setBenchFilter(e.target.value)}>
          <option value="">{t('selectBench') || 'All Benches'}</option>
          {benches.map(b => <option key={b.id} value={b.id}>{b.bench_number}</option>)}
        </select>
        <select className="input max-w-xs" value={mineralFilter} onChange={e => setMineralFilter(e.target.value)}>
          <option value="">{t('selectMineral') || 'All Minerals'}</option>
          {minerals.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select className="input max-w-xs" value={supervisorFilter} onChange={e => setSupervisorFilter(e.target.value)}>
          <option value="">{t('allSupervisors') || 'All Supervisors'}</option>
          {supervisors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="input max-w-xs" value={shiftFilter} onChange={e => setShiftFilter(e.target.value)}>
          <option value="">{t('allShifts') || 'All Shifts'}</option>
          {SHIFTS.map(s => <option key={s.value} value={s.value}>{t(s.labelKey) || s.value}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4 font-medium">{t('date')}</th>
                <th className="text-start p-4 font-medium">{t('mineColumnLabel') || 'Mine'}</th>
                <th className="text-start p-4 font-medium">{t('pitColumnLabel') || 'Pit'}</th>
                <th className="text-start p-4 font-medium">{t('benchColumnLabel') || 'Bench'}</th>
                <th className="text-start p-4 font-medium">{t('shift')}</th>
                <th className="text-start p-4 font-medium">{t('mineralType') || 'Mineral'}</th>
                <th className="text-end p-4 font-medium">{t('quantity')}</th>
                <th className="text-start p-4 font-medium">{t('supervisor')}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{p.date}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{p.Mine?.name || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{p.Pit?.area_name || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{p.Bench?.bench_number || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{shiftLabel(p.shift)}</td>
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{p.Mineral?.name || '—'}</td>
                  <td className="p-4 text-end" style={{ color: 'var(--text-secondary)' }}>{Number(p.quantity).toLocaleString()} {p.unit}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{p.Supervisor?.name || '—'}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => navigate(`/admin/production/${p.id}/edit`)} className="icon-btn">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleDelete(p)} className="icon-btn text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noProduction')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
