import { useState, useEffect, useCallback, useMemo } from 'react';
import { Wallet, Loader2 } from 'lucide-react';
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

function SectionBlock({ title, netProfit, lines, total, lang, t, tone }) {
  return (
    <div className="glass-card overflow-x-auto">
      <div className="p-4 font-bold text-sm uppercase tracking-wide" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
        {title}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {netProfit != null && (
            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td className="p-4 ps-6" style={{ color: 'var(--text-primary)' }}>{t('netProfit') || 'Net profit'}</td>
              <td className={`p-4 text-end w-44 font-medium ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatPKR(netProfit, lang)}</td>
            </tr>
          )}
          {lines.map((row, idx) => (
            <tr key={`${row.account_code}-${idx}`} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
              <td className="p-4 ps-6" style={{ color: 'var(--text-secondary)' }}>{row.label || row.account_name}</td>
              <td className={`p-4 text-end w-44 font-medium ${row.cash_effect >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatPKR(row.cash_effect, lang)}
              </td>
            </tr>
          ))}
          {lines.length === 0 && netProfit == null && (
            <tr><td colSpan={2} className="p-6 text-center" style={{ color: 'var(--text-muted)' }}>{t('noEntries') || 'No entries'}</td></tr>
          )}
          <tr style={{ backgroundColor: 'var(--bg-elevated)' }}>
            <td className="p-4 ps-6 font-bold" style={{ color: 'var(--text-primary)' }}>{t('netCashFromSection') || 'Net cash from section'}</td>
            <td className={`p-4 text-end font-bold ${total >= 0 ? 'text-emerald-400' : 'text-red-400'}`} style={{ color: tone }}>{formatPKR(total, lang)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function CashFlowStatement() {
  const { t, lang } = useTheme();
  const { error } = useToast();
  const { shopParams, branches } = useShopApi();

  const [operating, setOperating] = useState({ net_profit: 0, adjustments: [], total: 0 });
  const [investing, setInvesting] = useState({ lines: [], total: 0 });
  const [financing, setFinancing] = useState({ lines: [], total: 0 });
  const [summary, setSummary] = useState({
    net_cash_change: 0, opening_cash: 0, closing_cash: 0, is_reconciled: true,
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
      const { data } = await api.get('/reports/cash-flow', { params });
      setOperating(data.operating || { net_profit: 0, adjustments: [], total: 0 });
      setInvesting(data.investing || { lines: [], total: 0 });
      setFinancing(data.financing || { lines: [], total: 0 });
      setSummary({
        net_cash_change: data.net_cash_change || 0,
        opening_cash: data.opening_cash || 0,
        closing_cash: data.closing_cash || 0,
        is_reconciled: data.is_reconciled !== false,
      });
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, from, to, branchId, error, t]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const flatRows = useMemo(() => [
    { account_name: t('operatingActivities') || 'Operating Activities', amount: null, __section: true },
    { account_name: t('netProfit') || 'Net profit', amount: operating.net_profit },
    ...operating.adjustments.map(r => ({ account_name: r.label, amount: r.cash_effect })),
    { account_name: t('netCashFromSection') || 'Net from operating', amount: operating.total, __total: true },
    { account_name: t('investingActivities') || 'Investing Activities', amount: null, __section: true },
    ...investing.lines.map(r => ({ account_name: r.label, amount: r.cash_effect })),
    { account_name: t('netCashFromSection') || 'Net from investing', amount: investing.total, __total: true },
    { account_name: t('financingActivities') || 'Financing Activities', amount: null, __section: true },
    ...financing.lines.map(r => ({ account_name: r.label, amount: r.cash_effect })),
    { account_name: t('netCashFromSection') || 'Net from financing', amount: financing.total, __total: true },
    { account_name: t('netCashChange') || 'Net change in cash', amount: summary.net_cash_change, __total: true },
  ], [operating, investing, financing, summary, t]);

  const reportColumns = [
    { header: t('description') || 'Description', key: 'account_name', width: 2.8 },
    { header: t('amount') || 'Amount', key: 'amount', money: true, width: 1.2 },
  ];
  const reportFilters = buildReportFilterList({ t, from, to, branchId, branches, mode: 'period' });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Wallet}
        accent="brand"
        title={t('cashFlowStatement') || 'Cash Flow Statement'}
        subtitle={t('cashFlowStatementSub') || 'Where cash came from and went — operating, investing, and financing'}
        action={
          <ReportActions
            title={t('cashFlowStatement') || 'Cash Flow Statement'}
            columns={reportColumns}
            rows={flatRows.filter(r => !r.__section && r.amount != null)}
            totals={{ __label: t('netCashChange') || 'Net Change in Cash', amount: summary.net_cash_change }}
            filters={reportFilters}
            filename="cash-flow-statement.pdf"
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
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('openingCash') || 'Opening Cash'}</span>
          <p className="text-xl font-bold text-blue-400">{formatPKR(summary.opening_cash, lang)}</p>
        </div>
        <div className="glass-card p-5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('netCashChange') || 'Net Change'}</span>
          <p className={`text-xl font-bold ${summary.net_cash_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatPKR(summary.net_cash_change, lang)}
          </p>
        </div>
        <div className="glass-card p-5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('closingCash') || 'Closing Cash'}</span>
          <p className="text-xl font-bold text-blue-400">{formatPKR(summary.closing_cash, lang)}</p>
        </div>
        <div className="glass-card p-5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('operatingActivities') || 'Operating'}</span>
          <p className={`text-xl font-bold ${operating.total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatPKR(operating.total, lang)}
          </p>
        </div>
      </div>

      {!summary.is_reconciled && (
        <div className="glass-card p-4 border border-amber-500/40 text-amber-300 text-sm">
          {t('cashFlowWarning') || 'Warning: computed cash movement does not fully reconcile with opening/closing cash. Review recent vouchers — some may lack branch tags or use non-cash entries.'}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="space-y-4">
          <SectionBlock
            title={t('operatingActivities') || 'Operating Activities'}
            netProfit={operating.net_profit}
            lines={operating.adjustments}
            total={operating.total}
            lang={lang}
            t={t}
          />
          <SectionBlock
            title={t('investingActivities') || 'Investing Activities'}
            lines={investing.lines}
            total={investing.total}
            lang={lang}
            t={t}
          />
          <SectionBlock
            title={t('financingActivities') || 'Financing Activities'}
            lines={financing.lines}
            total={financing.total}
            lang={lang}
            t={t}
          />
          <div className="glass-card p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('openingCash') || 'Opening cash'}</p>
              <p className="font-bold text-lg">{formatPKR(summary.opening_cash, lang)}</p>
            </div>
            <div className="text-2xl" style={{ color: 'var(--text-muted)' }}>+</div>
            <div>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('netCashChange') || 'Net change'}</p>
              <p className={`font-bold text-lg ${summary.net_cash_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatPKR(summary.net_cash_change, lang)}
              </p>
            </div>
            <div className="text-2xl" style={{ color: 'var(--text-muted)' }}>=</div>
            <div>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('closingCash') || 'Closing cash'}</p>
              <p className="font-bold text-lg text-blue-400">{formatPKR(summary.closing_cash, lang)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
