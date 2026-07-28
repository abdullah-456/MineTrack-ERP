import { useState, useEffect, useCallback } from 'react';
import { Receipt, Plus, Edit, Trash2, Loader2, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import { useHighlightRow } from '../../hooks/useHighlightRow';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import LocationPicker from '../../components/ui/LocationPicker';
import ReportActions from '../../components/ui/ReportActions';
import ReportFilters, { filterByDate, activeFilterList } from '../../components/ui/ReportFilters';
import PaymentAccountSelect from '../../components/ui/PaymentAccountSelect';
import ExpenseCategorySelect from '../../components/ui/ExpenseCategorySelect';
import api from '../../api/axios';
import { filterRowsByLocation } from '../../utils/locationUtils';

function toDatetimeLocal(d) {
  const dt = d ? new Date(d) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

const emptyForm = (branches) => ({
  category: '', expense_account_id: null, description: '', amount: '',
  expense_date: toDatetimeLocal(new Date()),
  paid_via: 'cash', bank_account_id: null, board_member_id: null,
  location_type: 'branch', branch_id: branches?.[0]?.id || '', godown_id: null,
});

export default function Expenses() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams, branches } = useShopApi();
  const isRTL = lang === 'ur';
  const { isHighlighted } = useHighlightRow();

  const [expenses, setExpenses] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reportFilters, setReportFilters] = useState({ from: '', to: '', category: '', paid_via: '', branch_id: '' });
  const [locationFilter, setLocationFilter] = useState({ location_type: 'branch', branch_id: '', godown_id: null });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [expRes, godRes] = await Promise.all([
        api.get('/expenses', { params: { ...shopParams(), search } }),
        api.get('/godowns', { params: shopParams() }).catch(() => ({ data: { godowns: [] } })),
      ]);
      setExpenses(expRes.data.expenses || []);
      setGodowns(godRes.data.godowns || []);
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
      paid_via: exp.paid_via, bank_account_id: exp.bank_account_id || null, board_member_id: null,
      location_type: exp.Branch?.godown_id ? 'godown' : 'branch',
      branch_id: exp.branch_id,
      godown_id: exp.Branch?.godown_id || null,
    });
    setModal('edit');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        branch_id: form.branch_id ? parseInt(form.branch_id, 10) : undefined,
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
  ];
  let reportRows = filterByDate(expenses, 'expense_date', reportFilters.from, reportFilters.to);
  if (reportFilters.category) reportRows = reportRows.filter(e => e.category === reportFilters.category);
  if (reportFilters.paid_via) reportRows = reportRows.filter(e => e.paid_via === reportFilters.paid_via);
  reportRows = filterRowsByLocation(reportRows, locationFilter, godowns, branches);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    reportRows = reportRows.filter(e =>
      (e.title || '').toLowerCase().includes(q) ||
      (e.category || '').toLowerCase().includes(q) ||
      (e.paid_via || '').toLowerCase().includes(q) ||
      (e.notes || '').toLowerCase().includes(q) ||
      (e.BankAccount?.account_name || '').toLowerCase().includes(q) ||
      (e.Branch?.name || '').toLowerCase().includes(q) ||
      (e.Branch?.Godown?.name || '').toLowerCase().includes(q) ||
      (String(e.amount) || '').toLowerCase().includes(q) ||
      (e.expense_date ? new Date(e.expense_date).toLocaleDateString('en-PK') : '').toLowerCase().includes(q)
    );
  }

  const formatLocationName = (exp) => {
    if (exp.Branch?.Godown) return `${exp.Branch.Godown.name} (${exp.Branch.name})`;
    return exp.Branch?.name || '—';
  };

  const reportColumns = [
    { header: t('date') || 'Date', render: e => new Date(e.expense_date).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' }), width: 1.5 },
    { header: t('category') || 'Category', key: 'category', width: 1.3 },
    { header: t('description') || 'Description', render: e => e.description || '', width: 2 },
    { header: t('location') || 'Location', render: e => formatLocationName(e), width: 1.4 },
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
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
            <input className="input" style={{ paddingInlineStart: '2.5rem' }} placeholder={t('searchExpenses')} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <LocationPicker
            compact
            value={locationFilter}
            onChange={setLocationFilter}
          />
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
                <th className="text-start p-4 font-medium">{t('location') || 'Location'}</th>
                <th className="text-start p-4 font-medium">{t('method')}</th>
                <th className="text-end p-4 font-medium">{t('amount')}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map(exp => (
                <tr
                  key={exp.id}
                  id={`row-${exp.id}`}
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  className={`${isHighlighted(exp.id) ? 'highlight-row' : 'hover:bg-white/5'} cursor-pointer transition-colors`}
                  onClick={(e) => {
                    if (e.target.closest('button')) return;
                    openEdit(exp);
                  }}
                >
                  <td className="p-4 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(exp.expense_date).toLocaleString(lang === 'ur' ? 'ur-PK' : 'en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{exp.category}</td>
                  <td className="p-4 max-w-xs truncate" style={{ color: 'var(--text-secondary)' }}>{exp.description || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{formatLocationName(exp)}</td>
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
                  boardMemberId={form.board_member_id}
                  onChange={({ method, bank_account_id, board_member_id }) => setForm(f => ({
                    ...f, paid_via: method, bank_account_id, board_member_id: board_member_id || null,
                  }))}
                />
              </div>
              <div className="sm:col-span-2">
                <LocationPicker
                  required
                  label={t('location') || 'Branch / Godown Location'}
                  value={{
                    location_type: form.location_type || 'branch',
                    branch_id: form.branch_id,
                    godown_id: form.godown_id,
                  }}
                  onChange={(loc) => setForm(f => ({
                    ...f,
                    location_type: loc.location_type,
                    branch_id: loc.branch_id,
                    godown_id: loc.godown_id,
                  }))}
                />
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
