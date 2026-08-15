import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Plus, Edit, Trash2, Loader2, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import api from '../../api/axios';
import { formatSalaryMonth } from '../../utils/attendanceStatus';

const monthStr = () => new Date().toISOString().slice(0, 7);

export default function TruckLoading() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams, branches, shopReady } = useShopApi();
  const navigate = useNavigate();
  const isRTL = lang === 'ur';

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState(monthStr());
  const [mineFilter, setMineFilter] = useState('');

  const fetchData = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const params = { ...shopParams() };
      if (month) params.month = month;
      if (mineFilter) params.mine_id = mineFilter;
      const { data } = await api.get('/truck-loading', { params });
      setLogs(data.logs || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, shopReady, month, mineFilter, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (log) => {
    const ok = await confirm({
      title: t('delete') || 'Delete',
      message: t('confirmDeleteTruckLoading')
        || 'Delete this truck loading log? Commission already paid on a past payslip is not affected.',
      confirmLabel: t('delete') || 'Delete',
      cancelLabel: t('cancel') || 'Cancel',
    });
    if (!ok) return;
    try {
      await api.delete(`/truck-loading/${log.id}`, { params: shopParams() });
      success(t('truckLoadingDeleted') || 'Truck loading log deleted');
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const filtered = logs.filter(l => !search.trim()
    || [l.mine_name, l.month].some(v => (v || '').toLowerCase().includes(search.trim().toLowerCase())));

  const exportColumns = [
    { header: t('month') || 'Month', render: l => formatSalaryMonth(l.month), width: 1.1 },
    { header: t('mineColumnLabel') || 'Mine', render: l => l.mine_name || '', width: 1.5 },
    { header: t('totalTrucks') || 'Total Trucks', key: 'total_trucks', align: 'right', width: 1.1 },
    { header: t('totalTons') || 'Total Tons', key: 'total_tons', align: 'right', width: 1.1 },
    { header: t('daysLogged') || 'Days Logged', key: 'days_logged', align: 'right', width: 1 },
    { header: t('eligibleEmployees') || 'Eligible', key: 'eligible_count', align: 'right', width: 0.9 },
    { header: t('totalCommission') || 'Total Commission', key: 'total_commission', money: true, width: 1.4 },
  ];

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Truck}
        accent="amber"
        title={t('truckLoading') || 'Truck Loading'}
        subtitle={t('truckLoadingSub') || 'Log trucks loaded per mine each month and set the commission rate'}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={t('truckLoading') || 'Truck Loading'}
              columns={exportColumns}
              rows={filtered}
              totals={{
                __label: t('total') || 'Total',
                total_trucks: filtered.reduce((s, l) => s + (l.total_trucks || 0), 0),
                total_tons: Math.round(filtered.reduce((s, l) => s + (l.total_tons || 0), 0) * 1000) / 1000,
                days_logged: filtered.reduce((s, l) => s + (l.days_logged || 0), 0),
                total_commission: filtered.reduce((s, l) => s + (l.total_commission || 0), 0),
              }}
              filename="truck-loading.pdf"
              columnPicker
            />
            <button type="button" onClick={() => navigate('/admin/truck-loading/create')} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('createTruckLoading') || 'New Log'}
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
            placeholder={t('searchTruckLoading') || 'Search mine or month…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <input className="input max-w-[12rem]" type="month" value={month} onChange={e => setMonth(e.target.value)} />
        <button type="button" className="btn-secondary text-sm" onClick={() => setMonth('')}>
          {t('allMonths') || 'All Months'}
        </button>
        <select className="input max-w-xs" value={mineFilter} onChange={e => setMineFilter(e.target.value)}>
          <option value="">{t('allBranches') || 'All Mines'}</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-amber-400" /></div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4 font-medium">{t('month') || 'Month'}</th>
                <th className="text-start p-4 font-medium">{t('mineColumnLabel') || 'Mine'}</th>
                <th className="text-end p-4 font-medium">{t('totalTrucks') || 'Total Trucks'}</th>
                <th className="text-end p-4 font-medium">{t('totalTons') || 'Total Tons'}</th>
                <th className="text-end p-4 font-medium">{t('daysLogged') || 'Days Logged'}</th>
                <th className="text-end p-4 font-medium">{t('eligibleEmployees') || 'Eligible'}</th>
                <th className="text-end p-4 font-medium">{t('totalCommission') || 'Total Commission'}</th>
                <th className="text-end p-4 font-medium">{t('actions') || 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr
                  key={l.id}
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  className="hover:bg-white/5 cursor-pointer transition-colors"
                  onClick={(e) => {
                    if (e.target.closest('button')) return;
                    navigate(`/admin/truck-loading/${l.id}/edit`);
                  }}
                >
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{formatSalaryMonth(l.month)}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{l.mine_name || '—'}</td>
                  <td className="p-4 text-end" style={{ color: 'var(--text-secondary)' }}>{(l.total_trucks || 0).toLocaleString()}</td>
                  <td className="p-4 text-end" style={{ color: 'var(--text-secondary)' }}>{(l.total_tons || 0).toLocaleString()}</td>
                  <td className="p-4 text-end" style={{ color: 'var(--text-secondary)' }}>{l.days_logged || 0}</td>
                  <td className="p-4 text-end" style={{ color: 'var(--text-secondary)' }}>{l.eligible_count || 0}</td>
                  {/* The sum across everyone eligible — each of them earns
                      their own figure in FULL, it is not a pool being split. */}
                  <td className="p-4 text-end font-semibold text-amber-400">{formatPKR(l.total_commission, lang)}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => navigate(`/admin/truck-loading/${l.id}/edit`)} className="icon-btn">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleDelete(l)} className="icon-btn text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noTruckLoading') || 'No truck loading logs yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
