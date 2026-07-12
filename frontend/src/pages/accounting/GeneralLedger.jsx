import { useState, useEffect, useCallback } from 'react';
import { Landmark, Loader2, RefreshCw } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import api from '../../api/axios';

export default function GeneralLedger() {
  const { t, lang } = useTheme();
  const { error } = useToast();
  const { shopParams } = useShopApi();

  const [accounts, setAccounts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const fetchAccounts = useCallback(async () => {
    try {
      const { data } = await api.get('/accounting/chart-of-accounts', { params: shopParams() });
      setAccounts(data.accounts || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    }
  }, [shopParams, error, t]);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams() };
      if (accountId) params.account_id = accountId;
      if (from) params.from = from;
      if (to) params.to = to;
      const { data } = await api.get('/accounting/general-ledger', { params });
      setEntries(data.entries || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, accountId, from, to, error, t]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);
  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Landmark}
        accent="brand"
        title={t('generalLedger') || 'General Ledger'}
        subtitle={t('generalLedgerSub') || 'Every posted transaction across the whole business'}
      />

      <div className="glass-card p-4 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{t('account') || 'Account'}</span>
          <select className="input max-w-xs" value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="">{t('allAccounts') || 'All Accounts'}</option>
            {accounts.filter(a => a.parent_account_id).map(a => (
              <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>
            ))}
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
        <button onClick={fetchEntries} className="btn-secondary flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />{t('refresh') || 'Refresh'}
        </button>
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
                <th className="text-start p-4">{t('narration') || 'Narration'}</th>
                <th className="text-end p-4">{t('debit') || 'Debit'}</th>
                <th className="text-end p-4">{t('credit') || 'Credit'}</th>
                <th className="text-end p-4">{t('runningBalance') || 'Running Balance'}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(e.date).toLocaleDateString('en-PK')}</td>
                  <td className="p-4 text-xs font-mono text-brand-400">{e.voucher_number}</td>
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{e.account_name}</td>
                  <td className="p-4 text-xs" style={{ color: 'var(--text-muted)' }}>{e.narration}</td>
                  <td className="p-4 text-end text-emerald-400">{e.debit > 0 ? formatPKR(e.debit, lang) : '—'}</td>
                  <td className="p-4 text-end text-red-400">{e.credit > 0 ? formatPKR(e.credit, lang) : '—'}</td>
                  <td className="p-4 text-end font-bold" style={{ color: 'var(--text-primary)' }}>{formatPKR(e.running_balance, lang)}</td>
                </tr>
              ))}
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
