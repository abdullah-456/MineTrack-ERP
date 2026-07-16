import { useState, useEffect, useCallback } from 'react';
import { GitBranch, Plus, Edit, Ban, RotateCcw, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import api from '../../api/axios';

const EMPTY = { name: '', address: '', is_default: false };

export default function Branches() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams } = useShopApi();
  const isRTL = lang === 'ur';

  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/branches', { params: { ...shopParams(), all: 1 } });
      setBranches(data.branches || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, ...shopParams() };
      if (modal === 'create') {
        await api.post('/branches', payload);
        success(t('branchCreated'));
      } else {
        await api.put(`/branches/${selected.id}`, payload);
        success(t('branchUpdated'));
      }
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async (b) => {
    const ok = await confirm({ title: t('disable'), message: t('confirmDisableBranch'), confirmLabel: t('disable'), cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      await api.delete(`/branches/${b.id}`, { params: shopParams() });
      success(t('branchDisabled'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const handleEnable = async (b) => {
    try {
      await api.put(`/branches/${b.id}`, { status: 'active', ...shopParams() });
      success(t('branchEnabled'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={GitBranch}
        accent="cyan"
        title={t('branches')}
        subtitle={t('branchesSub')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={t('branches') || 'Branches'}
              columns={[
                { header: t('branchName') || 'Name', key: 'name', width: 1.6 },
                { header: t('branchAddress') || 'Address', render: b => b.address || '', width: 2.2 },
                { header: t('defaultBranch') || 'Default', render: b => (b.is_default ? 'Yes' : ''), width: 0.9 },
                { header: t('status') || 'Status', key: 'status', width: 0.9 },
              ]}
              rows={branches}
              filename="branches.pdf"
            />
            <button type="button" onClick={() => { setForm(EMPTY); setModal('create'); }} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('createBranch')}
            </button>
          </div>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4 font-medium">{t('branchName')}</th>
                <th className="text-start p-4 font-medium">{t('branchAddress')}</th>
                <th className="text-start p-4 font-medium">{t('defaultBranch')}</th>
                <th className="text-start p-4 font-medium">{t('status')}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {branches.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{b.name}</td>
                  <td className="p-4 max-w-xs truncate" style={{ color: 'var(--text-secondary)' }}>{b.address || '—'}</td>
                  <td className="p-4">
                    {b.is_default && <span className="badge badge-blue text-xs">{t('defaultBranch')}</span>}
                  </td>
                  <td className="p-4">
                    <span className={`badge ${b.status === 'active' ? 'badge-green' : 'badge-red'}`}>
                      {b.status === 'active' ? t('active') : t('disabled')}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(b);
                          setForm({ name: b.name, address: b.address || '', is_default: !!b.is_default });
                          setModal('edit');
                        }}
                        className="icon-btn"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      {b.status === 'active' ? (
                        <button type="button" onClick={() => handleDisable(b)} className="icon-btn text-red-400"><Ban className="w-4 h-4" /></button>
                      ) : (
                        <button type="button" onClick={() => handleEnable(b)} className="icon-btn text-emerald-400"><RotateCcw className="w-4 h-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {branches.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noBranches')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal title={modal === 'create' ? t('createBranch') : t('editBranch')} onClose={() => setModal(null)}>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <FormLabel required>{t('branchName')}</FormLabel>
              <input className="input" required value={form.name} onChange={setF('name')} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('branchAddress')}</label>
              <textarea className="input min-h-[80px]" value={form.address} onChange={setF('address')} />
            </div>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))}
              />
              {t('defaultBranch')}
            </label>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">{t('save')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
