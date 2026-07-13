import { useState, useEffect, useCallback } from 'react';
import { Crown, Plus, Edit, Trash2, Loader2, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import Modal from '../../components/ui/Modal';
import api from '../../api/axios';

const EMPTY = { name: '', phone: '', cnic: '', address: '', opening_balance: '' };

export default function BoardOfDirectors() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams } = useShopApi();
  const isRTL = lang === 'ur';

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/board-members', { params: { ...shopParams(), search } });
      setMembers(data.members || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, search, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, ...shopParams() };
      if (modal === 'create') {
        await api.post('/board-members', payload);
        success(t('boardMemberCreated'));
      } else {
        await api.put(`/board-members/${selected.id}`, payload);
        success(t('boardMemberUpdated'));
      }
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m) => {
    const ok = await confirm({ title: t('delete'), message: t('confirmDeleteBoardMember'), confirmLabel: t('delete'), cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      const res = await api.delete(`/board-members/${m.id}`, { params: shopParams() });
      success(res.status === 202 ? t('deletionRequestSubmitted') : t('boardMemberDeleted'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Crown}
        accent="amber"
        title={t('boardOfDirectors')}
        subtitle={t('boardOfDirectorsSub')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={t('boardOfDirectors') || 'Board of Directors'}
              columns={[
                { header: t('name') || 'Name', key: 'name', width: 1.6 },
                { header: t('phone') || 'Phone', render: m => m.phone || '', width: 1.2 },
                { header: t('cnic') || 'CNIC', render: m => m.cnic || '', width: 1.3 },
                { header: t('address') || 'Address', render: m => m.address || '', width: 2.2 },
                { header: t('boardMemberOpeningBalance') || 'Opening Balance', render: m => m.opening_balance != null ? Number(m.opening_balance).toLocaleString() : '0', width: 1.2 },
              ]}
              rows={members}
              filename="board-of-directors.pdf"
            />
            <button type="button" onClick={() => { setForm(EMPTY); setModal('create'); }} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('addBoardMember')}
            </button>
          </div>
        }
      />

      <div className="glass-card p-4">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingInlineStart: '2.5rem' }} placeholder={t('searchBoardMembers')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4 font-medium">{t('name')}</th>
                <th className="text-start p-4 font-medium">{t('phone')}</th>
                <th className="text-start p-4 font-medium">{t('cnic')}</th>
                <th className="text-start p-4 font-medium">{t('address')}</th>
                <th className="text-start p-4 font-medium">{t('boardMemberOpeningBalance') || 'Opening Balance'}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{m.name}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{m.phone || '—'}</td>
                  <td className="p-4 font-mono" style={{ color: 'var(--text-secondary)' }}>{m.cnic || '—'}</td>
                  <td className="p-4 max-w-xs truncate" style={{ color: 'var(--text-secondary)' }}>{m.address || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{m.opening_balance != null ? Number(m.opening_balance).toLocaleString() : '0'}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(m);
                          setForm({ name: m.name, phone: m.phone || '', cnic: m.cnic || '', address: m.address || '', opening_balance: m.opening_balance != null ? m.opening_balance : '' });
                          setModal('edit');
                        }}
                        className="icon-btn"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleDelete(m)} className="icon-btn text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noBoardMembers')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal title={modal === 'create' ? t('addBoardMember') : t('editBoardMember')} onClose={() => setModal(null)}>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('name')} *</label>
              <input className="input" required value={form.name} onChange={setF('name')} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('phone')}</label>
              <input className="input" value={form.phone} onChange={setF('phone')} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('cnic')}</label>
              <input className="input" placeholder="35202-1234567-1" value={form.cnic} onChange={setF('cnic')} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('address')}</label>
              <textarea className="input min-h-[80px]" value={form.address} onChange={setF('address')} />
            </div>
            {modal === 'create' && (
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}
                >{t('boardMemberOpeningBalance') || 'Opening Balance'}</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.opening_balance}
                  onChange={setF('opening_balance')}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {t('boardMemberOpeningBalanceHint') || 'Optional starting balance for this member.'}
                </p>
              </div>
            )}
            {modal === 'edit' && (
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}
                >{t('boardMemberOpeningBalance') || 'Opening Balance'}</label>
                <input
                  className="input"
                  type="number"
                  value={form.opening_balance}
                  readOnly
                  style={{ opacity: 0.6, cursor: 'not-allowed' }}
                />
              </div>
            )}
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
