import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle, Printer, ShieldCheck, Paperclip } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import api from '../../api/axios';
import DepartmentalApprovalDocument from './DepartmentalApprovalDocument';

export default function DepartmentalApprovalViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { shopParams, shopId, shopReady } = useShopApi();
  const isRTL = lang === 'ur';

  const [loading, setLoading] = useState(true);
  const [approval, setApproval] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!shopReady) return;
    (async () => {
      try {
        const { data } = await api.get(`/departmental-approvals/${id}`, { params: shopParams() });
        setApproval(data.departmental_approval);
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
    window.open(`/departmental-approval/${id}?${qs.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const openAttachment = async () => {
    try {
      const { data } = await api.get(`/departmental-approvals/${id}/attachment`, {
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

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
      </div>
    );
  }

  if (err || !approval) {
    return (
      <div className="flex flex-col items-center py-20 gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p style={{ color: 'var(--text-muted)' }}>{err || t('daNotFound') || 'Departmental approval not found'}</p>
        <button type="button" onClick={() => navigate('/purchase-workflow/approvals')} className="btn-secondary">
          {t('back') || 'Back'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={ShieldCheck}
        accent="violet"
        title={approval.da_number}
        subtitle={t('departmentalApprovalViewSub') || 'Departmental approval document view'}
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/purchase-workflow/approvals')} className="btn-secondary flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
            </button>
            <button type="button" onClick={openPrint} className="btn-secondary flex items-center gap-2">
              <Printer className="w-4 h-4" />{t('print') || 'Print / PDF'}
            </button>
            {approval.attachment_name && (
              <button type="button" onClick={openAttachment} className="btn-secondary flex items-center gap-2">
                <Paperclip className="w-4 h-4" />{t('supportingDocument') || 'Supporting Document'}
              </button>
            )}
          </div>
        }
      />

      <div className="rounded-xl overflow-hidden" style={{ background: '#e5e7eb' }}>
        <DepartmentalApprovalDocument approval={approval} showPrintBar={false} />
      </div>
    </div>
  );
}
