import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle, Printer, ClipboardList, Paperclip, ExternalLink } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import api from '../../api/axios';
import PurchaseWorkflowOrderDocument from './PurchaseWorkflowOrderDocument';

export default function PurchaseWorkflowOrderViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { shopParams, shopId, shopReady } = useShopApi();
  const isRTL = lang === 'ur';

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!shopReady) return;
    (async () => {
      try {
        const { data } = await api.get(`/purchase-workflow/orders/${id}`, { params: shopParams() });
        setOrder(data.purchase_order);
      } catch (e) {
        setErr(e.response?.data?.message || t('toastErrorGeneric'));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, shopParams, shopReady, t]);

  const openPrint = () => {
    const qs = new URLSearchParams();
    if (shopId) qs.set('shop_id', shopId);
    window.open(`/purchase-workflow-order/${id}?${qs.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const openDoc = async (docType) => {
    try {
      const { data } = await api.get(`/purchase-workflow/orders/${id}/documents/${docType}`, {
        params: shopParams(),
        responseType: 'blob',
      });
      const blobUrl = URL.createObjectURL(data);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      setErr(t('toastErrorGeneric'));
    }
  };

  const grn = (order?.GoodsReceiptNotes || [])[0];
  const supplierId = order?.supplier_id;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>;

  if (err || !order) {
    return (
      <div className="flex flex-col items-center py-20 gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p style={{ color: 'var(--text-muted)' }}>{err || t('poNotFound') || 'Purchase order not found'}</p>
        <button type="button" onClick={() => navigate('/purchase-workflow/orders')} className="btn-secondary">{t('back') || 'Back'}</button>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={ClipboardList}
        accent="amber"
        title={order.po_number}
        subtitle={t('workflowPOViewSub') || 'Workflow purchase order document view'}
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/purchase-workflow/orders')} className="btn-secondary flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
            </button>
            <button type="button" onClick={openPrint} className="btn-secondary flex items-center gap-2">
              <Printer className="w-4 h-4" />{t('print') || 'Print / PDF'}
            </button>
            {grn?.grn_document_name && (
              <button type="button" onClick={() => openDoc('grn')} className="btn-secondary flex items-center gap-2">
                <Paperclip className="w-4 h-4" />{t('grnDocument') || 'GRN Document'}
              </button>
            )}
            {grn?.invoice_document_name && (
              <button type="button" onClick={() => openDoc('invoice')} className="btn-secondary flex items-center gap-2">
                <Paperclip className="w-4 h-4" />{t('invoiceDocument') || 'Invoice Document'}
              </button>
            )}
            {supplierId && (
              <button type="button" onClick={() => navigate(`/suppliers/${supplierId}`)} className="btn-primary flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />{t('supplierLedger') || 'Supplier Ledger'}
              </button>
            )}
          </div>
        }
      />
      <div className="rounded-xl overflow-hidden" style={{ background: '#e5e7eb' }}>
        <PurchaseWorkflowOrderDocument order={order} showPrintBar={false} />
      </div>
    </div>
  );
}
