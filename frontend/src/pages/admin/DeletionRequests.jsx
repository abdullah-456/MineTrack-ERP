import { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, Check, X, Loader2, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import api from '../../api/axios';

const TABS = ['pending', 'approved', 'rejected', 'all'];

export default function DeletionRequests() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams } = useShopApi();
  const isRTL = lang === 'ur';

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/deletion-requests', { params: { ...shopParams(), status: tab } });
      setRequests(data.requests || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, tab, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleApprove = async (r) => {
    const ok = await confirm({ title: t('approve'), message: t('confirmApproveDeletion'), confirmLabel: t('approve'), cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      await api.post(`/deletion-requests/${r.id}/approve`, { ...shopParams() });
      success(t('deletionApproved'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const handleReject = async (r) => {
    const ok = await confirm({ title: t('reject'), message: t('confirmRejectDeletion'), confirmLabel: t('reject'), cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      await api.post(`/deletion-requests/${r.id}/reject`, { ...shopParams() });
      success(t('deletionRejected'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={ShieldAlert}
        accent="rose"
        title={t('deletionRequests')}
        subtitle={t('deletionRequestsSub')}
      />

      <div className="glass-card p-2 flex gap-1 w-fit">
        {TABS.map(tb => (
          <button
            key={tb}
            type="button"
            onClick={() => setTab(tb)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === tb ? 'bg-brand-500/20 text-brand-400' : ''}`}
            style={tab !== tb ? { color: 'var(--text-secondary)' } : undefined}
          >
            {t(tb === 'all' ? 'allStatuses' : tb)}
          </button>
        ))}
      </div>

      <div className="glass-card p-3">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ left: '10px', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingInlineStart: '2.25rem' }}
            placeholder="Search module, entity, requested by, status…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4 font-medium">{t('date')}</th>
                <th className="text-start p-4 font-medium">{t('module')}</th>
                <th className="text-start p-4 font-medium">{t('entity')}</th>
                <th className="text-start p-4 font-medium">{t('requestedBy')}</th>
                <th className="text-start p-4 font-medium">{t('status')}</th>
                {tab !== 'pending' && <th className="text-start p-4 font-medium">{t('reviewedBy')}</th>}
                {tab === 'pending' && <th className="text-end p-4 font-medium">{t('actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {requests
                .filter(r => !search.trim() || [
                  r.module, r.entity_name, r.status,
                  r.RequestedBy?.name, r.ReviewedBy?.name, r.reason,
                  r.created_at ? new Date(r.created_at).toLocaleDateString('en-PK') : ''
                ].some(v => (v || '').toLowerCase().includes(search.trim().toLowerCase())))
                .map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(r.createdAt).toLocaleString(lang === 'ur' ? 'ur-PK' : 'en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td className="p-4 capitalize" style={{ color: 'var(--text-primary)' }}>{r.module.replace('_', ' ')}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{r.entity_label || `#${r.entity_id}`}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{r.Requester?.name || '—'}</td>
                  <td className="p-4">
                    <span className={`badge ${r.status === 'pending' ? 'badge-yellow' : r.status === 'approved' ? 'badge-green' : 'badge-red'}`}>
                      {t(r.status)}
                    </span>
                  </td>
                  {tab !== 'pending' && (
                    <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{r.Reviewer?.name || '—'}</td>
                  )}
                  {tab === 'pending' && (
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => handleApprove(r)} className="icon-btn text-emerald-400" title={t('approve')}><Check className="w-4 h-4" /></button>
                        <button type="button" onClick={() => handleReject(r)} className="icon-btn text-red-400" title={t('reject')}><X className="w-4 h-4" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {requests.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noDeletionRequests')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
