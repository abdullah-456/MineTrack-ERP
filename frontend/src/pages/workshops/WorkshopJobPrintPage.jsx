import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import api from '../../api/axios';
import WorkshopJobDocument from './WorkshopJobDocument';
import { INK_SOFT } from '../../components/print/PrintKit';

export default function WorkshopJobPrintPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const shopIdParam = searchParams.get('shop_id');
  const autoPrint = searchParams.get('auto_print') === '1';

  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const params = shopIdParam ? { shop_id: shopIdParam } : {};
        const { data } = await api.get(`/workshops/jobs/${id}`, { params });
        setJob(data.job);
      } catch (e) {
        setErr(e.response?.data?.message || 'Failed to load workshop job');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, shopIdParam]);

  useEffect(() => {
    if (!loading && job && autoPrint) {
      const timer = setTimeout(() => window.print(), 600);
      return () => clearTimeout(timer);
    }
  }, [loading, job, autoPrint]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb' }}>
      <div style={{ textAlign: 'center' }}>
        <Loader2 style={{ width: 40, height: 40, animation: 'spin 1s linear infinite', color: '#4f46e5', margin: '0 auto 12px' }} />
        <p style={{ color: INK_SOFT, fontSize: 14 }}>Loading workshop job…</p>
      </div>
    </div>
  );

  if (err || !job) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb' }}>
      <div style={{ textAlign: 'center', padding: 32, background: '#fff', borderRadius: 16 }}>
        <AlertCircle style={{ width: 48, height: 48, color: '#dc2626', margin: '0 auto 12px' }} />
        <p style={{ color: '#dc2626', fontWeight: 700 }}>{err || 'Workshop job not found'}</p>
        <button type="button" onClick={() => window.close()} style={{ marginTop: 16, padding: '8px 20px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Close Tab</button>
      </div>
    </div>
  );

  return <WorkshopJobDocument job={job} showPrintBar />;
}
