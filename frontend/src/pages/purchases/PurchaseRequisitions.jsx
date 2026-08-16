import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Eye, Edit, Trash2, Loader2, Search, Printer } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import { useFiscalYear } from '../../context/FiscalYearContext';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import api from '../../api/axios';

const STATUS_BADGE = {
  draft: 'badge-yellow',
  submitted: 'badge-blue',
  approved: 'badge-green',
  rejected: 'badge-red',
  closed: 'badge-gray',
};

export default function PurchaseRequisitions() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams, shopId, shopReady } = useShopApi();
  const { listParams } = useFiscalYear();
  const navigate = useNavigate();
  const isRTL = lang === 'ur';

  const [requisitions, setRequisitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchData = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const params = {
        ...shopParams(),
        ...listParams,
        search: search.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      };
      const { data } = await api.get('/purchase-requisitions', { params });
      setRequisitions(data.purchase_requisitions || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, shopReady, listParams, search, statusFilter, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openPrint = (id, autoPrint = false) => {
    const qs = new URLSearchParams();
    if (shopId) qs.set('shop_id', shopId);
    if (autoPrint) qs.set('auto_print', '1');
    const q = qs.toString();
    window.open(`/purchase-requisition/${id}${q ? `?${q}` : ''}`, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = async (pr) => {
    const ok = await confirm({
      title: t('delete') || 'Delete',
      message: t('confirmDeletePR') || 'Delete this purchase requisition?',
      confirmLabel: t('delete') || 'Delete',
    });
    if (!ok) return;
    try {
      await api.delete(`/purchase-requisitions/${pr.id}`, { params: shopParams() });
      success(t('prDeleted') || 'Purchase requisition deleted');
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const statusLabel = (status) => {
    const map = {
      draft: t('prStatusDraft') || 'Draft',
      submitted: t('prStatusSubmitted') || 'Submitted',
      approved: t('prStatusApproved') || 'Approved',
      rejected: t('prStatusRejected') || 'Rejected',
      closed: t('prStatusClosed') || 'Closed',
    };
    return map[status] || status;
  };

  const priorityLabel = (priority) => (
    priority === 'urgent' ? (t('priorityUrgent') || 'Urgent') : (t('priorityNormal') || 'Normal')
  );

  const dateCell = (v) => (v ? new Date(v).toLocaleDateString('en-PK') : '');

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={FileText}
        accent="indigo"
        title={t('purchaseRequisitions') || 'Purchase Requisitions'}
        subtitle={t('purchaseRequisitionsSub') || 'Create and manage internal purchase requisition forms'}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={`${t('purchaseRequisitions') || 'Purchase Requisitions'} Report`}
              signature
              columns={[
                { header: t('prNumber') || 'PR Number', key: 'pr_number', width: 1.2 },
                { header: t('requisitionDate') || 'Date', render: r => dateCell(r.requisition_date), width: 1 },
                { header: t('requiredDate') || 'Required By', render: r => dateCell(r.required_date), width: 1 },
                { header: t('requestedBy') || 'Requested By', render: r => r.Requester?.name || '', width: 1.3 },
                { header: t('department') || 'Department', key: 'department', width: 1 },
                { header: t('mine') || 'Mine', render: r => r.Branch?.name || '', width: 1.2 },
                { header: t('priority') || 'Priority', render: r => priorityLabel(r.priority), width: 0.8 },
                { header: t('total') || 'Total', render: r => formatPKR(r.total), width: 1, money: true },
                { header: t('status') || 'Status', render: r => statusLabel(r.status), width: 1 },
              ]}
              rows={requisitions}
              filename="purchase-requisitions.pdf"
            />
            <button type="button" onClick={() => navigate('/purchase-workflow/requisitions/create')} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('createPR') || 'New Requisition'}
            </button>
          </div>
        }
      />

      <div className="glass-card p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingInlineStart: '2.5rem' }}
            placeholder={t('searchPR') || 'Search PR number, department, requester…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">{t('allStatuses') || 'All statuses'}</option>
          <option value="draft">{t('prStatusDraft') || 'Draft'}</option>
          <option value="submitted">{t('prStatusSubmitted') || 'Submitted'}</option>
          <option value="approved">{t('prStatusApproved') || 'Approved'}</option>
          <option value="closed">{t('prStatusClosed') || 'Closed'}</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4 font-medium">{t('prNumber') || 'PR Number'}</th>
                <th className="text-start p-4 font-medium">{t('requisitionDate') || 'Date'}</th>
                <th className="text-start p-4 font-medium">{t('requiredDate') || 'Required By'}</th>
                <th className="text-start p-4 font-medium">{t('requestedBy') || 'Requested By'}</th>
                <th className="text-start p-4 font-medium">{t('department') || 'Department'}</th>
                <th className="text-start p-4 font-medium">{t('mine') || 'Mine'}</th>
                <th className="text-start p-4 font-medium">{t('priority') || 'Priority'}</th>
                <th className="text-start p-4 font-medium">{t('total') || 'Total'}</th>
                <th className="text-start p-4 font-medium">{t('status') || 'Status'}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {requisitions.map(pr => (
                <tr key={pr.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{pr.pr_number}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{pr.requisition_date || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{pr.required_date || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{pr.Requester?.name || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{pr.department || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{pr.Branch?.name || '—'}</td>
                  <td className="p-4">
                    <span className={`badge ${pr.priority === 'urgent' ? 'badge-red' : 'badge-gray'}`}>
                      {priorityLabel(pr.priority)}
                    </span>
                  </td>
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{formatPKR(pr.total)}</td>
                  <td className="p-4">
                    <span className={`badge ${STATUS_BADGE[pr.status] || 'badge-gray'}`}>{statusLabel(pr.status)}</span>
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" title={t('view') || 'View'} onClick={() => navigate(`/purchase-workflow/requisitions/${pr.id}`)} className="icon-btn">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button type="button" title={t('print') || 'Print'} onClick={() => openPrint(pr.id)} className="icon-btn">
                        <Printer className="w-4 h-4" />
                      </button>
                      {pr.status === 'draft' && (
                        <>
                          <button type="button" title={t('edit') || 'Edit'} onClick={() => navigate(`/purchase-workflow/requisitions/${pr.id}/edit`)} className="icon-btn">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button type="button" title={t('delete') || 'Delete'} onClick={() => handleDelete(pr)} className="icon-btn text-red-400">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {requisitions.length === 0 && (
                <tr><td colSpan={10} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noPRs') || 'No purchase requisitions yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
