import { useState, useEffect, useCallback, Fragment } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import api from '../../api/axios';

// Liability/equity/income accounts are credit-normal — the raw ledger stores
// debit-minus-credit, so flip the sign for those types to show a natural,
// non-confusing positive figure (e.g. "amount owed" instead of "-amount owed").
const CREDIT_NORMAL = new Set(['liability', 'equity', 'income']);
const displayBalance = (account) => (CREDIT_NORMAL.has(account.account_type) ? -account.balance : account.balance);

const TYPE_COLORS = {
  asset: 'text-blue-400', liability: 'text-red-400', equity: 'text-violet-400',
  income: 'text-emerald-400', expense: 'text-amber-400',
};

export default function ChartOfAccounts() {
  const { t, lang } = useTheme();
  const { error } = useToast();
  const { shopParams } = useShopApi();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const topLevel = accounts.filter(a => !a.parent_account_id);
  const childrenOf = (id) => accounts.filter(a => a.parent_account_id === id);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BookOpen}
        accent="brand"
        title={t('chartOfAccounts') || 'Chart of Accounts'}
        subtitle={t('chartOfAccountsSub') || 'Every account this business books transactions against'}
      />

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <th className="text-start p-4">{t('accountCode') || 'Code'}</th>
              <th className="text-start p-4">{t('accountName') || 'Account'}</th>
              <th className="text-start p-4">{t('accountType') || 'Type'}</th>
              <th className="text-end p-4">{t('balance') || 'Balance'}</th>
            </tr>
          </thead>
          <tbody>
            {topLevel.map(top => (
              <Fragment key={top.id}>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }} className="bg-white/5">
                  <td className="p-4 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{top.account_code}</td>
                  <td className="p-4 font-bold" style={{ color: 'var(--text-primary)' }}>{top.account_name}</td>
                  <td className={`p-4 text-xs uppercase font-bold ${TYPE_COLORS[top.account_type] || ''}`}>{top.account_type}</td>
                  <td className="p-4 text-end font-bold" style={{ color: 'var(--text-primary)' }}>{formatPKR(displayBalance(top), lang)}</td>
                </tr>
                {childrenOf(top.id).map(child => (
                  <tr key={`child-${child.id}`} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                    <td className="p-4 ps-8 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{child.account_code}</td>
                    <td className="p-4 ps-8" style={{ color: 'var(--text-secondary)' }}>{child.account_name}</td>
                    <td className={`p-4 text-xs uppercase ${TYPE_COLORS[child.account_type] || ''}`}>{child.account_type}</td>
                    <td className="p-4 text-end" style={{ color: 'var(--text-secondary)' }}>{formatPKR(displayBalance(child), lang)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
