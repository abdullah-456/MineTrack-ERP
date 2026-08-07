import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import {
  Store, Users, Pickaxe, Plus,
  Eye, AlertTriangle, CheckCircle, Clock, ArrowUpRight
} from 'lucide-react';
import api from '../../api/axios';

function PlatformStatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="stat-card animate-fade-in">
      <div className="flex items-start justify-between">
        <div className={`p-3 rounded-xl ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="mt-3">
        <p className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>{value ?? '—'}</p>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{label}</p>
        {sub && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
    </div>
  );
}

const STATUS_CONFIG = (t) => ({
  active:    { label: t('statusActive'),    className: 'badge badge-green',  icon: CheckCircle },
  suspended: { label: t('statusSuspended'), className: 'badge badge-red',    icon: AlertTriangle },
  trial:     { label: t('statusTrial'),     className: 'badge badge-yellow', icon: Clock },
});
const PLAN_CONFIG = (t) => ({
  basic:      { label: t('planBasic'),      className: 'badge badge-blue' },
  pro:        { label: t('planPro'),        className: 'badge badge-purple' },
  enterprise: { label: t('planEnterprise'), className: 'badge badge-green' },
});

export default function SuperAdminDashboard() {
  const { t } = useTheme();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentShops, setRecentShops] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/shops/stats');
        setStats(data.stats);
        setRecentShops(data.recentShops || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {t('platformAdmin')}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {t('platformSubtitle')}
          </p>
        </div>
        <button
          onClick={() => navigate('/superadmin/shops/create')}
          className="btn-primary flex items-center gap-2"
          id="create-shop-btn"
        >
          <Plus className="w-4 h-4" />
          <span>{t('newShop')}</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <PlatformStatCard
          icon={Store} label={t('totalShops')} value={stats?.totalShops}
          color="bg-brand-500/10 text-brand-400"
        />
        <PlatformStatCard
          icon={CheckCircle} label={t('activeShops')} value={stats?.activeShops}
          color="bg-emerald-500/10 text-emerald-400"
          sub={stats ? t('percentActive').replace('{n}', Math.round((stats.activeShops / (stats.totalShops || 1)) * 100)) : ''}
        />
        <PlatformStatCard
          icon={Users} label={t('totalUsers')} value={stats?.totalUsers}
          color="bg-purple-500/10 text-purple-400"
        />
        <PlatformStatCard
          icon={Pickaxe} label={t('totalBranches')} value={stats?.totalBranches}
          color="bg-amber-500/10 text-amber-400"
        />
      </div>

      {/* Recent Shops */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('recentShops')}
          </h2>
          <button
            onClick={() => navigate('/superadmin/shops')}
            className="text-xs flex items-center gap-1 text-brand-400 hover:text-brand-300 transition-colors"
          >
            {t('viewAll')} <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-10 rounded-lg skeleton" />)}
          </div>
        ) : recentShops.length === 0 ? (
          <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>{t('noData')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('shopName')}</th>
                  <th>{t('shopPlan')}</th>
                  <th>{t('shopStatus')}</th>
                  <th>{t('shopCreated')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {recentShops.map(shop => {
                  const statusConfig = STATUS_CONFIG(t);
                  const planConfig = PLAN_CONFIG(t);
                  const sc = statusConfig[shop.status] || statusConfig.trial;
                  const pc = planConfig[shop.plan]     || planConfig.basic;
                  return (
                    <tr key={shop.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                            {shop.name?.[0]?.toUpperCase()}
                          </div>
                          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{shop.name}</span>
                        </div>
                      </td>
                      <td><span className={pc.className}>{pc.label}</span></td>
                      <td><span className={sc.className}>{sc.label}</span></td>
                      <td style={{ color: 'var(--text-muted)' }}>
                        {new Date(shop.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <button
                          onClick={() => navigate(`/superadmin/shops/${shop.id}`)}
                          className="icon-btn"
                          title={t('viewShop')}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => navigate('/superadmin/shops')}
          className="card flex items-center gap-4 text-left hover:border-brand-500 transition-all cursor-pointer"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="p-3 rounded-xl bg-brand-500/10 text-brand-400">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('allShops')}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('viewAll')}</p>
          </div>
        </button>

        <button
          onClick={() => navigate('/superadmin/shops/create')}
          className="card flex items-center gap-4 text-left hover:border-emerald-500 transition-all cursor-pointer"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
            <Plus className="w-6 h-6" />
          </div>
          <div>
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('createShop')}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('firstAdminAccount')}</p>
          </div>
        </button>
      </div>
    </div>
  );
}
