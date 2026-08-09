import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle, Edit, Printer, FileText } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import api from '../../api/axios';
import PurchaseRequisitionDocument from './PurchaseRequisitionDocument';

export default function PurchaseRequisitionViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { shopParams, shopId, shopReady } = useShopApi();
  const isRTL = lang === 'ur';

  const [loading, setLoading] = useState(true);
  const [requisition, setRequisition] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!shopReady) return;
    (async () => {
      try {
        const { data } = await api.get(`/purchase-requisitions/${id}`, { params: shopParams() });
        setRequisition(data.purchase_requisition);
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
    window.open(`/purchase-requisition/${id}?${qs.toString()}`, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
      </div>
    );
  }

  if (err || !requisition) {
    return (
      <div className="flex flex-col items-center py-20 gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p style={{ color: 'var(--text-muted)' }}>{err || t('prNotFound') || 'Purchase requisition not found'}</p>
        <button type="button" onClick={() => navigate('/purchase-workflow/requisitions')} className="btn-secondary">
          {t('back') || 'Back'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={FileText}
        accent="indigo"
        title={requisition.pr_number}
        subtitle={t('purchaseRequisitionViewSub') || 'Purchase requisition document view'}
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/purchase-workflow/requisitions')} className="btn-secondary flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
            </button>
            <button type="button" onClick={openPrint} className="btn-secondary flex items-center gap-2">
              <Printer className="w-4 h-4" />{t('print') || 'Print / PDF'}
            </button>
            {requisition.status === 'draft' && (
              <button type="button" onClick={() => navigate(`/purchase-workflow/requisitions/${id}/edit`)} className="btn-primary flex items-center gap-2">
                <Edit className="w-4 h-4" />{t('edit') || 'Edit'}
              </button>
            )}
          </div>
        }
      />

      <div className="rounded-xl overflow-hidden" style={{ background: '#e5e7eb' }}>
        <PurchaseRequisitionDocument requisition={requisition} showPrintBar={false} />
      </div>
    </div>
  );
}
