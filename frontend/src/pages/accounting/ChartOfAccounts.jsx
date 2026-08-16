import { useState, useEffect, useCallback, useMemo } from 'react';
import { BookOpen, Loader2, Plus, Edit, Trash2, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import api from '../../api/axios';
import { humanize } from '../../utils/textFormat';

// Liability/equity/income accounts are credit-normal — the raw ledger stores
// debit-minus-credit, so flip the sign for those types to show a natural,
// non-confusing positive figure (e.g. "amount owed" instead of "-amount owed").
const CREDIT_NORMAL = new Set(['liability', 'equity', 'income']);
const displayBalance = (account) => (CREDIT_NORMAL.has(account.account_type) ? -account.balance : account.balance);

const TYPE_COLORS = {
  asset: 'text-blue-400', liability: 'text-red-400', equity: 'text-violet-400',
  income: 'text-emerald-400', expense: 'text-amber-400',
};

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];
const FUND_PARENT_CODES = new Set(['05-BANK', '05-CASH']);

const EMPTY = {
  account_name: '', account_type: 'asset', parent_account_id: '', account_code: '',
  opening_balance: '', bank_name: '', account_number: '', is_active: true, is_contra: false,
  // Defaults to new money so behaviour is unchanged when the question is ignored.
  funding_source: 'new_capital', source_account_id: '',
};

function flattenTree(accounts) {
  const byId = new Map(accounts.map(a => [a.id, { ...a, children: [] }]));
  const roots = [];
  byId.forEach(node => {
    if (node.parent_account_id && byId.has(node.parent_account_id)) {
      byId.get(node.parent_account_id).children.push(node);
    } else {
      roots.push(node);
    }
  });
  const out = [];
  const visit = (nodes, depth) => {
    nodes.forEach(node => {
      out.push({ account: node, depth });
      if (node.children.length) visit(node.children, depth + 1);
    });
  };
  visit(roots, 0);
  return out;
}

export default function ChartOfAccounts() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { can } = useAuth();
  const { shopParams } = useShopApi();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const canCreate = can('accounting', 'create');
  const canUpdate = can('accounting', 'update');
  const canDelete = can('accounting', 'delete');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/accounting/chart-of-accounts', { params: shopParams() });
      setAccounts(data.accounts || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const rows = useMemo(() => {
    const all = flattenTree(accounts);
    if (!search.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter(({ account }) =>
      (account.account_name || '').toLowerCase().includes(q) ||
      (account.account_code || '').toLowerCase().includes(q) ||
      (account.account_type || '').toLowerCase().includes(q) ||
      (String(account.balance) || '').toLowerCase().includes(q)
    );
  }, [accounts, search]);

  const accountById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);
  const bankParentId = useMemo(() => accounts.find(a => a.account_code === '05-BANK')?.id, [accounts]);
  const cashParentId = useMemo(() => accounts.find(a => a.account_code === '05-CASH')?.id, [accounts]);

  const descendantIds = useCallback((id) => {
    const ids = new Set();
    const walk = (parentId) => {
      accounts.filter(a => a.parent_account_id === parentId).forEach(child => {
        ids.add(child.id);
        walk(child.id);
      });
    };
    walk(id);
    return ids;
  }, [accounts]);

  const parentOptions = useMemo(() => {
    const excluded = selected ? new Set([selected.id, ...descendantIds(selected.id)]) : new Set();
    return accounts.filter(a => a.account_type === form.account_type && !excluded.has(a.id));
  }, [accounts, form.account_type, selected, descendantIds]);

  const selectedParent = form.parent_account_id ? accountById.get(Number(form.parent_account_id)) : null;
  const isFundCreate = modal === 'create' && selectedParent && FUND_PARENT_CODES.has(selectedParent.account_code);
  const isFundEdit = modal === 'edit' && selected?.fund_kind;
  const isFundForm = isFundCreate || isFundEdit;
  const fundKind = isFundEdit ? selected.fund_kind : (selectedParent?.account_code === '05-CASH' ? 'cash' : 'bank');

  const isPaymentAccount = (account) =>
    account.account_code === '05-CASH'
    || (bankParentId && account.parent_account_id === bankParentId)
    || (cashParentId && account.parent_account_id === cashParentId && account.account_code !== '05-CASH');

  // Accounts a transfer can draw from: every cash/bank fund that currently holds
  // money. The shared '05-CASH' drawer is included — it has no bank_accounts row
  // of its own but is where most shops actually keep their cash.
  const fundSourceOptions = accounts.filter(a => isPaymentAccount(a) && a.is_active && a.balance > 0);

  const setF = (k) => (e) => {
    const value = (k === 'is_active' || k === 'is_contra') ? e.target.checked : e.target.value;
    setForm(f => {
      const next = { ...f, [k]: value };
      if (k === 'parent_account_id') {
        const parent = accountById.get(Number(value));
        if (parent && FUND_PARENT_CODES.has(parent.account_code)) next.account_type = 'asset';
      }
      return next;
    });
  };

  const openCreate = () => { setSelected(null); setForm(EMPTY); setModal('create'); };
  const openEdit = (account) => {
    setSelected(account);
    setForm({
      account_name: account.account_name,
      account_type: account.account_type,
      parent_account_id: account.parent_account_id || '',
      account_code: account.account_code,
      opening_balance: '',
      bank_name: account.bank_name || '',
      account_number: account.account_number || '',
      is_active: account.is_active,
      is_contra: !!account.is_contra,
    });
    setModal('edit');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === 'create') {
        await api.post('/accounting/chart-of-accounts', {
          ...shopParams(),
          account_name: form.account_name,
          account_type: form.account_type,
          parent_account_id: form.parent_account_id || null,
          account_code: form.account_code || undefined,
          is_contra: form.is_contra,
          ...(isFundForm ? {
            opening_balance: form.opening_balance,
            bank_name: fundKind === 'bank' ? form.bank_name : undefined,
            account_number: fundKind === 'bank' ? form.account_number : undefined,
            funding_source: form.funding_source,
            source_account_id: form.funding_source === 'transfer' ? form.source_account_id : undefined,
          } : {}),
        });
        success(t('accountCreated'));
      } else {
        await api.put(`/accounting/chart-of-accounts/${selected.id}`, {
          ...shopParams(),
          account_name: form.account_name,
          account_type: form.account_type,
          parent_account_id: form.parent_account_id || null,
          is_active: form.is_active,
          is_contra: form.is_contra,
          ...(isFundForm ? {
            bank_name: fundKind === 'bank' ? form.bank_name : undefined,
            account_number: fundKind === 'bank' ? form.account_number : undefined,
          } : {}),
        });
        success(t('accountUpdated'));
      }
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (account) => {
    const ok = await confirm({ title: t('delete'), message: t('confirmDeleteAccount'), confirmLabel: t('delete'), cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      const { data } = await api.delete(`/accounting/chart-of-accounts/${account.id}`, { params: shopParams() });
      success(data.account ? t('accountDeactivated') : t('accountDeleted'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BookOpen}
        accent="brand"
        title={t('chartOfAccounts') || 'Chart of Accounts'}
        subtitle={t('chartOfAccountsSub') || 'Every account this business books transactions against'}
        action={canCreate && (
          <button type="button" onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />{t('addAccount')}
          </button>
        )}
      />

      <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
        {t('chartOfAccountsHint') || 'Accounts marked "Payment Account" can be picked wherever money moves — sales, expenses, payments. Add bank or cash fund accounts under Bank or Cash in Hand. Every other account is for bookkeeping and reporting only; post to it directly via a Manual Journal Entry.'}
      </p>

      <div className="glass-card p-4">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ left: '12px', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingInlineStart: '2.5rem' }}
            placeholder="Search account name, code, type…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <th className="text-start p-4">{t('accountCode') || 'Code'}</th>
              <th className="text-start p-4">{t('accountName') || 'Account'}</th>
              <th className="text-start p-4">{t('accountType') || 'Type'}</th>
              <th className="text-end p-4">{t('balance') || 'Balance'}</th>
              {(canUpdate || canDelete) && <th className="text-end p-4">{t('actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ account, depth }) => (
              <tr
                key={account.id}
                style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  backgroundColor: depth === 0 ? 'var(--bg-elevated)' : undefined,
                  opacity: account.is_active === false ? 0.55 : 1,
                }}
                className={depth > 0 ? 'hover:bg-white/5' : ''}
              >
                <td className="p-4 font-mono text-xs" style={{ paddingInlineStart: `${1 + depth * 1.5}rem`, color: 'var(--text-muted)' }}>
                  {account.account_code}
                </td>
                <td className={`p-4 ${depth === 0 ? 'font-bold' : ''}`} style={{ color: depth === 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  {account.account_name}
                  {account.fund_kind && (
                    <span className={`ms-2 badge ${account.fund_kind === 'cash' ? 'badge-green' : 'badge-blue'}`}>
                      {account.fund_kind === 'cash' ? (t('cash') || 'Cash') : (t('bank') || 'Bank')}
                    </span>
                  )}
                  {isPaymentAccount(account) && <span className="ms-2 text-xs uppercase text-emerald-400">· {t('paymentAccount') || 'Payment Account'}</span>}
                  {account.is_system && <span className="ms-2 text-xs uppercase" style={{ color: 'var(--text-muted)' }}>· {t('systemAccount')}</span>}
                  {account.is_active === false && <span className="ms-2 text-xs uppercase text-red-400">· {t('inactive')}</span>}
                </td>
                <td className={`p-4 text-xs uppercase ${depth === 0 ? 'font-bold' : ''} ${TYPE_COLORS[account.account_type] || ''}`}>
                  {t(account.account_type) || humanize(account.account_type)}
                </td>
                <td className={`p-4 text-end ${depth === 0 ? 'font-bold' : ''}`} style={{ color: depth === 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  {formatPKR(displayBalance(account), lang)}
                </td>
                {(canUpdate || canDelete) && (
                  <td className="p-4">
                    {!account.is_system && (
                      <div className="flex justify-end gap-2">
                        {canUpdate && (
                          <button type="button" onClick={() => openEdit(account)} className="icon-btn"><Edit className="w-4 h-4" /></button>
                        )}
                        {canDelete && (
                          <button type="button" onClick={() => handleDelete(account)} className="icon-btn text-red-400"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === 'create' ? t('addAccount') : t('editAccount')} onClose={() => setModal(null)}>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <FormLabel required>{t('accountName')}</FormLabel>
              <input className="input" required value={form.account_name} onChange={setF('account_name')} />
            </div>
            <div>
              <FormLabel required>{t('accountType')}</FormLabel>
              <select className="input" required value={form.account_type} onChange={setF('account_type')} disabled={isFundForm}>
                {ACCOUNT_TYPES.map(type => <option key={type} value={type}>{t(type) || humanize(type)}</option>)}
              </select>
            </div>
            <div>
              <FormLabel>{t('parentAccount')}</FormLabel>
              <select className="input" value={form.parent_account_id} onChange={setF('parent_account_id')} disabled={isFundEdit}>
                <option value="">{t('noParentTopLevel')}</option>
                {parentOptions.map(a => (
                  <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>
                ))}
              </select>
              {isFundCreate && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {fundKind === 'cash'
                    ? (t('fundAccountCashHint') || 'Creates a named cash fund (e.g. Petty Cash) selectable as a payment method. This is separate from the shared Cash in Hand daily balance.')
                    : (t('fundAccountBankHint') || 'Creates a bank account selectable as a payment method everywhere.')}
                </p>
              )}
            </div>
            {isFundForm && fundKind === 'bank' && (
              <>
                <div>
                  <FormLabel>{t('bank') || 'Bank'}</FormLabel>
                  <input className="input" placeholder="e.g. HBL, Meezan Bank" value={form.bank_name} onChange={setF('bank_name')} />
                </div>
                <div>
                  <FormLabel>{t('accountNumber')}</FormLabel>
                  <input className="input" value={form.account_number} onChange={setF('account_number')} />
                </div>
              </>
            )}
            {isFundCreate && (
              <div>
                <FormLabel>{t('openingBalance')}</FormLabel>
                <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={form.opening_balance} onChange={setF('opening_balance')} />
              </div>
            )}
            {/* Where an opening balance comes from decides whether capital grows.
                Without this the app booked every opening balance as fresh equity,
                so opening an account to hold money you already had counted the
                same rupees twice. */}
            {isFundCreate && parseFloat(form.opening_balance) > 0 && (
              <div>
                <FormLabel>{t('whereFrom') || 'Where Is This Money From?'}</FormLabel>
                <select className="input" value={form.funding_source} onChange={setF('funding_source')}>
                  <option value="new_capital">{t('fundingNewCapital') || 'New money coming into the business'}</option>
                  <option value="transfer">{t('fundingTransfer') || 'Moved from an existing account'}</option>
                </select>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {form.funding_source === 'transfer'
                    ? (t('fundingTransferHint') || 'Capital stays the same — the money just moves between accounts.')
                    : (t('fundingNewCapitalHint') || 'Capital increases by this amount.')}
                </p>
                {form.funding_source === 'transfer' && (
                  <div className="mt-3">
                    <FormLabel>{t('movedFrom') || 'Moved From'}</FormLabel>
                    <select className="input" required value={form.source_account_id} onChange={setF('source_account_id')}>
                      <option value="" disabled>{t('selectAccount') || 'Select account…'}</option>
                      {fundSourceOptions.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.account_name} — {formatPKR(a.balance, lang)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
            {modal === 'create' && !isFundForm && (
              <div>
                <FormLabel>{t('accountCode')}</FormLabel>
                <input className="input" value={form.account_code} onChange={setF('account_code')} />
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {t('accountCodeHint') || 'Leave blank to auto-generate.'}
                </p>
              </div>
            )}
            {modal === 'edit' && (
              <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={!!form.is_active} onChange={setF('is_active')} />
                {t('active')}
              </label>
            )}
            <label className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                className="mt-1"
                checked={!!form.is_contra}
                onChange={setF('is_contra')}
              />
              <span>
                {t('contraAccount') || 'Contra account (deduction)'}
                <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                  {t('contraAccountHint')
                    || 'Its balance is opposite to its type by design — e.g. Accumulated Depreciation. Statements print it as a positive figure under a "Less:" label instead of a negative one. Presentation only; no posted figure changes.'}
                </span>
              </span>
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
