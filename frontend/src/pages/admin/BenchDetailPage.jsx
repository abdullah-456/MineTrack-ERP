import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Layers, Factory, Edit, Plus, Loader2, Ruler, CircleDot } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import api from '../../api/axios';
import { getMineStatusMeta } from '../../utils/mineStatus';
import { formatProductionTotal } from '../../utils/productionFormat';

export default function BenchDetailPage() {
  const { t, lang } = useTheme();
  const { error } = useToast();
  const { id } = useParams();
  const navigate = useNavigate();
  const isRTL = lang === 'ur';

  const [bench, setBench] = useState(null);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchBench = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/benches/${id}`);
      setBench(data.bench);
      setTotal(data.production_total);
    } catch {
      error(t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [id, error, t]);

  useEffect(() => { fetchBench(); }, [fetchBench]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>;
  }
  if (!bench) {
    return <div className="text-center py-20"><p style={{ color: 'var(--text-muted)' }}>{t('noBenches')}</p></div>;
  }

  const meta = getMineStatusMeta(t, bench.status);
  const totalText = formatProductionTotal(total);

  return (
    <div className="space-y-5" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/benches')} className="icon-btn">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{bench.bench_number}</h1>
          <p className="text-sm flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            <CircleDot className="w-3.5 h-3.5" />
            <button
              type="button"
              className="hover:underline"
              onClick={() => bench.Pit?.id && navigate(`/admin/pits/${bench.Pit.id}`)}
            >
              {bench.Pit?.area_name}
            </button>
            {bench.Pit?.Mine?.name && <span> · {bench.Pit.Mine.name}</span>}
          </p>
        </div>
        <span className={`badge ${meta.badge}`}>{meta.label}</span>
        <button onClick={() => navigate(`/admin/benches/${id}/edit`)} className="btn-secondary flex items-center gap-2">
          <Edit className="w-4 h-4" /> {t('edit')}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card space-y-3">
          <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Layers className="w-4 h-4 text-amber-400" /> {t('mineBasicInfo') || 'Basic Info'}
          </h2>
          {bench.elevation && (
            <div className="flex items-start gap-3">
              <Ruler className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('elevation')}</p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{bench.elevation}</p>
              </div>
            </div>
          )}
        </div>
        <div className="card space-y-1">
          <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Factory className="w-4 h-4 text-emerald-400" /> {t('totalProduction')}
          </h2>
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{totalText || '—'}</p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Factory className="w-4 h-4 text-emerald-400" /> {t('production')}
          </h2>
          <button
            type="button"
            onClick={() => navigate(`/admin/production/create?bench_id=${id}`)}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" /> {t('createProduction')}
          </button>
        </div>
        {(bench.ProductionEntries || []).length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>{t('noProduction')}</p>
        ) : (
          <div className="space-y-2">
            {bench.ProductionEntries.map(p => (
              <div
                key={p.id}
                onClick={() => navigate(`/admin/production/${p.id}/edit`)}
                className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.Mineral?.name || '—'}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.date} {p.shift ? `· ${t(`shift${p.shift.charAt(0).toUpperCase()}${p.shift.slice(1)}`) || p.shift}` : ''}</p>
                </div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>{Number(p.quantity).toLocaleString()} {p.unit}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
