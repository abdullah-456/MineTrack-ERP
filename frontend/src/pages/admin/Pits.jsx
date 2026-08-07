import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleDot, Plus, Eye, Edit, Ban, RotateCcw, Loader2, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import api from '../../api/axios';
import { getMineStatusMeta } from '../../utils/mineStatus';

export default function Pits() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams, branches, shopReady } = useShopApi();
  const navigate = useNavigate();
  const isRTL = lang === 'ur';

  const [pits, setPits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mineFilter, setMineFilter] = useState('');

  const fetchData = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const params = { ...shopParams(), all: 1 };
      if (mineFilter) params.mine_id = mineFilter;
      const { data } = await api.get('/pits', { params });
      setPits(data.pits || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, shopReady, mineFilter, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleClose = async (p) => {
    const ok = await confirm({ title: t('close') || 'Close', message: t('confirmClosePit'), confirmLabel: t('close') || 'Close', cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      await api.delete(`/pits/${p.id}`, { params: shopParams() });
      success(t('pitClosed'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const handleReopen = async (p) => {
    try {
      await api.put(`/pits/${p.id}`, { status: 'active', ...shopParams() });
      success(t('pitReopened'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const filtered = pits.filter(p => !search.trim() || [
    p.area_name, p.Mine?.name, p.gps_coordinates, p.status,
  ].some(v => (v || '').toLowerCase().includes(search.trim().toLowerCase())));

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={CircleDot}
        accent="cyan"
        title={t('pits')}
        subtitle={t('pitsSub')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={t('pits') || 'Pits'}
              columns={[
                { header: t('areaName') || 'Area Name', key: 'area_name', width: 1.6 },
                { header: t('selectBranch') || 'Mine', render: p => p.Mine?.name || '', width: 1.4 },
                { header: t('gpsCoordinates') || 'GPS', render: p => p.gps_coordinates || '', width: 1.4 },
                { header: t('status') || 'Status', key: 'status', width: 1 },
              ]}
              rows={filtered}
              filename="pits.pdf"
            />
            <button type="button" onClick={() => navigate('/admin/pits/create')} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('createPit')}
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
            placeholder={t('searchMines') || 'Search area name, mine, GPS…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input max-w-xs" value={mineFilter} onChange={e => setMineFilter(e.target.value)}>
          <option value="">{t('allBranches') || 'All Mines'}</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4 font-medium">{t('areaName')}</th>
                <th className="text-start p-4 font-medium">{t('selectBranch') || 'Mine'}</th>
                <th className="text-start p-4 font-medium">{t('gpsCoordinates') || 'GPS'}</th>
                <th className="text-start p-4 font-medium">{t('status')}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const meta = getMineStatusMeta(t, p.status);
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                    <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{p.area_name}</td>
                    <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{p.Mine?.name || '—'}</td>
                    <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{p.gps_coordinates || '—'}</td>
                    <td className="p-4">
                      <span className={`badge ${meta.badge}`}>{meta.label}</span>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => navigate(`/admin/pits/${p.id}`)} className="icon-btn">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => navigate(`/admin/pits/${p.id}/edit`)} className="icon-btn">
                          <Edit className="w-4 h-4" />
                        </button>
                        {p.status !== 'closed' ? (
                          <button type="button" onClick={() => handleClose(p)} className="icon-btn text-red-400"><Ban className="w-4 h-4" /></button>
                        ) : (
                          <button type="button" onClick={() => handleReopen(p)} className="icon-btn text-emerald-400"><RotateCcw className="w-4 h-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noPits')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
