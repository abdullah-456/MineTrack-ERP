import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileBarChart2, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import FinancialReportFilters, { buildReportFilterList } from '../../components/ui/FinancialReportFilters';
import api from '../../api/axios';
import { useFiscalYear } from '../../context/FiscalYearContext';

const TYPE_COLORS = {
  asset: 'text-blue-400', liability: 'text-red-400', equity: 'text-violet-400',
  income: 'text-emerald-400', expense: 'text-amber-400',
};

export default function TrialBalance() {
  const { t, lang } = useTheme();
  const { error } = useToast();
  const { shopParams, branches } = useShopApi();
  const { reportDates, fiscalYears, setViewFY } = useFiscalYear();
  const [searchParams] = useSearchParams();

  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({ total_debit: 0, total_credit: 0, is_balanced: true });
  const [loading, setLoading] = useState(true);
  const [asOf, setAsOf] = useState(reportDates.asOf);

  // The Fiscal Years admin page links here with ?fiscal_year_id=X. That param
  // used to be read by nothing — the page just showed whatever year the top-bar
  // dropdown happened to be on, so opening this link only worked if you'd also
  // switched the dropdown by hand. Applying it to the SAME shared viewFY state
  // the dropdown uses keeps one source of truth and makes the dropdown reflect
  // the link's year too, rather than adding a second, independent date path.
  useEffect(() => {
    const fyId = searchParams.get('fiscal_year_id');
    if (!fyId || !fiscalYears.length) return;
    const target = fiscalYears.find(fy => String(fy.id) === fyId);
    if (target) setViewFY(target);
  }, [searchParams, fiscalYears, setViewFY]);

  // Follow the fiscal year picked in the top bar. reportDates states the rule
  // once for every report: a past year reports as at its own year end, the
  // current one as at today. The input stays editable.
  useEffect(() => {
    if (reportDates.asOf) setAsOf(reportDates.asOf);
  }, [reportDates.asOf]);

  const [branchId, setBranchId] = useState('');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams(), as_of: asOf };
      if (branchId) params.branch_id = branchId;
      const { data } = await api.get('/reports/trial-balance', { params });
      setRows(data.rows || []);
      setTotals({
        total_debit: data.total_debit || 0,
        total_credit: data.total_credit || 0,
        is_balanced: data.is_balanced !== false,
      });
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, asOf, branchId, error, t]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const reportColumns = [
    { header: t('accountCode') || 'Code', key: 'account_code', width: 1.1 },
    { header: t('account') || 'Account', key: 'account_name', width: 2.2 },
    { header: t('accountType') || 'Type', key: 'account_type', width: 1 },
    { header: t('debit') || 'Debit', key: 'debit', money: true, width: 1.2 },
    { header: t('credit') || 'Credit', key: 'credit', money: true, width: 1.2 },
  ];
  const reportTotals = {
    __label: t('total') || 'Total',
    debit: totals.total_debit,
    credit: totals.total_credit,
  };
  const reportFilters = buildReportFilterList({ t, asOf, branchId, branches, mode: 'point' });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileBarChart2}
        accent="brand"
        title={t('trialBalance') || 'Trial Balance'}
        subtitle={t('trialBalanceSub') || 'Debit and credit totals for every account — must balance'}
        action={
          <ReportActions
            title={t('trialBalance') || 'Trial Balance'}
            columns={reportColumns}
            rows={rows}
            totals={reportTotals}
            filters={reportFilters}
            filename="trial-balance.pdf"
          />
        }
      />

      <FinancialReportFilters
        mode="point"
        asOf={asOf}
        branchId={branchId}
        branches={branches}
        onAsOfChange={setAsOf}
        onBranchChange={setBranchId}
        onRefresh={fetchReport}
      />

      <div className="grid grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('totalDebit') || 'Total Debit'}</span>
          <p className="text-xl font-bold text-emerald-400">{formatPKR(totals.total_debit, lang)}</p>
        </div>
        <div className="glass-card p-5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('totalCredit') || 'Total Credit'}</span>
          <p className="text-xl font-bold text-red-400">{formatPKR(totals.total_credit, lang)}</p>
        </div>
      </div>

      {!totals.is_balanced && (
        <div className="glass-card p-4 border border-amber-500/40 text-amber-300 text-sm">
          {t('trialBalanceWarning') || 'Warning: total debits and credits do not match. Review recent vouchers.'}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('accountCode') || 'Code'}</th>
                <th className="text-start p-4">{t('account') || 'Account'}</th>
                <th className="text-start p-4">{t('accountType') || 'Type'}</th>
                <th className="text-end p-4">{t('debit') || 'Debit'}</th>
                <th className="text-end p-4">{t('credit') || 'Credit'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={`${row.account_code}-${idx}`} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{row.account_code}</td>
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{row.account_name}</td>
                  <td className={`p-4 text-xs uppercase ${TYPE_COLORS[row.account_type] || ''}`}>{row.account_type}</td>
                  <td className="p-4 text-end text-emerald-400">{row.debit > 0 ? formatPKR(row.debit, lang) : '—'}</td>
                  <td className="p-4 text-end text-red-400">{row.credit > 0 ? formatPKR(row.credit, lang) : '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noEntries') || 'No entries found'}</td></tr>
              )}
              {rows.length > 0 && (
                <tr style={{ borderTop: '2px solid var(--border-subtle)', backgroundColor: 'var(--bg-elevated)' }}>
                  <td colSpan={3} className="p-4 font-bold" style={{ color: 'var(--text-primary)' }}>{t('total') || 'Total'}</td>
                  <td className="p-4 text-end font-bold text-emerald-400">{formatPKR(totals.total_debit, lang)}</td>
                  <td className="p-4 text-end font-bold text-red-400">{formatPKR(totals.total_credit, lang)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
