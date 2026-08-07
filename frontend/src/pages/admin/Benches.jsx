import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Plus, Eye, Edit, Ban, RotateCcw, Loader2, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import api from '../../api/axios';
import { getMineStatusMeta } from '../../utils/mineStatus';

export default function Benches() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams, branches, shopReady } = useShopApi();
  const navigate = useNavigate();
  const isRTL = lang === 'ur';

  const [benches, setBenches] = useState([]);
  const [pits, setPits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mineFilter, setMineFilter] = useState('');
  const [pitFilter, setPitFilter] = useState('');

  const fetchData = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const params = { ...shopParams(), all: 1 };
      if (mineFilter) params.mine_id = mineFilter;
      if (pitFilter) params.pit_id = pitFilter;
      const [bRes, pRes] = await Promise.all([
        api.get('/benches', { params }),
        api.get('/pits', { params: { ...shopParams(), all: 1, ...(mineFilter ? { mine_id: mineFilter } : {}) } }),
      ]);
      setBenches(bRes.data.benches || []);
      setPits(pRes.data.pits || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, shopReady, mineFilter, pitFilter, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleClose = async (b) => {
    const ok = await confirm({ title: t('close') || 'Close', message: t('confirmCloseBench'), confirmLabel: t('close') || 'Close', cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      await api.delete(`/benches/${b.id}`, { params: shopParams() });
      success(t('benchClosed'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const handleReopen = async (b) => {
    try {
      await api.put(`/benches/${b.id}`, { status: 'active', ...shopParams() });
      success(t('benchReopened'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const filtered = benches.filter(b => !search.trim() || [
    b.bench_number, b.elevation, b.Pit?.area_name, b.Pit?.Mine?.name, b.status,
  ].some(v => (v || '').toLowerCase().includes(search.trim().toLowerCase())));

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Layers}
        accent="cyan"
        title={t('benches')}
        subtitle={t('benchesSub')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={t('benches') || 'Benches'}
              columns={[
                { header: t('benchNumber') || 'Bench #', key: 'bench_number', width: 1.2 },
                { header: t('selectPit') || 'Pit', render: b => b.Pit?.area_name || '', width: 1.4 },
                { header: t('selectBranch') || 'Mine', render: b => b.Pit?.Mine?.name || '', width: 1.4 },
                { header: t('elevation') || 'Elevation', render: b => b.elevation || '', width: 1 },
                { header: t('status') || 'Status', key: 'status', width: 1 },
              ]}
              rows={filtered}
              filename="benches.pdf"
            />
            <button type="button" onClick={() => navigate('/admin/benches/create')} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('createBench')}
            </button>
          </div>
        }
      />

      <div className="glass-card p-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingInlineStart: '2.5rem' }}
            placeholder={t('searchMines') || 'Search bench, pit, mine…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input max-w-xs" value={mineFilter} onChange={e => { setMineFilter(e.target.value); setPitFilter(''); }}>
          <option value="">{t('allBranches') || 'All Mines'}</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="input max-w-xs" disabled={!mineFilter} value={pitFilter} onChange={e => setPitFilter(e.target.value)}>
          <option value="">{t('selectPit') || 'All Pits'}</option>
          {pits.map(p => <option key={p.id} value={p.id}>{p.area_name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4 font-medium">{t('benchNumber')}</th>
                <th className="text-start p-4 font-medium">{t('selectPit') || 'Pit'}</th>
                <th className="text-start p-4 font-medium">{t('selectBranch') || 'Mine'}</th>
                <th className="text-start p-4 font-medium">{t('elevation')}</th>
                <th className="text-start p-4 font-medium">{t('status')}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => {
                const meta = getMineStatusMeta(t, b.status);
                return (
                  <tr key={b.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                    <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{b.bench_number}</td>
                    <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{b.Pit?.area_name || '—'}</td>
                    <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{b.Pit?.Mine?.name || '—'}</td>
                    <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{b.elevation || '—'}</td>
                    <td className="p-4">
                      <span className={`badge ${meta.badge}`}>{meta.label}</span>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => navigate(`/admin/benches/${b.id}`)} className="icon-btn">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => navigate(`/admin/benches/${b.id}/edit`)} className="icon-btn">
                          <Edit className="w-4 h-4" />
                        </button>
                        {b.status !== 'closed' ? (
                          <button type="button" onClick={() => handleClose(b)} className="icon-btn text-red-400"><Ban className="w-4 h-4" /></button>
                        ) : (
                          <button type="button" onClick={() => handleReopen(b)} className="icon-btn text-emerald-400"><RotateCcw className="w-4 h-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noBenches')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
