import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, CircleDot, Layers, Factory, Edit, Plus, Loader2, MapPin, FileText, Pickaxe } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import api from '../../api/axios';
import { getMineStatusMeta } from '../../utils/mineStatus';
import { formatProductionTotal } from '../../utils/productionFormat';

export default function PitDetailPage() {
  const { t, lang } = useTheme();
  const { error } = useToast();
  const { id } = useParams();
  const navigate = useNavigate();
  const isRTL = lang === 'ur';

  const [pit, setPit] = useState(null);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchPit = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/pits/${id}`);
      setPit(data.pit);
      setTotal(data.production_total);
    } catch {
      error(t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [id, error, t]);

  useEffect(() => { fetchPit(); }, [fetchPit]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>;
  }
  if (!pit) {
    return <div className="text-center py-20"><p style={{ color: 'var(--text-muted)' }}>{t('noPits')}</p></div>;
  }

  const meta = getMineStatusMeta(t, pit.status);
  const totalText = formatProductionTotal(total);

  return (
    <div className="space-y-5" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/pits')} className="icon-btn">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{pit.area_name}</h1>
          <p className="text-sm flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            <Pickaxe className="w-3.5 h-3.5" />
            <button
              type="button"
              className="hover:underline"
              onClick={() => pit.Mine?.id && navigate(`/admin/mines/${pit.Mine.id}`)}
            >
              {pit.Mine?.name}
            </button>
          </p>
        </div>
        <span className={`badge ${meta.badge}`}>{meta.label}</span>
        <button onClick={() => navigate(`/admin/pits/${id}/edit`)} className="btn-secondary flex items-center gap-2">
          <Edit className="w-4 h-4" /> {t('edit')}
        </button>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <CircleDot className="w-4 h-4 text-purple-400" /> {t('mineBasicInfo') || 'Basic Info'}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pit.gps_coordinates && (
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('gpsCoordinates')}</p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{pit.gps_coordinates}</p>
              </div>
            </div>
          )}
          {pit.notes && (
            <div className="flex items-start gap-3 sm:col-span-2">
              <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('notes')}</p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{pit.notes}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card space-y-1">
        <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Factory className="w-4 h-4 text-emerald-400" /> {t('totalProduction')}
        </h2>
        <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{totalText || '—'}</p>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Layers className="w-4 h-4 text-amber-400" /> {t('benches')}
          </h2>
          <button
            type="button"
            onClick={() => navigate(`/admin/benches/create?pit_id=${id}`)}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" /> {t('addBench')}
          </button>
        </div>
        {(pit.Benches || []).length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>{t('noBenches')}</p>
        ) : (
          <div className="space-y-2">
            {pit.Benches.map(b => {
              const bMeta = getMineStatusMeta(t, b.status);
              return (
                <div
                  key={b.id}
                  onClick={() => navigate(`/admin/benches/${b.id}`)}
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: 'var(--bg-elevated)' }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{b.bench_number}</p>
                    {b.elevation && (
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{b.elevation}</p>
                    )}
                  </div>
                  <span className={`badge ${bMeta.badge}`}>{bMeta.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
