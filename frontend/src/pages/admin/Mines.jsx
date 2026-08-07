import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pickaxe, Plus, Eye, Edit, Ban, RotateCcw, Loader2, Warehouse, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import api from '../../api/axios';
import { getMineStatusMeta } from '../../utils/mineStatus';

export default function Mines() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams, shopReady } = useShopApi();
  const navigate = useNavigate();
  const isRTL = lang === 'ur';

  const [mines, setMines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const { data } = await api.get('/branches', { params: { ...shopParams(), all: 1 } });
      setMines(data.branches || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, shopReady, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleClose = async (m) => {
    const ok = await confirm({ title: t('close') || 'Close', message: t('confirmDisableBranch'), confirmLabel: t('close') || 'Close', cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      await api.delete(`/branches/${m.id}`, { params: shopParams() });
      success(t('branchDisabled'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const handleReopen = async (m) => {
    try {
      await api.put(`/branches/${m.id}`, { status: 'active', ...shopParams() });
      success(t('branchEnabled'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const filtered = mines.filter(m => !search.trim() || [
    m.mine_code, m.name, m.address, m.company, m.Mineral?.name, m.province, m.district,
    m.Godown?.name, m.Manager?.name, m.status,
  ].some(v => (v || '').toLowerCase().includes(search.trim().toLowerCase())));

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Pickaxe}
        accent="cyan"
        title={t('mines')}
        subtitle={t('minesSub')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={t('mines') || 'Mines'}
              columns={[
                { header: t('mineCode') || 'Code', key: 'mine_code', width: 1 },
                { header: t('mineName') || 'Name', key: 'name', width: 1.6 },
                { header: t('company') || 'Company', render: m => m.company || '', width: 1.4 },
                { header: t('mineralType') || 'Mineral Type', render: m => m.Mineral?.name || '', width: 1.2 },
                { header: t('province') || 'Province', render: m => m.province || '', width: 1.1 },
                { header: t('district') || 'District', render: m => m.district || '', width: 1.1 },
                { header: t('manager') || 'Manager', render: m => m.Manager?.name || '', width: 1.3 },
                { header: t('status') || 'Status', key: 'status', width: 1 },
              ]}
              rows={filtered}
              filename="mines.pdf"
            />
            <button type="button" onClick={() => navigate('/admin/mines/create')} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('createMine')}
            </button>
          </div>
        }
      />

      <div className="glass-card p-4">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingInlineStart: '2.5rem' }}
            placeholder={t('searchMines') || 'Search mine code, name, province, manager…'}
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
                <th className="text-start p-4 font-medium">{t('mineCode') || 'Code'}</th>
                <th className="text-start p-4 font-medium">{t('mineName')}</th>
                <th className="text-start p-4 font-medium">{t('province')}</th>
                <th className="text-start p-4 font-medium">{t('district')}</th>
                <th className="text-start p-4 font-medium">{t('manager')}</th>
                <th className="text-start p-4 font-medium">{t('linkedGodown') || 'Linked Godown'}</th>
                <th className="text-start p-4 font-medium">{t('status')}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => {
                const meta = getMineStatusMeta(t, m.status);
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                    <td className="p-4 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{m.mine_code || '—'}</td>
                    <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {m.name}
                      {m.is_default && <span className="badge badge-blue text-xs ms-2">{t('defaultBranch')}</span>}
                    </td>
                    <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{m.province || '—'}</td>
                    <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{m.district || '—'}</td>
                    <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{m.Manager?.name || '—'}</td>
                    <td className="p-4">
                      {m.Godown ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Warehouse className="w-3.5 h-3.5" /> {m.Godown.name}
                        </span>
                      ) : (
                        <span className="text-xs italic" style={{ color: 'var(--text-muted)' }}>{t('unlinked') || 'Unlinked'}</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`badge ${meta.badge}`}>{meta.label}</span>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => navigate(`/admin/mines/${m.id}`)} className="icon-btn">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => navigate(`/admin/mines/${m.id}/edit`)} className="icon-btn">
                          <Edit className="w-4 h-4" />
                        </button>
                        {m.status !== 'closed' ? (
                          <button type="button" onClick={() => handleClose(m)} className="icon-btn text-red-400"><Ban className="w-4 h-4" /></button>
                        ) : (
                          <button type="button" onClick={() => handleReopen(m)} className="icon-btn text-emerald-400"><RotateCcw className="w-4 h-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noMines')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
