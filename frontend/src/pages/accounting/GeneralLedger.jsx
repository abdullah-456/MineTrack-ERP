import { useState, useEffect, useCallback, useMemo } from 'react';
import { Landmark, Loader2, RefreshCw, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import { useFiscalYear } from '../../context/FiscalYearContext';
import { useHighlightRow } from '../../hooks/useHighlightRow';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import { formatVoucherNumber } from '../../utils/ledgerFormat';
import api from '../../api/axios';

const FILTER_TYPES = [
  { value: '', labelKey: 'allEntries' },
  { value: 'account', labelKey: 'account' },
  { value: 'customer', labelKey: 'customer' },
  { value: 'supplier', labelKey: 'supplier' },
  { value: 'employee', labelKey: 'employee' },
  { value: 'board_member', labelKey: 'boardMember' },
];

// Only the closing row of a voucher carries a balance, so an absent value means
// "not this row" and prints as a dash. A balance that really is zero must still
// print as zero — formatPKR dashes those out, which would read as missing data.
function formatBalance(value, lang) {
  if (value === undefined || value === null) return '—';
  const n = parseFloat(value);
  if (isNaN(n)) return '—';
  return `Rs. ${n.toLocaleString(lang === 'ur' ? 'ur-PK' : 'en-PK', { maximumFractionDigits: 0 })}`;
}

export default function GeneralLedger() {
  const { t, lang } = useTheme();
  const { error } = useToast();
  const { shopParams, branches } = useShopApi();
  const { listParams } = useFiscalYear();
  const { isHighlighted } = useHighlightRow();

  const [accounts, setAccounts] = useState([]);
  const [entityOptions, setEntityOptions] = useState({ customers: [], suppliers: [], employees: [], board_members: [], branches: [] });
  const [entries, setEntries] = useState([]);
  // 'account' → per-account running balance; 'capital' → the shop's cash + bank
  // total after each transaction, which is what a mixed-account view can show.
  const [balanceMode, setBalanceMode] = useState('capital');
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [accountId, setAccountId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [entityId, setEntityId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');

  const fetchAccounts = useCallback(async () => {
    try {
      const { data } = await api.get('/accounting/chart-of-accounts', { params: shopParams() });
      setAccounts(data.accounts || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    }
  }, [shopParams, error, t]);

  const fetchEntityOptions = useCallback(async () => {
    try {
      const { data } = await api.get('/accounting/general-ledger/filter-options', { params: shopParams() });
      setEntityOptions(data);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    }
  }, [shopParams, error, t]);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams(), ...listParams };
      if (filterType === 'account' && accountId) params.account_id = accountId;
      if (['customer', 'supplier', 'employee', 'board_member'].includes(filterType)) {
        params.entity_type = filterType;
        if (entityId) params.entity_id = entityId;
      }
      if (from) params.from = from;
      if (to) params.to = to;
      if (branchId) params.branch_id = branchId;
      const { data } = await api.get('/accounting/general-ledger', { params });
      setEntries(data.entries || []);
      setBalanceMode(data.balance_mode || 'capital');
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, listParams, filterType, accountId, entityId, branchId, from, to, error, t]);

  useEffect(() => { fetchAccounts(); fetchEntityOptions(); }, [fetchAccounts, fetchEntityOptions]);
  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const personOptions = useMemo(() => {
    if (filterType === 'customer') return entityOptions.customers || [];
    if (filterType === 'supplier') return entityOptions.suppliers || [];
    if (filterType === 'employee') return entityOptions.employees || [];
    if (filterType === 'board_member') return entityOptions.board_members || [];
    return [];
  }, [filterType, entityOptions]);

  const selectedPersonLabel = useMemo(() => {
    if (!entityId) return null;
    return personOptions.find(p => String(p.id) === String(entityId))?.name;
  }, [entityId, personOptions]);

  const handleFilterTypeChange = (value) => {
    setFilterType(value);
    setAccountId('');
    setEntityId('');
  };

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

  const filterTypeLabel = FILTER_TYPES.find(f => f.value === filterType)?.labelKey;

  const balanceHeader = balanceMode === 'account'
    ? (t('runningBalance') || 'Running Balance')
    : (t('capitalBalance') || 'Capital (Cash + Bank)');

  const reportColumns = [
    { header: t('date') || 'Date', render: e => new Date(e.date).toLocaleDateString('en-PK'), width: 1.1 },
    { header: t('voucherNo') || 'Voucher #', render: e => formatVoucherNumber(e.voucher_number), width: 1.1 },
    { header: t('account') || 'Account', key: 'account_name', width: 1.6 },
    { header: t('description') || 'Description', key: 'narration', width: 2.4 },
    { header: t('debit') || 'Debit', key: 'debit', money: true, width: 1.1 },
    { header: t('credit') || 'Credit', key: 'credit', money: true, width: 1.1 },
    { header: balanceHeader, key: 'running_balance', money: true, width: 1.2 },
  ];
  const reportTotals = { __label: t('total') || 'Total', debit: totalDebit, credit: totalCredit };
  const reportFilterList = [
    filterType ? { label: t('filterBy') || 'Filter by', value: t(filterTypeLabel) || filterTypeLabel } : null,
    filterType === 'account' && accountId
      ? { label: t('account') || 'Account', value: accounts.find(a => String(a.id) === String(accountId))?.account_name || accountId }
      : null,
    ['customer', 'supplier', 'employee', 'board_member'].includes(filterType)
      ? { label: t(filterTypeLabel) || filterType, value: selectedPersonLabel || (t('all') || 'All') }
      : null,
    from ? { label: t('from') || 'From', value: from } : null,
    to ? { label: t('to') || 'To', value: to } : null,
    branchId ? { label: t('branch') || 'Branch', value: (entityOptions.branches?.length ? entityOptions.branches : branches).find(b => String(b.id) === String(branchId))?.name || branchId } : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Landmark}
        accent="brand"
        title={t('generalLedger') || 'General Ledger'}
        subtitle={t('generalLedgerSub') || 'Every posted transaction across the whole business'}
        action={
          <ReportActions
            title={t('generalLedger') || 'General Ledger'}
            columns={reportColumns}
            rows={entries}
            totals={reportTotals}
            filters={reportFilterList}
            filename="general-ledger.pdf"
            groupKey="voucher_number"
          />
        }
      />

      <div className="glass-card p-4 space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ left: '12px', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingInlineStart: '2.5rem' }}
            placeholder="Search narration, account name, voucher #…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{t('filterBy') || 'Filter by'}</span>
          <select className="input max-w-xs" value={filterType} onChange={e => handleFilterTypeChange(e.target.value)}>
            {FILTER_TYPES.map(f => (
              <option key={f.value || 'all'} value={f.value}>{t(f.labelKey) || f.labelKey}</option>
            ))}
          </select>
        </div>

        {filterType === 'account' && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{t('account') || 'Account'}</span>
            <select className="input max-w-xs" value={accountId} onChange={e => setAccountId(e.target.value)}>
              <option value="">{t('allAccounts') || 'All Accounts'}</option>
              {accounts.filter(a => a.parent_account_id).map(a => (
                <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>
              ))}
            </select>
          </div>
        )}

        {['customer', 'supplier', 'employee', 'board_member'].includes(filterType) && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
              {t(filterTypeLabel) || filterType}
            </span>
            <select className="input max-w-xs" value={entityId} onChange={e => setEntityId(e.target.value)}>
              <option value="">{t('all') || 'All'} {t(filterTypeLabel) || filterType}</option>
              {personOptions.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {(branches.length > 1 || (entityOptions.branches || []).length > 1) && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{t('branch') || 'Branch'}</span>
            <select className="input max-w-xs" value={branchId} onChange={e => setBranchId(e.target.value)}>
              <option value="">{t('allBranches') || 'All branches'}</option>
              {(entityOptions.branches?.length ? entityOptions.branches : branches).map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{t('from') || 'From'}</span>
          <input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{t('to') || 'To'}</span>
          <input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <button onClick={fetchEntries} className="btn-secondary flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />{t('refresh') || 'Refresh'}
        </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('totalDebit') || 'Total Debit'}</span>
          <p className="text-xl font-bold text-emerald-400">{formatPKR(totalDebit, lang)}</p>
        </div>
        <div className="glass-card p-5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('totalCredit') || 'Total Credit'}</span>
          <p className="text-xl font-bold text-red-400">{formatPKR(totalCredit, lang)}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('date') || 'Date'}</th>
                <th className="text-start p-4">{t('voucherNo') || 'Voucher #'}</th>
                <th className="text-start p-4">{t('account') || 'Account'}</th>
                <th className="text-start p-4">{t('description') || 'Description'}</th>
                <th className="text-end p-4">{t('debit') || 'Debit'}</th>
                <th className="text-end p-4">{t('credit') || 'Credit'}</th>
                <th className="text-end p-4">{balanceHeader}</th>
              </tr>
            </thead>
            <tbody>
              {entries
                .filter(e => !search.trim() || [
                  e.narration, e.account_name, e.voucher_number, e.entity_name,
                  String(e.debit), String(e.credit),
                  e.running_balance === undefined || e.running_balance === null ? '' : String(e.running_balance),
                  e.date ? new Date(e.date).toLocaleDateString('en-PK') : ''
                ].some(v => (v || '').toLowerCase().includes(search.trim().toLowerCase())))
                .map((e, idx, arr) => {
                const nextEntry = arr[idx + 1];
                const showBorder = !nextEntry || nextEntry.voucher_number !== e.voucher_number;
                return (
                  <tr
                    key={e.id}
                    id={`row-${e.id}`}
                    style={{ borderBottom: showBorder ? '1px solid var(--border-subtle)' : 'none' }}
                    className={`${isHighlighted(e.id) || isHighlighted(e.voucher_id) ? 'highlight-row' : 'hover:bg-white/10'} cursor-pointer transition-colors`}
                    title={t('viewVoucher') || 'View Voucher'}
                    onClick={() => {
                      if (e.voucher_id) {
                        window.open(`/vouchers/${e.voucher_id}`, '_blank', 'noopener,noreferrer');
                      }
                    }}
                  >
                    <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(e.date).toLocaleDateString('en-PK')}</td>
                    <td className="p-4 text-xs font-mono text-brand-400">{formatVoucherNumber(e.voucher_number)}</td>
                    <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{e.account_name}</td>
                    <td className="p-4 text-xs" style={{ color: 'var(--text-muted)' }}>{e.narration}</td>
                    <td className="p-4 text-end text-emerald-400">{e.debit > 0 ? formatPKR(e.debit, lang) : '—'}</td>
                    <td className="p-4 text-end text-red-400">{e.credit > 0 ? formatPKR(e.credit, lang) : '—'}</td>
                    {/* Blank on the opening leg of a transaction — the figure lands
                        on the closing leg, once per voucher. */}
                    <td className="p-4 text-end font-bold" style={{ color: 'var(--text-primary)' }}>
                      {formatBalance(e.running_balance, lang)}
                    </td>
                  </tr>
                );
              })}
              {entries.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noEntries') || 'No entries found'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
