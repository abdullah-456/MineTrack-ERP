import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import {
  Plus, Eye, Edit, Slash, Search, CheckCircle,
  AlertTriangle, Clock, RefreshCw, Store, UserCheck
} from 'lucide-react';
import api from '../../api/axios';

const STATUS_CONFIG = (t) => ({
  active:    { label: t('statusActive'),    badge: 'badge badge-green',  icon: CheckCircle  },
  suspended: { label: t('statusSuspended'), badge: 'badge badge-red',    icon: AlertTriangle },
  trial:     { label: t('statusTrial'),     badge: 'badge badge-yellow', icon: Clock        },
});
const PLAN_CONFIG = (t) => ({
  basic:      { label: t('planBasic'),      badge: 'badge badge-blue'   },
  pro:        { label: t('planPro'),        badge: 'badge badge-purple' },
  enterprise: { label: t('planEnterprise'), badge: 'badge badge-green'  },
});

export default function ShopsList() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const navigate     = useNavigate();
  const [shops, setShops]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchShops = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/shops');
      setShops(data.shops || []);
    } catch (e) {
      error(t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchShops(); }, []);

  const handleSuspend = async (shop) => {
    const ok = await confirm({
      title: t('suspendShop'),
      message: `${t('confirmSuspendShop')} "${shop.name}"`,
      confirmLabel: t('suspendShop'),
      cancelLabel: t('cancel'),
    });
    if (!ok) return;
    try {
      await api.delete(`/shops/${shop.id}`);
      success(t('toastShopSuspended'));
      fetchShops();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const handleActivate = async (shop) => {
    const ok = await confirm({
      title: t('activateShop'),
      message: `${t('confirmActivateShop')} "${shop.name}"`,
      confirmLabel: t('activateShop'),
      cancelLabel: t('cancel'),
      variant: 'primary',
    });
    if (!ok) return;
    try {
      await api.post(`/shops/${shop.id}/activate`);
      success(t('toastShopActivated'));
      fetchShops();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const filtered = shops.filter(s => {
    const matchSearch = s.name?.toLowerCase().includes(search.toLowerCase()) ||
                        s.owner_name?.toLowerCase().includes(search.toLowerCase()) ||
                        s.email?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const isRTL = lang === 'ur';
  const statusConfig = STATUS_CONFIG(t);
  const planConfig = PLAN_CONFIG(t);

  return (
    <div className="space-y-5 animate-fade-in" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {t('allShops')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {filtered.length} {t('of')} {shops.length} {t('total')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchShops} className="icon-btn" title={t('loading')}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => navigate('/superadmin/shops/create')}
            className="btn-primary flex items-center gap-2"
            id="shops-create-btn"
          >
            <Plus className="w-4 h-4" />
            <span>{t('newShop')}</span>
          </button>
        </div>
      </div>

      <div className="card flex flex-wrap gap-3 items-center">
        <div className="search-bar flex items-center gap-2 flex-1 min-w-[180px]">
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('search')}
            className="bg-transparent outline-none text-sm w-full"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="input-field py-2 text-sm"
          id="status-filter-select"
        >
          <option value="all">{t('all')}</option>
          <option value="active">{t('statusActive')}</option>
          <option value="trial">{t('statusTrial')}</option>
          <option value="suspended">{t('statusSuspended')}</option>
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div className="space-y-3 p-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-12 rounded-lg skeleton" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Store className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p style={{ color: 'var(--text-muted)' }}>{t('noData')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('shopName')}</th>
                  <th>{t('ownerName')}</th>
                  <th>{t('shopEmail')}</th>
                  <th>{t('shopBranches')}</th>
                  <th>{t('shopUsers')}</th>
                  <th>{t('shopPlan')}</th>
                  <th>{t('shopStatus')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((shop, idx) => {
                  const sc = statusConfig[shop.status] || statusConfig.trial;
                  const pc = planConfig[shop.plan]     || planConfig.basic;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={shop.id}>
                      <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                            {shop.name?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{shop.name}</p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {new Date(shop.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{shop.owner_name || '—'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{shop.email || '—'}</td>
                      <td>
                        <span className="font-semibold text-brand-400">{shop.branches}</span>
                      </td>
                      <td>
                        <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{shop.users}</span>
                      </td>
                      <td><span className={pc.badge}>{pc.label}</span></td>
                      <td>
                        <span className={`${sc.badge} flex items-center gap-1 w-fit`}>
                          <StatusIcon className="w-3 h-3" /> {sc.label}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => navigate(`/superadmin/shops/${shop.id}`)}
                            className="icon-btn" title={t('viewShop')}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => navigate(`/superadmin/shops/${shop.id}/edit`)}
                            className="icon-btn" title={t('editShop')}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {shop.status === 'suspended' ? (
                            <button
                              onClick={() => handleActivate(shop)}
                              className="icon-btn text-emerald-400 hover:text-emerald-300"
                              title={t('activateShop')}
                            >
                              <UserCheck className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSuspend(shop)}
                              className="icon-btn text-red-400 hover:text-red-300"
                              title={t('suspendShop')}
                            >
                              <Slash className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
