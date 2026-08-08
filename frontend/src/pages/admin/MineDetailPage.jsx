import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Pickaxe, CircleDot, Factory, Edit, Plus, Loader2,
  Building2, Landmark, Gem, MapPin, FileText, Calendar, Ruler, UserCheck,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import api from '../../api/axios';
import { getMineStatusMeta } from '../../utils/mineStatus';
import { formatProductionTotal } from '../../utils/productionFormat';
import DocumentsPanel from '../../components/documents/DocumentsPanel';

export default function MineDetailPage() {
  const { t, lang } = useTheme();
  const { error } = useToast();
  const { id } = useParams();
  const navigate = useNavigate();
  const isRTL = lang === 'ur';

  const [mine, setMine] = useState(null);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMine = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/branches/${id}`);
      setMine(data.branch);
      setTotal(data.production_total);
    } catch {
      error(t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [id, error, t]);

  useEffect(() => { fetchMine(); }, [fetchMine]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>;
  }
  if (!mine) {
    return <div className="text-center py-20"><p style={{ color: 'var(--text-muted)' }}>{t('noMines')}</p></div>;
  }

  const meta = getMineStatusMeta(t, mine.status);
  const totalText = formatProductionTotal(total);

  const infoRows = [
    { icon: Building2, label: t('company'), value: mine.company },
    { icon: Gem, label: t('mineralType'), value: mine.Mineral?.name },
    { icon: MapPin, label: t('province'), value: mine.province },
    { icon: MapPin, label: t('district'), value: mine.district },
    { icon: MapPin, label: t('gpsCoordinates'), value: mine.gps_coordinates },
    { icon: FileText, label: t('leaseNumber'), value: mine.lease_number },
    { icon: Calendar, label: t('leaseStartDate'), value: mine.lease_start_date },
    { icon: Calendar, label: t('leaseExpiryDate'), value: mine.lease_expiry_date },
    { icon: Ruler, label: t('area'), value: mine.area },
    { icon: UserCheck, label: t('manager'), value: mine.Manager?.name },
    { icon: Landmark, label: t('linkedGodown') || 'Linked Godown', value: mine.Godown?.name },
  ];

  return (
    <div className="space-y-5" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/mines')} className="icon-btn">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            {mine.name}
            {mine.is_default && <span className="badge badge-blue text-xs">{t('defaultBranch')}</span>}
          </h1>
          <p className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>{mine.mine_code}</p>
        </div>
        <span className={`badge ${meta.badge}`}>{meta.label}</span>
        <button onClick={() => navigate(`/admin/mines/${id}/edit`)} className="btn-secondary flex items-center gap-2">
          <Edit className="w-4 h-4" /> {t('edit')}
        </button>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Pickaxe className="w-4 h-4 text-brand-400" /> {t('mineBasicInfo') || 'Basic Info'}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {infoRows.filter(row => row.value).map(row => (
            <div key={row.label} className="flex items-start gap-3">
              <row.icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.label}</p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{row.value}</p>
              </div>
            </div>
          ))}
          {mine.address && (
            <div className="flex items-start gap-3 sm:col-span-2">
              <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('branchAddress')}</p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{mine.address}</p>
              </div>
            </div>
          )}
          {mine.remarks && (
            <div className="flex items-start gap-3 sm:col-span-2">
              <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('remarks')}</p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{mine.remarks}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <DocumentsPanel ownerType="branch" ownerId={mine.id} />

      <div className="card space-y-1">
        <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Factory className="w-4 h-4 text-emerald-400" /> {t('totalProduction')}
        </h2>
        <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{totalText || '—'}</p>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <CircleDot className="w-4 h-4 text-purple-400" /> {t('pits')}
          </h2>
          <button
            type="button"
            onClick={() => navigate(`/admin/pits/create?mine_id=${id}`)}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" /> {t('addPit')}
          </button>
        </div>
        {(mine.Pits || []).length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>{t('noPits')}</p>
        ) : (
          <div className="space-y-2">
            {mine.Pits.map(p => {
              const pMeta = getMineStatusMeta(t, p.status);
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/admin/pits/${p.id}`)}
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: 'var(--bg-elevated)' }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.area_name}</p>
                    {p.gps_coordinates && (
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.gps_coordinates}</p>
                    )}
                  </div>
                  <span className={`badge ${pMeta.badge}`}>{pMeta.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
