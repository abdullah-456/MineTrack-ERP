import { useState, useEffect, useCallback, useMemo } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import FinancialReportFilters, { buildReportFilterList, buildStatementSubtitle } from '../../components/ui/FinancialReportFilters';
import api from '../../api/axios';
import { useFiscalYear } from '../../context/FiscalYearContext';
import { contraLabel, isContraRow } from '../../utils/reportExport';

// Contra accounts (Accumulated Depreciation and friends) are deductions by
// design, not abnormal balances. Labelling them "Less: …" lets the figure print
// positive without misleading anyone — the stored value stays negative, so every
// total still subtracts it. Applied once here so the screen and every export
// show the same thing.
const withContraLabels = (rows = []) => rows.map(r => (
  isContraRow(r) ? { ...r, account_name: contraLabel(r.account_name) } : r
));

function SectionTable({ title, rows, totalLabel, totalAmount, lang, t }) {
  return (
    <div className="glass-card overflow-x-auto">
      <div className="p-4 font-bold text-sm uppercase tracking-wide" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
        {title}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.account_code || 'row'}-${idx}`} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
              <td className="p-4 ps-6 font-mono text-xs w-28" style={{ color: 'var(--text-muted)' }}>{row.account_code || '—'}</td>
              <td className="p-4" style={{ color: row.is_computed ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                {row.account_name}
                {row.is_computed && <span className="ms-2 text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>({t('computed') || 'computed'})</span>}
              </td>
              <td className="p-4 text-end w-40 font-medium" style={{ color: 'var(--text-primary)' }}>
                {formatPKR(isContraRow(row) ? Math.abs(row.amount) : row.amount, lang)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={3} className="p-6 text-center" style={{ color: 'var(--text-muted)' }}>{t('noEntries') || 'No entries found'}</td></tr>
          )}
          {rows.length > 0 && (
            <tr style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <td colSpan={2} className="p-4 ps-6 font-bold" style={{ color: 'var(--text-primary)' }}>{totalLabel}</td>
              <td className="p-4 text-end font-bold" style={{ color: 'var(--text-primary)' }}>{formatPKR(totalAmount, lang)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function BalanceSheet() {
  const { t, lang } = useTheme();
  const { error } = useToast();
  const { shopParams, branches } = useShopApi();
  const { reportDates } = useFiscalYear();

  const [assets, setAssets] = useState([]);
  const [liabilities, setLiabilities] = useState([]);
  const [equity, setEquity] = useState([]);
  const [unattachedAssets, setUnattachedAssets] = useState([]);
  const [totalUnattachedAssets, setTotalUnattachedAssets] = useState(0);
  const [summary, setSummary] = useState({
    total_assets: 0, total_liabilities: 0, total_equity: 0,
    total_liabilities_and_equity: 0, is_balanced: true,
  });
  const [loading, setLoading] = useState(true);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));

  const [branchId, setBranchId] = useState('');
  // Follow the fiscal year picked in the top bar. reportDates states the rule
  // once for every report: a past year reports as at its own year end, the
  // current one as at today. The input stays editable.
  useEffect(() => {
    if (reportDates.asOf) setAsOf(reportDates.asOf);
  }, [reportDates.asOf]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams(), as_of: asOf };
      if (branchId) params.branch_id = branchId;
      const { data } = await api.get('/reports/balance-sheet', { params });
      setAssets(withContraLabels(data.assets));
      setLiabilities(withContraLabels(data.liabilities));
      setEquity(withContraLabels(data.equity));
      setUnattachedAssets(data.unattached_assets || []);
      setTotalUnattachedAssets(data.total_unattached_assets || 0);
      setSummary({
        total_assets: data.total_assets || 0,
        total_liabilities: data.total_liabilities || 0,
        total_equity: data.total_equity || 0,
        total_liabilities_and_equity: data.total_liabilities_and_equity || 0,
        is_balanced: data.is_balanced !== false,
      });
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, asOf, branchId, error, t]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const unattachedRows = useMemo(() => unattachedAssets.map(a => ({
    account_code: '',
    account_name: `${a.asset_name} (${t('withoutAccountAttachment') || 'without any account attachment'})`,
    amount: a.amount,
    is_computed: true,
  })), [unattachedAssets, t]);

  // The exported statement, structured the way a published balance sheet is:
  // section headings, indented line items, a ruled subtotal per section, and a
  // grand total that proves the sheet balances. The export engine reads the
  // __section/__total/__grand/__level tags and renders each accordingly, so PDF,
  // print and Excel all get the same structure rather than a flat list of rows.
  const statementRows = useMemo(() => {
    const section = (heading, rows, totalLabel, totalAmount) => [
      { __section: true, account_name: heading },
      ...rows.map(r => ({ ...r, __level: 1 })),
      ...(rows.length ? [] : [{ account_name: t('noEntries') || 'No entries', __level: 1 }]),
      { __total: true, __level: 1, account_name: totalLabel, amount: totalAmount },
      { __spacer: true },
    ];

    return [
      ...section(t('assets') || 'Assets', assets, t('totalAssets') || 'Total Assets', summary.total_assets),
      ...section(t('liabilities') || 'Liabilities', liabilities, t('totalLiabilities') || 'Total Liabilities', summary.total_liabilities),
      ...section(t('equity') || 'Equity', equity, t('totalEquity') || 'Total Equity', summary.total_equity),
      {
        __grand: true,
        account_name: t('totalLiabilitiesAndEquity') || 'Total Liabilities & Equity',
        amount: summary.total_liabilities_and_equity,
      },
      // Assets bought outside any bank/cash account have no journal entry, so
      // they sit below the balancing grand total, clearly marked as memoranda —
      // never folded into a figure the sheet claims to balance.
      ...(unattachedRows.length > 0 ? [
        { __spacer: true },
        ...section(
          t('fixedAssetsWithoutAccountAttachment') || 'Memorandum — Fixed Assets Without Account Attachment',
          unattachedRows,
          t('totalUnattachedAssets') || 'Total (without any account attachment)',
          totalUnattachedAssets,
        ),
      ] : []),
    ];
  }, [assets, liabilities, equity, summary, unattachedRows, totalUnattachedAssets, t]);

  const reportColumns = [
    { header: t('accountCode') || 'Code', key: 'account_code', width: 0.8, excelWidth: 12 },
    { header: t('account') || 'Account', key: 'account_name', width: 3.2, excelWidth: 46 },
    { header: t('amount') || 'Amount', key: 'amount', money: true, width: 1.3, excelWidth: 20 },
  ];
  const reportFilters = buildReportFilterList({ t, asOf, branchId, branches, mode: 'point', dates: false });
  const reportSubtitle = buildStatementSubtitle({ mode: 'point', asOf });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BookOpen}
        accent="brand"
        title={t('balanceSheet') || 'Balance Sheet'}
        subtitle={t('balanceSheetSub') || 'Assets, liabilities, and equity at a point in time'}
        action={
          <ReportActions
            title={t('balanceSheet') || 'Balance Sheet'}
            subtitle={reportSubtitle}
            columns={reportColumns}
            rows={statementRows}
            filters={reportFilters}
            filename="balance-sheet.pdf"
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
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('totalAssets') || 'Total Assets'}</span>
          <p className="text-xl font-bold text-blue-400">{formatPKR(summary.total_assets, lang)}</p>
        </div>
        <div className="glass-card p-5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('totalLiabilitiesAndEquity') || 'Total Liabilities & Equity'}</span>
          <p className="text-xl font-bold text-violet-400">{formatPKR(summary.total_liabilities_and_equity, lang)}</p>
        </div>
      </div>

      {!summary.is_balanced && (
        <div className="glass-card p-4 border border-amber-500/40 text-amber-300 text-sm">
          {t('balanceSheetWarning') || 'Warning: assets do not equal liabilities plus equity. Review recent vouchers.'}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="space-y-4">
          <SectionTable
            title={t('assets') || 'Assets'}
            rows={assets}
            totalLabel={t('totalAssets') || 'Total Assets'}
            totalAmount={summary.total_assets}
            lang={lang}
            t={t}
          />
          <SectionTable
            title={t('liabilities') || 'Liabilities'}
            rows={liabilities}
            totalLabel={t('totalLiabilities') || 'Total Liabilities'}
            totalAmount={summary.total_liabilities}
            lang={lang}
            t={t}
          />
          <SectionTable
            title={t('equity') || 'Equity'}
            rows={equity}
            totalLabel={t('totalEquity') || 'Total Equity'}
            totalAmount={summary.total_equity}
            lang={lang}
            t={t}
          />
          {unattachedRows.length > 0 && (
            <>
              <SectionTable
                title={t('fixedAssetsWithoutAccountAttachment') || 'Fixed Assets (without any account attachment)'}
                rows={unattachedRows}
                totalLabel={t('totalUnattachedAssets') || 'Total (without any account attachment)'}
                totalAmount={totalUnattachedAssets}
                lang={lang}
                t={t}
              />
              <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
                {t('unattachedAssetsHint') || 'These assets were not paid for through any bank/cash account, so no journal entry exists for them. Shown here for reference only — not included in Total Assets.'}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
