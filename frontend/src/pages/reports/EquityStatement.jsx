import { useState, useEffect, useCallback, useMemo } from 'react';
import { Landmark, Loader2 } from 'lucide-react';
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

const LABEL_KEYS = {
  opening: 'openingBalance',
  capital: 'capitalContributed',
  drawings: 'drawings',
  net_profit: 'netProfitForPeriod',
  closing: 'closingBalance',
};

export default function EquityStatement() {
  const { t, lang } = useTheme();
  const { error } = useToast();
  const { shopParams, branches } = useShopApi();

  const [summary, setSummary] = useState([]);
  const [detail, setDetail] = useState([]);
  const [totals, setTotals] = useState({
    opening_balance: 0, capital_contributed: 0, drawings: 0,
    net_profit: 0, closing_balance: 0,
  });
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState('');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams(), from, to };
      if (branchId) params.branch_id = branchId;
      const { data } = await api.get('/reports/equity-statement', { params });
      setSummary(data.summary || []);
      setDetail(data.detail || []);
      setTotals({
        opening_balance: data.opening_balance || 0,
        capital_contributed: data.capital_contributed || 0,
        drawings: data.drawings || 0,
        net_profit: data.net_profit || 0,
        closing_balance: data.closing_balance || 0,
      });
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, from, to, branchId, error, t]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const flatRows = useMemo(() => [
    ...summary.map(row => ({
      account_name: t(LABEL_KEYS[row.key]) || row.label,
      amount: row.amount,
      __total: row.key === 'closing' || row.key === 'opening',
    })),
    ...(detail.length ? [
      { account_name: '—', amount: null, __section: true },
      ...detail.map(r => ({
        account_code: r.account_code,
        account_name: r.account_name,
        amount: r.closing,
      })),
    ] : []),
  ], [summary, detail, t]);

  const reportColumns = [
    { header: t('account') || 'Account', key: 'account_name', width: 2.8 },
    { header: t('amount') || 'Amount', key: 'amount', money: true, width: 1.2 },
  ];
  const reportFilters = buildReportFilterList({ t, from, to, branchId, branches, mode: 'period' });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Landmark}
        accent="brand"
        title={t('equityStatement') || 'Statement of Changes in Equity'}
        subtitle={t('equityStatementSub') || 'How owner\'s equity moved during the period — opening, contributions, profit, closing'}
        action={
          <ReportActions
            title={t('equityStatement') || 'Statement of Changes in Equity'}
            columns={reportColumns}
            rows={flatRows.filter(r => !r.__section)}
            totals={{ __label: t('closingBalance') || 'Closing Balance', amount: totals.closing_balance }}
            filters={reportFilters}
            filename="equity-statement.pdf"
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('openingBalance') || 'Opening'}</span>
          <p className="text-xl font-bold text-violet-400">{formatPKR(totals.opening_balance, lang)}</p>
        </div>
        <div className="glass-card p-5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('capitalContributed') || 'Capital In'}</span>
          <p className="text-xl font-bold text-emerald-400">{formatPKR(totals.capital_contributed, lang)}</p>
        </div>
        <div className="glass-card p-5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('netProfit') || 'Net Profit'}</span>
          <p className={`text-xl font-bold ${totals.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatPKR(totals.net_profit, lang)}
          </p>
        </div>
        <div className="glass-card p-5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('closingBalance') || 'Closing'}</span>
          <p className="text-xl font-bold text-violet-400">{formatPKR(totals.closing_balance, lang)}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="space-y-4">
          <div className="glass-card overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {summary.map(row => (
                  <tr key={row.key} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                    <td className="p-4 ps-6 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {t(LABEL_KEYS[row.key]) || row.label}
                    </td>
                    <td className={`p-4 text-end w-48 font-bold ${row.amount < 0 ? 'text-red-400' : row.key === 'closing' || row.key === 'opening' ? 'text-violet-400' : 'text-emerald-400'}`}>
                      {formatPKR(row.amount, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detail.length > 0 && (
            <div className="glass-card overflow-x-auto">
              <div className="p-4 font-bold text-sm uppercase tracking-wide" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                {t('equityAccounts') || 'Equity Accounts Detail'}
              </div>
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                    <th className="text-start p-4">{t('account') || 'Account'}</th>
                    <th className="text-end p-4">{t('openingBalance') || 'Opening'}</th>
                    <th className="text-end p-4">{t('movement') || 'Movement'}</th>
                    <th className="text-end p-4">{t('closingBalance') || 'Closing'}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.map(row => (
                    <tr key={row.account_code} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                      <td className="p-4">
                        <span className="font-mono text-xs me-2" style={{ color: 'var(--text-muted)' }}>{row.account_code}</span>
                        {row.account_name}
                      </td>
                      <td className="p-4 text-end">{formatPKR(row.opening, lang)}</td>
                      <td className={`p-4 text-end ${row.movement >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatPKR(row.movement, lang)}</td>
                      <td className="p-4 text-end font-semibold">{formatPKR(row.closing, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
