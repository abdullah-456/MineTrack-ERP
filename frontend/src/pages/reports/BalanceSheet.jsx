import { useState, useEffect, useCallback, useMemo } from 'react';
import { BookOpen, Loader2, RefreshCw } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import api from '../../api/axios';

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
              <td className="p-4 text-end w-40 font-medium" style={{ color: 'var(--text-primary)' }}>{formatPKR(row.amount, lang)}</td>
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
  const { shopParams } = useShopApi();

  const [assets, setAssets] = useState([]);
  const [liabilities, setLiabilities] = useState([]);
  const [equity, setEquity] = useState([]);
  const [summary, setSummary] = useState({
    total_assets: 0, total_liabilities: 0, total_equity: 0,
    total_liabilities_and_equity: 0, is_balanced: true,
  });
  const [loading, setLoading] = useState(true);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/reports/balance-sheet', { params: { ...shopParams(), as_of: asOf } });
      setAssets(data.assets || []);
      setLiabilities(data.liabilities || []);
      setEquity(data.equity || []);
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
  }, [shopParams, asOf, error, t]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const flatRows = useMemo(() => [
    ...assets.map(r => ({ ...r, section: 'Assets' })),
    { account_name: t('totalAssets') || 'Total Assets', amount: summary.total_assets, __total: true },
    ...liabilities.map(r => ({ ...r, section: 'Liabilities' })),
    { account_name: t('totalLiabilities') || 'Total Liabilities', amount: summary.total_liabilities, __total: true },
    ...equity.map(r => ({ ...r, section: 'Equity' })),
    { account_name: t('totalEquity') || 'Total Equity', amount: summary.total_equity, __total: true },
  ], [assets, liabilities, equity, summary, t]);

  const reportColumns = [
    { header: t('account') || 'Account', key: 'account_name', width: 2.8 },
    { header: t('amount') || 'Amount', key: 'amount', money: true, width: 1.2 },
  ];
  const reportFilters = [{ label: t('asOf') || 'As of', value: asOf }];

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
            columns={reportColumns}
            rows={flatRows}
            totals={{ __label: t('totalLiabilitiesAndEquity') || 'Total Liabilities & Equity', amount: summary.total_liabilities_and_equity }}
            filters={reportFilters}
            filename="balance-sheet.pdf"
          />
        }
      />

      <div className="glass-card p-4 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{t('asOf') || 'As of'}</span>
          <input className="input" type="date" value={asOf} onChange={e => setAsOf(e.target.value)} />
        </div>
        <button onClick={fetchReport} className="btn-secondary flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />{t('refresh') || 'Refresh'}
        </button>
      </div>

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
        </div>
      )}
    </div>
  );
}
