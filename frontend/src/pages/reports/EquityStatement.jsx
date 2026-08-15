import { useState, useEffect, useCallback } from 'react';
import { Landmark, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import FinancialReportFilters, { buildReportFilterList, buildStatementSubtitle } from '../../components/ui/FinancialReportFilters';
import api from '../../api/axios';
import { useFiscalYear } from '../../context/FiscalYearContext';
import { contraLabel, isContraRow } from '../../utils/reportExport';

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
  opening_balance_equity: 'openingBalancesRecorded',
  net_profit: 'netProfitForPeriod',
  closing: 'closingBalance',
};

// t(undefined) doesn't fail — it falls back to "humanize the key", which turns
// a missing mapping into the literal word "Undefined" on the page. The backend
// summary can carry keys this map doesn't know about yet (it grew one — see
// opening_balance_equity above), so resolve defensively: only call t() when a
// mapping actually exists, otherwise use the label the backend already sent.
const summaryLabel = (t, row) => (LABEL_KEYS[row.key] ? t(LABEL_KEYS[row.key]) || row.label : row.label);

export default function EquityStatement() {
  const { t, lang } = useTheme();
  const { error } = useToast();
  const { shopParams, branches } = useShopApi();
  const { reportDates } = useFiscalYear();

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
  // Follow the fiscal year picked in the top bar. reportDates states the rule
  // once for every report: the period spans the selected year, ending today when
  // that year is still running. The inputs stay editable.
  useEffect(() => {
    if (reportDates.from && reportDates.to) {
      setFrom(reportDates.from);
      setTo(reportDates.to);
    }
  }, [reportDates.from, reportDates.to]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams(), from, to };
      if (branchId) params.branch_id = branchId;
      const { data } = await api.get('/reports/equity-statement', { params });
      setSummary(data.summary || []);
      // Contra equity accounts (Drawings, Treasury Stock) are deductions by
      // design — labelled "Less: …" so their figures can print positive without
      // misleading anyone. Same treatment the balance sheet gives them.
      setDetail((data.detail || []).map(r => (
        isContraRow(r) ? { ...r, account_name: contraLabel(r.account_name) } : r
      )));
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

  const reportFilters = buildReportFilterList({ t, from, to, branchId, branches, mode: 'period', dates: false });
  const reportSubtitle = buildStatementSubtitle({ mode: 'period', from, to });

  // Exported as a two-table document rather than one flat list. The movement
  // statement and the per-account detail have genuinely different shapes — the
  // detail carries opening/movement/closing — and squashing both into a single
  // Account|Amount table (which is what this used to do) silently dropped two
  // of the detail's three figures.
  const getReport = useCallback(() => {
    const movementRows = summary.map(row => ({
      account_name: summaryLabel(t, row),
      amount: row.amount,
      __level: row.key === 'opening' || row.key === 'closing' ? 0 : 1,
      __grand: row.key === 'closing',
      // Net profit for the period is a bottom-line RESULT — the exact figure
      // the P&L statement shows as its own grand total — not an account's
      // balance. It must print the same way here: signed when negative
      // ("-Rs. 119,604"), not bracketed as if the balance itself were abnormal.
      __signed: row.key === 'net_profit',
    }));

    const tables = [{
      heading: t('equityMovement') || 'Movement in Equity',
      columns: [
        { header: t('description') || 'Description', key: 'account_name', width: 3.4, excelWidth: 52 },
        { header: t('amount') || 'Amount', key: 'amount', money: true, width: 1.3, excelWidth: 20 },
      ],
      rows: movementRows,
    }];

    if (detail.length) {
      tables.push({
        heading: t('equityAccounts') || 'Equity Accounts Detail',
        columns: [
          { header: t('accountCode') || 'Code', key: 'account_code', width: 0.9, excelWidth: 12 },
          { header: t('account') || 'Account', key: 'account_name', width: 2.4, excelWidth: 38 },
          { header: t('openingBalance') || 'Opening', key: 'opening', money: true, width: 1.2, excelWidth: 18 },
          { header: t('movement') || 'Movement', key: 'movement', money: true, width: 1.2, excelWidth: 18 },
          { header: t('closingBalance') || 'Closing', key: 'closing', money: true, width: 1.2, excelWidth: 18 },
        ],
        rows: detail,
        totals: {
          __label: t('total') || 'Total',
          opening: detail.reduce((s, r) => s + (parseFloat(r.opening) || 0), 0),
          movement: detail.reduce((s, r) => s + (parseFloat(r.movement) || 0), 0),
          closing: detail.reduce((s, r) => s + (parseFloat(r.closing) || 0), 0),
        },
      });
    }

    return {
      kind: 'document',
      title: t('equityStatement') || 'Statement of Changes in Equity',
      subtitle: reportSubtitle,
      filters: reportFilters,
      tables,
      filename: 'equity-statement.pdf',
    };
  }, [summary, detail, t, reportSubtitle, reportFilters]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Landmark}
        accent="brand"
        title={t('equityStatement') || 'Statement of Changes in Equity'}
        subtitle={t('equityStatementSub') || 'How owner\'s equity moved during the period — opening, contributions, profit, closing'}
        action={
          <ReportActions getReport={getReport} />
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
                      {summaryLabel(t, row)}
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
