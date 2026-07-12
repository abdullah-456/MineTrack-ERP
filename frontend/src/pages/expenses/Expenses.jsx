import { useState, useEffect, useCallback } from 'react';
import { Receipt, Plus, Edit, Trash2, Loader2, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import api from '../../api/axios';

function toDatetimeLocal(d) {
  const dt = d ? new Date(d) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

const emptyForm = (branches) => ({
  category: '', description: '', amount: '',
  expense_date: toDatetimeLocal(new Date()),
  paid_via: 'cash',
  branch_id: branches?.[0]?.id || '',
});

export default function Expenses() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams, branches } = useShopApi();
  const isRTL = lang === 'ur';

  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/expenses', { params: { ...shopParams(), search } });
      setExpenses(data.expenses || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, search, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const openCreate = () => { setForm(emptyForm(branches)); setModal('create'); };

  const openEdit = (exp) => {
    setSelected(exp);
    setForm({
      category: exp.category,
      description: exp.description || '',
      amount: exp.amount,
      expense_date: toDatetimeLocal(exp.expense_date),
      paid_via: exp.paid_via,
      branch_id: exp.branch_id,
    });
    setModal('edit');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        amount: parseFloat(form.amount) || 0,
        expense_date: form.expense_date ? new Date(form.expense_date).toISOString() : undefined,
        ...shopParams(),
      };
      if (modal === 'create') {
        await api.post('/expenses', payload);
        success(t('expenseCreated'));
      } else {
        await api.put(`/expenses/${selected.id}`, payload);
        success(t('expenseUpdated'));
      }
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (exp) => {
    const ok = await confirm({ title: t('delete'), message: t('confirmDeleteExpense'), confirmLabel: t('delete'), cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      await api.delete(`/expenses/${exp.id}`, { params: shopParams() });
      success(t('expenseDeleted'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Receipt}
        accent="rose"
        title={t('expenses')}
        subtitle={t('expensesSub')}
        action={
          <button type="button" onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />{t('addExpense')}
          </button>
        }
      />

      <div className="glass-card p-4">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingInlineStart: '2.5rem' }} placeholder={t('searchExpenses')} value={search} onChange={e => setSearch(e.target.value)} />
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
                <th className="text-start p-4 font-medium">{t('category')}</th>
                <th className="text-start p-4 font-medium">{t('description')}</th>
                <th className="text-start p-4 font-medium">{t('branch')}</th>
                <th className="text-start p-4 font-medium">{t('method')}</th>
                <th className="text-end p-4 font-medium">{t('amount')}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(exp => (
                <tr key={exp.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(exp.expense_date).toLocaleString(lang === 'ur' ? 'ur-PK' : 'en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{exp.category}</td>
                  <td className="p-4 max-w-xs truncate" style={{ color: 'var(--text-secondary)' }}>{exp.description || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{exp.Branch?.name || '—'}</td>
                  <td className="p-4">
                    <span className={`badge ${exp.paid_via === 'bank' ? 'badge-blue' : 'badge-green'}`}>
                      {exp.paid_via === 'bank' ? t('bank') : t('cash')}
                    </span>
                  </td>
                  <td className="p-4 text-end font-semibold" style={{ color: 'var(--text-primary)' }}>{formatPKR(exp.amount, lang)}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => openEdit(exp)} className="icon-btn"><Edit className="w-4 h-4" /></button>
                      <button type="button" onClick={() => handleDelete(exp)} className="icon-btn text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noExpenses')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal title={modal === 'create' ? t('addExpense') : t('editExpense')} onClose={() => setModal(null)} wide>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('category')} *</label>
                <input className="input" required value={form.category} onChange={setF('category')} placeholder="Rent, Utilities, Office Supplies..." />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('amount')} *</label>
                <input className="input" type="number" min="0.01" step="0.01" required value={form.amount} onChange={setF('amount')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('expenseDateTime')}</label>
                <input className="input" type="datetime-local" value={form.expense_date} onChange={setF('expense_date')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('method')}</label>
                <select className="input" value={form.paid_via} onChange={setF('paid_via')}>
                  <option value="cash">{t('cash')}</option>
                  <option value="bank">{t('bank')}</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('branch')}</label>
                <select className="input" value={form.branch_id} onChange={setF('branch_id')}>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('description')}</label>
                <textarea className="input min-h-[80px]" value={form.description} onChange={setF('description')} />
              </div>
            </div>
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
