import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle, Printer, Wrench, Edit } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import api from '../../api/axios';
import WorkshopJobDocument from './WorkshopJobDocument';

export default function WorkshopJobViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { shopParams, shopId, shopReady } = useShopApi();
  const isRTL = lang === 'ur';

  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!shopReady) return;
    (async () => {
      try {
        const { data } = await api.get(`/workshops/jobs/${id}`, { params: shopParams() });
        setJob(data.job);
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
    window.open(`/workshop-job/${id}?${qs.toString()}`, '_blank', 'noopener,noreferrer');
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>;

  if (err || !job) {
    return (
      <div className="flex flex-col items-center py-20 gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p style={{ color: 'var(--text-muted)' }}>{err || t('workshopJobNotFound') || 'Workshop job not found'}</p>
        <button type="button" onClick={() => navigate('/workshops/jobs')} className="btn-secondary">{t('back') || 'Back'}</button>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Wrench}
        accent="amber"
        title={job.job_number}
        subtitle={t('workshopJobViewSub') || 'Workshop job document view'}
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/workshops/jobs')} className="btn-secondary flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
            </button>
            <button type="button" onClick={openPrint} className="btn-secondary flex items-center gap-2">
              <Printer className="w-4 h-4" />{t('print') || 'Print / PDF'}
            </button>
            {job.status === 'in_progress' && (
              <button type="button" onClick={() => navigate(`/workshops/jobs/${id}/edit`)} className="btn-primary flex items-center gap-2">
                <Edit className="w-4 h-4" />{t('edit') || 'Edit'}
              </button>
            )}
          </div>
        }
      />
      <div className="rounded-xl overflow-hidden" style={{ background: '#e5e7eb' }}>
        <WorkshopJobDocument job={job} showPrintBar={false} />
      </div>
    </div>
  );
}
