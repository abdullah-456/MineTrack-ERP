import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Plus, Edit, Trash2, Loader2, Search, BookOpen } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import FundAccountSelect from '../../components/ui/FundAccountSelect';
import api from '../../api/axios';

const EMPTY = {
  name: '', phone: '', cnic: '', address: '', branch_id: '',
  opening_cash_amount: '', opening_cash_account_id: null,
  opening_bank_amount: '', opening_bank_account_id: null,
};

export default function BoardOfDirectors() {
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams, branches } = useShopApi();
  const isRTL = lang === 'ur';

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const [branchFilter, setBranchFilter] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams(), search };
      if (branchFilter) params.branch_id = branchFilter;
      const { data } = await api.get('/board-members', { params });
      setMembers(data.members || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, search, branchFilter, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        branch_id: parseInt(form.branch_id, 10),
        ...shopParams(),
      };
      if (modal === 'create') {
        await api.post('/board-members', payload);
        success(t('boardMemberCreated'));
      } else {
        await api.put(`/board-members/${selected.id}`, {
          name: form.name,
          phone: form.phone,
          cnic: form.cnic,
          address: form.address,
          branch_id: parseInt(form.branch_id, 10),
          ...shopParams(),
        });
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
                { header: t('branch') || 'Branch', render: m => m.Branch?.name || '—', width: 1.2 },
                { header: t('phone') || 'Phone', render: m => m.phone || '', width: 1.2 },
                { header: t('cnic') || 'CNIC', render: m => m.cnic || '', width: 1.3 },
                { header: t('address') || 'Address', render: m => m.address || '', width: 2.2 },
                { header: t('boardMemberOpeningBalance') || 'Opening Balance', render: m => m.opening_balance != null ? Number(m.opening_balance).toLocaleString() : '0', width: 1.2 },
              ]}
              rows={members}
              filename="board-of-directors.pdf"
            />
            <button type="button" onClick={() => { setForm({ ...EMPTY, branch_id: branches[0]?.id || '' }); setModal('create'); }} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('addBoardMember')}
            </button>
          </div>
        }
      />

      <div className="glass-card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingInlineStart: '2.5rem' }} placeholder={t('searchBoardMembers')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {branches.length > 1 && (
          <select className="input w-auto min-w-[160px]" value={branchFilter} onChange={e => setBranchFilter(e.target.value)}>
            <option value="">{t('allBranches') || 'All branches'}</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4 font-medium">{t('name')}</th>
                <th className="text-start p-4 font-medium">{t('branch')}</th>
                <th className="text-start p-4 font-medium">{t('phone')}</th>
                <th className="text-start p-4 font-medium">{t('cnic')}</th>
                <th className="text-start p-4 font-medium">{t('address')}</th>
                <th className="text-start p-4 font-medium">{t('boardMemberOpeningBalance') || 'Opening Balance'}</th>
                <th className="text-end p-4 font-medium">{t('currentBalance')}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{m.name}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{m.Branch?.name || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{m.phone || '—'}</td>
                  <td className="p-4 font-mono" style={{ color: 'var(--text-secondary)' }}>{m.cnic || '—'}</td>
                  <td className="p-4 max-w-xs truncate" style={{ color: 'var(--text-secondary)' }}>{m.address || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{m.opening_balance != null ? Number(m.opening_balance).toLocaleString() : '0'}</td>
                  <td className="p-4 text-end font-bold" style={{ color: 'var(--text-primary)' }}>{formatPKR(m.current_balance, lang)}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => navigate(`/admin/board-of-directors/${m.id}/ledger`)} title={t('viewLedger')} className="icon-btn">
                        <BookOpen className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(m);
                          setForm({
                            name: m.name, phone: m.phone || '', cnic: m.cnic || '', address: m.address || '',
                            branch_id: m.branch_id || branches[0]?.id || '',
                          });
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
                <tr><td colSpan={8} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noBoardMembers')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal xl title={modal === 'create' ? t('addBoardMember') : t('editBoardMember')} onClose={() => setModal(null)}>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel required>{t('branch')}</FormLabel>
                <select className="input" required value={form.branch_id} onChange={setF('branch_id')}>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <FormLabel required>{t('name')}</FormLabel>
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
                <input className="input" value={form.address} onChange={setF('address')} />
              </div>
            </div>
            {modal === 'create' && (
              <div className="space-y-3 rounded-lg p-4" style={{ border: '1px solid var(--border-subtle)' }}>
                <div>
                  <FormLabel>{t('boardMemberOpeningBalance') || 'Opening Balance'}</FormLabel>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {t('boardMemberOpeningBalanceHint2') || 'Split across cash and bank — pick or create the fund account that received each portion.'}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 rounded-lg p-3 h-full" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <label className="text-xs font-semibold block" style={{ color: 'var(--text-secondary)' }}>{t('viaCash') || 'Via Cash'}</label>
                    <input
                      className="input" type="number" min="0" step="0.01" placeholder="0.00"
                      value={form.opening_cash_amount}
                      onChange={setF('opening_cash_amount')}
                    />
                    {parseFloat(form.opening_cash_amount || 0) > 0 && (
                      <div>
                        <FormLabel>{t('whichCashAccount') || 'Which cash account?'}</FormLabel>
                        <FundAccountSelect
                          kind="cash"
                          allowCashInHand
                          value={form.opening_cash_account_id}
                          onChange={id => setForm(f => ({ ...f, opening_cash_account_id: id }))}
                        />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 rounded-lg p-3 h-full" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <label className="text-xs font-semibold block" style={{ color: 'var(--text-secondary)' }}>{t('viaBank') || 'Via Bank'}</label>
                    <input
                      className="input" type="number" min="0" step="0.01" placeholder="0.00"
                      value={form.opening_bank_amount}
                      onChange={setF('opening_bank_amount')}
                    />
                    {parseFloat(form.opening_bank_amount || 0) > 0 && (
                      <div>
                        <FormLabel required>{t('whichBankAccount') || 'Which bank account?'}</FormLabel>
                        <FundAccountSelect
                          kind="bank"
                          required
                          value={form.opening_bank_account_id}
                          onChange={id => setForm(f => ({ ...f, opening_bank_account_id: id }))}
                        />
                      </div>
                    )}
                  </div>
                </div>
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
