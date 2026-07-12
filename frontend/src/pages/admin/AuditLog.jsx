import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Loader2, RefreshCw, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import api from '../../api/axios';

const ACTION_BADGE = {
  create: 'badge-green',
  update: 'badge-yellow',
  delete: 'badge-red',
};

function StatusPill({ code }) {
  if (!code) return <span>—</span>;
  const ok = code >= 200 && code < 300;
  return (
    <span className={`badge ${ok ? 'badge-green' : 'badge-red'}`}>{code}</span>
  );
}

export default function AuditLog() {
  const { t, lang } = useTheme();
  const { error } = useToast();
  const { shopParams } = useShopApi();
  const isRTL = lang === 'ur';

  const [logs, setLogs] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [moduleFilter, setModuleFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [detail, setDetail] = useState(null);

  const fetchModules = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/audit-log/modules', { params: shopParams() });
      setModules(data.modules || []);
    } catch {
      // non-critical — filter dropdown just stays empty
    }
  }, [shopParams]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams(), page, limit: 50 };
      if (moduleFilter !== 'all') params.module = moduleFilter;
      if (actionFilter !== 'all') params.action = actionFilter;
      if (search.trim()) params.search = search.trim();
      if (from) params.from = from;
      if (to) params.to = to;
      const { data } = await api.get('/admin/audit-log', { params });
      setLogs(data.logs || []);
      setPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, page, moduleFilter, actionFilter, search, from, to, error, t]);

  useEffect(() => { fetchModules(); }, [fetchModules]);
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Any filter change resets to page 1
  useEffect(() => { setPage(1); }, [moduleFilter, actionFilter, search, from, to]);

  let prettyDetails = '';
  if (detail) {
    try { prettyDetails = JSON.stringify(JSON.parse(detail.details || '{}'), null, 2); }
    catch { prettyDetails = detail.details || ''; }
  }

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={ShieldCheck}
        accent="brand"
        title={t('auditLog') || 'Audit Log'}
        subtitle={t('auditLogSub') || 'Every change made across the system — who did what, and when'}
      />

      <div className="glass-card p-4 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{t('module') || 'Module'}</span>
          <select className="input max-w-xs" value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}>
            <option value="all">{t('allModules') || 'All Modules'}</option>
            {modules.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{t('actionType') || 'Action Type'}</span>
          <select className="input max-w-xs" value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
            <option value="all">{t('allActions') || 'All Actions'}</option>
            <option value="create">{t('create') || 'Create'}</option>
            <option value="update">{t('update') || 'Update'}</option>
            <option value="delete">{t('delete') || 'Delete'}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{t('from') || 'From'}</span>
          <input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{t('to') || 'To'}</span>
          <input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{t('search') || 'Search'}</span>
          <input className="input" placeholder={t('searchAuditLog') || 'Search path or details...'} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={fetchLogs} className="btn-secondary flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />{t('refresh') || 'Refresh'}
        </button>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {t('totalEntries') || 'Total entries'}: {total}
      </p>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('date') || 'Date'}</th>
                <th className="text-start p-4">{t('user') || 'User'}</th>
                <th className="text-start p-4">{t('actionType') || 'Action'}</th>
                <th className="text-start p-4">{t('module') || 'Module'}</th>
                <th className="text-start p-4">{t('path') || 'Path'}</th>
                <th className="text-start p-4">{t('status') || 'Status'}</th>
                <th className="text-end p-4">{t('actions') || 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(log.date).toLocaleString(isRTL ? 'ur-PK' : 'en-PK')}
                  </td>
                  <td className="p-4" style={{ color: 'var(--text-primary)' }}>
                    {log.user?.name || '—'}
                    {log.user?.email && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{log.user.email}</div>}
                  </td>
                  <td className="p-4"><span className={`badge ${ACTION_BADGE[log.action] || 'badge-blue'}`}>{t(log.action) || log.action}</span></td>
                  <td className="p-4 capitalize" style={{ color: 'var(--text-secondary)' }}>{log.module}</td>
                  <td className="p-4 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{log.method} {log.path}</td>
                  <td className="p-4"><StatusPill code={log.status_code} /></td>
                  <td className="p-4 text-end">
                    <button type="button" className="icon-btn" title={t('viewDetails') || 'Details'} onClick={() => setDetail(log)}>
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noEntries') || 'No entries found'}</td></tr>
              )}
            </tbody>
          </table>

          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 p-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="icon-btn disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{page} / {pages}</span>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                className="icon-btn disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {detail && (
        <Modal title={t('viewDetails') || 'Details'} onClose={() => setDetail(null)} wide>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span style={{ color: 'var(--text-muted)' }}>{t('date') || 'Date'}: </span>{new Date(detail.date).toLocaleString(isRTL ? 'ur-PK' : 'en-PK')}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>{t('user') || 'User'}: </span>{detail.user?.name || '—'}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>{t('module') || 'Module'}: </span>{detail.module}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>{t('status') || 'Status'}: </span>{detail.status_code}</div>
              <div className="col-span-2"><span style={{ color: 'var(--text-muted)' }}>{t('path') || 'Path'}: </span><span className="font-mono">{detail.method} {detail.path}</span></div>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{t('notes') || 'Notes'}</p>
              <pre
                className="text-xs rounded-lg p-3 overflow-x-auto"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', maxHeight: 320 }}
              >
                {prettyDetails || '—'}
              </pre>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
