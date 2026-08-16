import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, Eye, Loader2, Search, Printer } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import { useFiscalYear } from '../../context/FiscalYearContext';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import api from '../../api/axios';
import { humanize } from '../../utils/textFormat';

const STATUS_BADGE = {
  sent: 'badge-blue',
  partially_received: 'badge-purple',
  received: 'badge-green',
  cancelled: 'badge-red',
};

export default function PurchaseWorkflowOrders() {
  const { t, lang } = useTheme();
  const { error } = useToast();
  const { shopParams, shopId, shopReady } = useShopApi();
  const { listParams } = useFiscalYear();
  const navigate = useNavigate();
  const isRTL = lang === 'ur';

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const params = { ...shopParams(), ...listParams, search: search.trim() || undefined };
      const { data } = await api.get('/purchase-workflow/orders', { params });
      setOrders(data.purchase_orders || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, shopReady, listParams, search, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openPrint = (id) => {
    const qs = new URLSearchParams();
    if (shopId) qs.set('shop_id', shopId);
    window.open(`/purchase-workflow-order/${id}?${qs.toString()}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={ClipboardList}
        accent="amber"
        title={t('workflowPurchaseOrders') || 'Purchase Orders'}
        subtitle={t('workflowPurchaseOrdersSub') || 'Create POs from approved requisitions, receive stock, and record payments'}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={`${t('workflowPurchaseOrders') || 'Purchase Orders'} Report`}
              signature
              columns={[
                { header: t('poNumber') || 'PO #', key: 'po_number', width: 1.2 },
                { header: t('prNumber') || 'PR #', render: o => o.PurchaseRequisition?.pr_number || '', width: 1.2 },
                { header: t('approvalNumber') || 'Approval #', render: o => o.PurchaseRequisition?.DepartmentalApproval?.da_number || '', width: 1.2 },
                { header: t('orderDate') || 'Date', key: 'order_date', width: 1 },
                { header: t('supplier') || 'Supplier', render: o => o.Supplier?.company_name || '', width: 1.4 },
                { header: t('mine') || 'Mine', render: o => o.Branch?.name || '', width: 1.2 },
                { header: t('total') || 'Total', render: o => formatPKR(o.total), width: 1, money: true },
                { header: t('status') || 'Status', render: o => t(o.status) || humanize(o.status), width: 1 },
              ]}
              rows={orders}
              filename="workflow-purchase-orders.pdf"
            />
            <button type="button" onClick={() => navigate('/purchase-workflow/orders/create')} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('createWorkflowPO') || 'New Purchase Order'}
            </button>
          </div>
        }
      />

      <div className="glass-card p-4">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingInlineStart: '2.5rem' }} placeholder={t('searchWorkflowPO') || 'Search PO, PR, supplier…'} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4 font-medium">{t('poNumber') || 'PO #'}</th>
                <th className="text-start p-4 font-medium">{t('prNumber') || 'PR #'}</th>
                <th className="text-start p-4 font-medium">{t('approvalNumber') || 'Approval #'}</th>
                <th className="text-start p-4 font-medium">{t('orderDate') || 'Date'}</th>
                <th className="text-start p-4 font-medium">{t('supplier') || 'Supplier'}</th>
                <th className="text-start p-4 font-medium">{t('mine') || 'Mine'}</th>
                <th className="text-start p-4 font-medium">{t('total') || 'Total'}</th>
                <th className="text-start p-4 font-medium">{t('status') || 'Status'}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{o.po_number}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{o.PurchaseRequisition?.pr_number || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{o.PurchaseRequisition?.DepartmentalApproval?.da_number || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{o.order_date || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{o.Supplier?.company_name || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{o.Branch?.name || '—'}</td>
                  <td className="p-4 font-medium">{formatPKR(o.total)}</td>
                  <td className="p-4"><span className={`badge ${STATUS_BADGE[o.status] || 'badge-gray'}`}>{t(o.status) || humanize(o.status)}</span></td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => navigate(`/purchase-workflow/orders/${o.id}`)} className="icon-btn"><Eye className="w-4 h-4" /></button>
                      <button type="button" onClick={() => openPrint(o.id)} className="icon-btn"><Printer className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noWorkflowPOs') || 'No workflow purchase orders yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
