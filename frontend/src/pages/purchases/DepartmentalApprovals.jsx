import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Plus, Eye, Trash2, Loader2, Search, Printer } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import { useFiscalYear } from '../../context/FiscalYearContext';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import api from '../../api/axios';

const DECISION_BADGE = {
  approved: 'badge-green',
  rejected: 'badge-red',
};

export default function DepartmentalApprovals() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams, shopId, shopReady } = useShopApi();
  const { listParams } = useFiscalYear();
  const navigate = useNavigate();
  const isRTL = lang === 'ur';

  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [decisionFilter, setDecisionFilter] = useState('all');

  const fetchData = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const params = {
        ...shopParams(),
        ...listParams,
        search: search.trim() || undefined,
        decision: decisionFilter !== 'all' ? decisionFilter : undefined,
      };
      const { data } = await api.get('/departmental-approvals', { params });
      setApprovals(data.departmental_approvals || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, shopReady, listParams, search, decisionFilter, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openPrint = (id, autoPrint = false) => {
    const qs = new URLSearchParams();
    if (shopId) qs.set('shop_id', shopId);
    if (autoPrint) qs.set('auto_print', '1');
    const q = qs.toString();
    window.open(`/departmental-approval/${id}${q ? `?${q}` : ''}`, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = async (da) => {
    const ok = await confirm({
      title: t('delete') || 'Delete',
      message: t('confirmDeleteDA') || 'Delete this departmental approval?',
      confirmLabel: t('delete') || 'Delete',
    });
    if (!ok) return;
    try {
      await api.delete(`/departmental-approvals/${da.id}`, { params: shopParams() });
      success(t('daDeleted') || 'Departmental approval deleted');
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const decisionLabel = (decision) => (
    decision === 'approved' ? (t('daApproved') || 'Approved') : (t('daRejected') || 'Rejected')
  );

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={ShieldCheck}
        accent="violet"
        title={t('departmentalApprovals') || 'Departmental Approvals'}
        subtitle={t('departmentalApprovalsSub') || 'Review and approve submitted purchase requisitions'}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={`${t('departmentalApprovals') || 'Departmental Approvals'} Report`}
              signature
              columns={[
                { header: t('daNumber') || 'Approval No.', key: 'da_number', width: 1.2 },
                { header: t('approvalDate') || 'Date', key: 'approval_date', width: 1 },
                { header: t('prNumber') || 'PR Number', render: a => a.PurchaseRequisition?.pr_number || '', width: 1.2 },
                { header: t('requestedBy') || 'Requested By', render: a => a.PurchaseRequisition?.Requester?.name || '', width: 1.3 },
                { header: t('mine') || 'Mine', render: a => a.PurchaseRequisition?.Branch?.name || '', width: 1.2 },
                { header: t('total') || 'Total', render: a => formatPKR(a.PurchaseRequisition?.total), width: 1, money: true },
                { header: t('decision') || 'Decision', key: 'decision', width: 1 },
              ]}
              rows={approvals}
              filename="departmental-approvals.pdf"
            />
            <button type="button" onClick={() => navigate('/purchase-workflow/approvals/create')} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('createDA') || 'New Approval'}
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
            placeholder={t('searchDA') || 'Search approval no., PR number, remarks…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input w-auto" value={decisionFilter} onChange={e => setDecisionFilter(e.target.value)}>
          <option value="all">{t('allDecisions') || 'All decisions'}</option>
          <option value="approved">{t('daApproved') || 'Approved'}</option>
          <option value="rejected">{t('daRejected') || 'Rejected'}</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4 font-medium">{t('daNumber') || 'Approval No.'}</th>
                <th className="text-start p-4 font-medium">{t('approvalDate') || 'Date'}</th>
                <th className="text-start p-4 font-medium">{t('prNumber') || 'PR Number'}</th>
                <th className="text-start p-4 font-medium">{t('requestedBy') || 'Requested By'}</th>
                <th className="text-start p-4 font-medium">{t('mine') || 'Mine'}</th>
                <th className="text-start p-4 font-medium">{t('total') || 'Total'}</th>
                <th className="text-start p-4 font-medium">{t('decision') || 'Decision'}</th>
                <th className="text-start p-4 font-medium">{t('remarks') || 'Remarks'}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map(da => (
                <tr key={da.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{da.da_number}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{da.approval_date || '—'}</td>
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{da.PurchaseRequisition?.pr_number || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{da.PurchaseRequisition?.Requester?.name || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{da.PurchaseRequisition?.Branch?.name || '—'}</td>
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{formatPKR(da.PurchaseRequisition?.total)}</td>
                  <td className="p-4">
                    <span className={`badge ${DECISION_BADGE[da.decision] || 'badge-gray'}`}>{decisionLabel(da.decision)}</span>
                  </td>
                  <td className="p-4 max-w-[200px] truncate" style={{ color: 'var(--text-secondary)' }} title={da.remarks || ''}>{da.remarks || '—'}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" title={t('view') || 'View'} onClick={() => navigate(`/purchase-workflow/approvals/${da.id}`)} className="icon-btn">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button type="button" title={t('print') || 'Print'} onClick={() => openPrint(da.id)} className="icon-btn">
                        <Printer className="w-4 h-4" />
                      </button>
                      <button type="button" title={t('delete') || 'Delete'} onClick={() => handleDelete(da)} className="icon-btn text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {approvals.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noDAs') || 'No departmental approvals yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
