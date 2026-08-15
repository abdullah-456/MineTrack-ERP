import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, Plus, Eye, Loader2, Printer } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import api from '../../api/axios';

const STATUS_BADGE = {
  in_progress: 'badge-blue',
  completed: 'badge-green',
  cancelled: 'badge-red',
};

export default function WorkshopJobs() {
  const { t, lang } = useTheme();
  const { error } = useToast();
  const { shopParams, shopId, shopReady, branches } = useShopApi();
  const navigate = useNavigate();
  const isRTL = lang === 'ur';

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [branchId, setBranchId] = useState('');

  const fetchData = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const params = { ...shopParams() };
      if (status) params.status = status;
      if (branchId) params.branch_id = branchId;
      const { data } = await api.get('/workshops/jobs', { params });
      setJobs(data.jobs || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, shopReady, status, branchId, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openPrint = (id) => {
    const qs = new URLSearchParams();
    if (shopId) qs.set('shop_id', shopId);
    window.open(`/workshop-job/${id}?${qs.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const statusLabel = (s) => t(`workshopJobStatus_${s}`) || s.replace('_', ' ');

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Wrench}
        accent="amber"
        title={t('workshopJobs') || 'Workshop Jobs'}
        subtitle={t('workshopJobsSub') || 'Vehicles in the workshop — parts used, labor and total cost per job'}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={`${t('workshopJobs') || 'Workshop Jobs'} Report`}
              signature
              columns={[
                { header: t('jobNumber') || 'Job #', key: 'job_number', width: 1.2 },
                { header: t('vehicle') || 'Vehicle', render: j => j.Vehicle?.vehicle_number || '', width: 1.2 },
                { header: t('mine') || 'Mine', render: j => j.Branch?.name || '', width: 1.2 },
                { header: t('dateIn') || 'Date In', key: 'date_in', width: 1 },
                { header: t('performedBy') || 'Performed By', render: j => j.Employee?.name || j.mechanic_name || '', width: 1.2 },
                { header: t('laborCost') || 'Labor', render: j => formatPKR(j.labor_cost), width: 1, money: true },
                { header: t('partsCost') || 'Parts', render: j => formatPKR(j.parts_cost), width: 1, money: true },
                { header: t('totalCost') || 'Total', render: j => formatPKR(j.total_cost), width: 1, money: true },
                { header: t('status') || 'Status', render: j => statusLabel(j.status), width: 1 },
              ]}
              rows={jobs}
              filename="workshop-jobs.pdf"
            />
            <button type="button" onClick={() => navigate('/workshops/jobs/create')} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('newWorkshopJob') || 'New Job'}
            </button>
          </div>
        }
      />

      <div className="glass-card p-4 flex flex-wrap gap-3">
        <select className="input max-w-[200px]" value={branchId} onChange={e => setBranchId(e.target.value)}>
          <option value="">{t('allMines') || 'All mines'}</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="input max-w-[200px]" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">{t('allStatuses') || 'All statuses'}</option>
          <option value="in_progress">{t('workshopJobStatus_in_progress') || 'In Progress'}</option>
          <option value="completed">{t('workshopJobStatus_completed') || 'Completed'}</option>
          <option value="cancelled">{t('workshopJobStatus_cancelled') || 'Cancelled'}</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4 font-medium">{t('jobNumber') || 'Job #'}</th>
                <th className="text-start p-4 font-medium">{t('vehicle') || 'Vehicle'}</th>
                <th className="text-start p-4 font-medium">{t('mine') || 'Mine'}</th>
                <th className="text-start p-4 font-medium">{t('dateIn') || 'Date In'}</th>
                <th className="text-start p-4 font-medium">{t('performedBy') || 'Performed By'}</th>
                <th className="text-start p-4 font-medium">{t('totalCost') || 'Total'}</th>
                <th className="text-start p-4 font-medium">{t('status') || 'Status'}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(j => (
                <tr key={j.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{j.job_number}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{j.Vehicle?.vehicle_number || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{j.Branch?.name || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{j.date_in}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{j.Employee?.name || j.mechanic_name || '—'}</td>
                  <td className="p-4 font-medium">{formatPKR(j.total_cost)}</td>
                  <td className="p-4"><span className={`badge ${STATUS_BADGE[j.status] || 'badge-gray'}`}>{statusLabel(j.status)}</span></td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => navigate(`/workshops/jobs/${j.id}`)} className="icon-btn"><Eye className="w-4 h-4" /></button>
                      <button type="button" onClick={() => openPrint(j.id)} className="icon-btn"><Printer className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noWorkshopJobs') || 'No workshop jobs yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
