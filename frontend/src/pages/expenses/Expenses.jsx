import { useState, useEffect, useCallback } from 'react';
import { Receipt, Plus, Edit, Trash2, Loader2, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import ReportActions from '../../components/ui/ReportActions';
import ReportFilters, { filterByDate, activeFilterList } from '../../components/ui/ReportFilters';
import PaymentAccountSelect from '../../components/ui/PaymentAccountSelect';
import ExpenseCategorySelect from '../../components/ui/ExpenseCategorySelect';
import api from '../../api/axios';

function toDatetimeLocal(d) {
  const dt = d ? new Date(d) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

const emptyForm = (branches) => ({
  category: '', expense_account_id: null, description: '', amount: '',
  expense_date: toDatetimeLocal(new Date()),
  paid_via: 'cash', bank_account_id: null,
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
  const [reportFilters, setReportFilters] = useState({ from: '', to: '', category: '', paid_via: '', branch_id: '' });

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
      category: exp.category, expense_account_id: exp.expense_account_id || null,
      description: exp.description || '',
      amount: exp.amount,
      expense_date: toDatetimeLocal(exp.expense_date),
      paid_via: exp.paid_via, bank_account_id: exp.bank_account_id || null,
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

  // ── Report model ────────────────────────────────────────────────────────────
  const categories = [...new Set(expenses.map(e => e.category).filter(Boolean))];
  const reportSelects = [
    { key: 'category', label: t('category') || 'Category', options: categories.map(c => ({ value: c, label: c })) },
    { key: 'paid_via', label: t('method') || 'Method', options: [{ value: 'cash', label: t('cash') || 'Cash' }, { value: 'bank', label: t('bank') || 'Bank' }] },
    { key: 'branch_id', label: t('branch') || 'Branch', options: branches.map(b => ({ value: b.id, label: b.name })) },
  ];
  let reportRows = filterByDate(expenses, 'expense_date', reportFilters.from, reportFilters.to);
  if (reportFilters.category) reportRows = reportRows.filter(e => e.category === reportFilters.category);
  if (reportFilters.paid_via) reportRows = reportRows.filter(e => e.paid_via === reportFilters.paid_via);
  if (reportFilters.branch_id) reportRows = reportRows.filter(e => String(e.branch_id) === String(reportFilters.branch_id));
  const reportColumns = [
    { header: t('date') || 'Date', render: e => new Date(e.expense_date).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' }), width: 1.5 },
    { header: t('category') || 'Category', key: 'category', width: 1.3 },
    { header: t('description') || 'Description', render: e => e.description || '', width: 2 },
    { header: t('branch') || 'Branch', render: e => e.Branch?.name || '', width: 1.1 },
    { header: t('method') || 'Method', render: e => (e.paid_via === 'bank' ? t('bank') : t('cash')), width: 0.9 },
    { header: t('amount') || 'Amount', key: 'amount', money: true, width: 1.1 },
  ];
  const reportTotals = { __label: t('total') || 'Total', amount: reportRows.reduce((s, e) => s + parseFloat(e.amount || 0), 0) };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Receipt}
        accent="rose"
        title={t('expenses')}
        subtitle={t('expensesSub')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={t('expenses') || 'Expenses Report'}
              columns={reportColumns}
              rows={reportRows}
              totals={reportTotals}
              filters={activeFilterList(reportFilters, reportSelects)}
              filename="expenses-report.pdf"
            />
            <button type="button" onClick={openCreate} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('addExpense')}
            </button>
          </div>
        }
      />

      <div className="glass-card p-4 space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingInlineStart: '2.5rem' }} placeholder={t('searchExpenses')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <ReportFilters
          value={reportFilters}
          onChange={(k, v) => setReportFilters(f => ({ ...f, [k]: v }))}
          onClear={() => setReportFilters({ from: '', to: '', category: '', paid_via: '', branch_id: '' })}
          selects={reportSelects}
        />
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
              {reportRows.map(exp => (
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
              {reportRows.length === 0 && (
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
                <FormLabel required>{t('category')}</FormLabel>
                <ExpenseCategorySelect
                  required
                  value={form.expense_account_id}
                  onChange={({ expense_account_id, category }) => setForm(f => ({ ...f, expense_account_id, category }))}
                />
              </div>
              <div>
                <FormLabel required>{t('amount')}</FormLabel>
                <input className="input" type="number" min="0.01" step="0.01" required value={form.amount} onChange={setF('amount')} />
              </div>
              <div>
                <FormLabel>{t('expenseDateTime')}</FormLabel>
                <input className="input" type="datetime-local" value={form.expense_date} onChange={setF('expense_date')} />
              </div>
              <div>
                <FormLabel required>{t('method')}</FormLabel>
                <PaymentAccountSelect
                  required
                  method={form.paid_via}
                  bankAccountId={form.bank_account_id}
                  onChange={({ method, bank_account_id }) => setForm(f => ({ ...f, paid_via: method, bank_account_id }))}
                />
              </div>
              <div>
                <FormLabel required>{t('branch')}</FormLabel>
                <select className="input" required value={form.branch_id} onChange={setF('branch_id')}>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <FormLabel>{t('description')}</FormLabel>
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
