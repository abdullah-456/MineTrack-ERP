import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import FinancialReportFilters, { buildReportFilterList } from '../../components/ui/FinancialReportFilters';
import api from '../../api/axios';

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function SectionTable({ title, rows, totalLabel, totalAmount, lang, t, accent }) {
  return (
    <div className="glass-card overflow-x-auto">
      <div className="p-4 font-bold text-sm uppercase tracking-wide" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
        {title}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.account_code}-${idx}`} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
              <td className="p-4 ps-6 font-mono text-xs w-28" style={{ color: 'var(--text-muted)' }}>{row.account_code}</td>
              <td className="p-4" style={{ color: 'var(--text-primary)' }}>{row.account_name}</td>
              <td className="p-4 text-end w-40 font-medium" style={{ color: accent }}>{formatPKR(row.amount, lang)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={3} className="p-6 text-center" style={{ color: 'var(--text-muted)' }}>{t('noEntries') || 'No entries found'}</td></tr>
          )}
          {rows.length > 0 && (
            <tr style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <td colSpan={2} className="p-4 ps-6 font-bold" style={{ color: 'var(--text-primary)' }}>{totalLabel}</td>
              <td className="p-4 text-end font-bold" style={{ color: accent }}>{formatPKR(totalAmount, lang)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function ProfitAndLoss() {
  const { t, lang } = useTheme();
  const { error } = useToast();
  const { shopParams, branches } = useShopApi();

  const [income, setIncome] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({ total_income: 0, total_expenses: 0, net_profit: 0 });
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());

  const [branchId, setBranchId] = useState('');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams(), from, to };
      if (branchId) params.branch_id = branchId;
      const { data } = await api.get('/reports/profit-and-loss', { params });
      setIncome(data.income || []);
      setExpenses(data.expenses || []);
      setSummary({
        total_income: data.total_income || 0,
        total_expenses: data.total_expenses || 0,
        net_profit: data.net_profit || 0,
      });
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, from, to, branchId, error, t]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const flatRows = useMemo(() => [
    { __section: true, account_name: t('income') || 'Income', amount: null },
    ...income,
    { __total: true, account_name: t('totalIncome') || 'Total Income', amount: summary.total_income },
    { __section: true, account_name: t('expenses') || 'Expenses', amount: null },
    ...expenses,
    { __total: true, account_name: t('totalExpenses') || 'Total Expenses', amount: summary.total_expenses },
    { __total: true, account_name: t('netProfit') || 'Net Profit', amount: summary.net_profit },
  ], [income, expenses, summary, t]);

  const reportColumns = [
    { header: t('account') || 'Account', key: 'account_name', width: 2.8 },
    { header: t('amount') || 'Amount', key: 'amount', money: true, width: 1.2 },
  ];
  const reportFilters = buildReportFilterList({ t, from, to, branchId, branches, mode: 'period' });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={TrendingUp}
        accent="brand"
        title={t('plStatement') || 'P&L Statement'}
        subtitle={t('plStatementSub') || 'Income and expenses for a period — net profit or loss'}
        action={
          <ReportActions
            title={t('plStatement') || 'P&L Statement'}
            columns={reportColumns}
            rows={flatRows.filter(r => !r.__section)}
            totals={{ __label: t('netProfit') || 'Net Profit', amount: summary.net_profit }}
            filters={reportFilters}
            filename="profit-and-loss.pdf"
          />
        }
      />

      <FinancialReportFilters
        mode="period"
        from={from}
        to={to}
        branchId={branchId}
        branches={branches}
        onFromChange={setFrom}
        onToChange={setTo}
        onBranchChange={setBranchId}
        onRefresh={fetchReport}
      />

      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card p-5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('totalIncome') || 'Total Income'}</span>
          <p className="text-xl font-bold text-emerald-400">{formatPKR(summary.total_income, lang)}</p>
        </div>
        <div className="glass-card p-5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('totalExpenses') || 'Total Expenses'}</span>
          <p className="text-xl font-bold text-red-400">{formatPKR(summary.total_expenses, lang)}</p>
        </div>
        <div className="glass-card p-5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('netProfit') || 'Net Profit'}</span>
          <p className={`text-xl font-bold ${summary.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatPKR(summary.net_profit, lang)}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="space-y-4">
          <SectionTable
            title={t('income') || 'Income'}
            rows={income}
            totalLabel={t('totalIncome') || 'Total Income'}
            totalAmount={summary.total_income}
            lang={lang}
            t={t}
            accent="rgb(52, 211, 153)"
          />
          <SectionTable
            title={t('expenses') || 'Expenses'}
            rows={expenses}
            totalLabel={t('totalExpenses') || 'Total Expenses'}
            totalAmount={summary.total_expenses}
            lang={lang}
            t={t}
            accent="rgb(248, 113, 113)"
          />
          <div className="glass-card p-5 flex items-center justify-between">
            <span className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{t('netProfit') || 'Net Profit'}</span>
            <span className={`font-bold text-xl ${summary.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatPKR(summary.net_profit, lang)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
