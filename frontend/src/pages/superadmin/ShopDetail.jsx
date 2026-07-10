import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import {
  ChevronLeft, Store, Users, GitBranch, Edit,
  CheckCircle, AlertTriangle, Clock, Mail,
  Phone, MapPin, RefreshCw, Slash, UserCheck
} from 'lucide-react';
import api from '../../api/axios';

const STATUS_CONFIG = (t) => ({
  active:    { badge: 'badge badge-green',  icon: CheckCircle,  label: t('statusActive') },
  suspended: { badge: 'badge badge-red',    icon: AlertTriangle, label: t('statusSuspended') },
  trial:     { badge: 'badge badge-yellow', icon: Clock,         label: t('statusTrial') },
});
const PLAN_CONFIG = (t) => ({
  basic:      { badge: 'badge badge-blue',   label: t('planBasic') },
  pro:        { badge: 'badge badge-purple', label: t('planPro') },
  enterprise: { badge: 'badge badge-green',  label: t('planEnterprise') },
});
const ROLE_COLORS = {
  super_admin: 'badge-purple',
  admin:       'badge-blue',
  accountant:  'badge-green',
  user:        'badge-yellow',
};

export default function ShopDetail() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { id }   = useParams();
  const navigate = useNavigate();
  const [shop, setShop]     = useState(null);
  const [loading, setLoading] = useState(true);
  const isRTL = lang === 'ur';

  const roleLabel = (name) => {
    const map = {
      super_admin: t('roleSuperAdmin'),
      admin:       t('roleAdmin'),
      accountant:  t('roleAccountant'),
      user:        t('roleUser'),
    };
    return map[name] || name;
  };

  const fetchShop = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/shops/${id}`);
      setShop(data.shop);
    } catch (e) {
      error(t('toastErrorGeneric'));
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchShop(); }, [id]);

  const handleSuspend = async () => {
    const ok = await confirm({
      title: t('suspendShop'),
      message: `${t('confirmSuspendShop')} "${shop.name}"`,
      confirmLabel: t('suspendShop'),
      cancelLabel: t('cancel'),
    });
    if (!ok) return;
    try {
      await api.delete(`/shops/${id}`);
      success(t('toastShopSuspended'));
      fetchShop();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const handleActivate = async () => {
    const ok = await confirm({
      title: t('activateShop'),
      message: `${t('confirmActivateShop')} "${shop.name}"`,
      confirmLabel: t('activateShop'),
      cancelLabel: t('cancel'),
      variant: 'primary',
    });
    if (!ok) return;
    try {
      await api.post(`/shops/${id}/activate`);
      success(t('toastShopActivated'));
      fetchShop();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 animate-spin text-brand-400" />
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="text-center py-20">
        <p style={{ color: 'var(--text-muted)' }}>{t('shopNotFound')}</p>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG(t);
  const planConfig = PLAN_CONFIG(t);
  const sc = statusConfig[shop.status] || statusConfig.trial;
  const pc = planConfig[shop.plan]     || planConfig.basic;
  const StatusIcon = sc.icon;

  return (
    <div className="space-y-5 animate-fade-in" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/superadmin/shops')} className="icon-btn">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{shop.name}</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('shopDetails')} · ID #{shop.id}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/superadmin/shops/${id}/edit`)}
            className="btn-secondary flex items-center gap-2"
          >
            <Edit className="w-4 h-4" /> {t('editShop')}
          </button>
          {shop.status === 'suspended' ? (
            <button onClick={handleActivate} className="btn-primary flex items-center gap-2">
              <UserCheck className="w-4 h-4" /> {t('activateShop')}
            </button>
          ) : (
            <button onClick={handleSuspend} className="btn-danger flex items-center gap-2">
              <Slash className="w-4 h-4" /> {t('suspendShop')}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card flex items-center gap-3">
          <div className="p-3 rounded-xl bg-brand-500/10 text-brand-400">
            <GitBranch className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {shop.Branches?.length || 0}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('totalBranches')}</p>
          </div>
        </div>
        <div className="stat-card flex items-center gap-3">
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {shop.Users?.length || 0}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('totalUsers')}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex gap-2 flex-wrap">
            <span className={sc.badge}><StatusIcon className="w-3 h-3 inline mr-1" />{sc.label}</span>
            <span className={pc.badge}>{pc.label}</span>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            {t('shopCreated')}: {new Date(shop.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card space-y-3">
          <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Store className="w-4 h-4 text-brand-400" /> {t('shopDetails')}
          </h2>
          {[
            { icon: Mail, label: t('shopEmail'), value: shop.email },
            { icon: Phone, label: t('shopPhone'), value: shop.phone },
            { icon: MapPin, label: t('shopAddress'), value: shop.address },
          ].map(row => row.value ? (
            <div key={row.label} className="flex items-start gap-3">
              <row.icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.label}</p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{row.value}</p>
              </div>
            </div>
          ) : null)}
        </div>

        <div className="card space-y-3">
          <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <GitBranch className="w-4 h-4 text-purple-400" /> {t('branches')}
          </h2>
          {(shop.Branches || []).length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('noData')}</p>
          ) : (
            <div className="space-y-2">
              {shop.Branches.map(br => (
                <div key={br.id} className="flex items-center justify-between p-2 rounded-lg"
                  style={{ backgroundColor: 'var(--bg-elevated)' }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{br.name}</p>
                    {br.is_default && (
                      <span className="badge badge-blue text-[10px]">{t('defaultBranch')}</span>
                    )}
                  </div>
                  <span className={`badge ${br.status === 'active' ? 'badge-green' : 'badge-red'}`}>
                    {br.status === 'active' ? t('active') : t('disabled')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Users className="w-4 h-4 text-emerald-400" /> {t('users')}
        </h2>
        {(shop.Users || []).length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>{t('noUsers')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('userName')}</th>
                  <th>{t('userEmail')}</th>
                  <th>{t('userRole')}</th>
                  <th>{t('userStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {shop.Users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                          {u.name?.[0]?.toUpperCase()}
                        </div>
                        <span style={{ color: 'var(--text-primary)' }}>{u.name}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                    <td>
                      <span className={`badge ${ROLE_COLORS[u.Role?.name] || 'badge-blue'}`}>
                        {roleLabel(u.Role?.name)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${u.status === 'active' ? 'badge-green' : 'badge-red'}`}>
                        {u.status === 'active' ? t('active') : t('suspended')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
