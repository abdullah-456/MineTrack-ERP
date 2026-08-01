import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, Loader2, ArrowLeft, ArrowDownCircle, ArrowUpCircle,
  Wallet, Users, RefreshCw, RotateCcw, ExternalLink, FileText,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR, formatPKROrZero, formatQty } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import FinancialReportFilters, { buildReportFilterList } from '../../components/ui/FinancialReportFilters';
import Modal from '../../components/ui/Modal';
import api from '../../api/axios';

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function shortDate(d) {
  return d ? String(d).slice(0, 10) : '—';
}

const TABS = [
  { id: 'overview', labelKey: 'overview', fallback: 'Overview' },
  { id: 'invoices', labelKey: 'invoices', fallback: 'Invoices' },
  { id: 'customers', labelKey: 'byCustomer', fallback: 'By customer' },
  { id: 'products', labelKey: 'byProduct', fallback: 'By product' },
  { id: 'recovery', labelKey: 'recoveries', fallback: 'Recoveries' },
  { id: 'receivables', labelKey: 'receivables', fallback: 'Receivables' },
];

function FlowCard({ icon: Icon, tone, title, amount, hint, lang, extra, onClick }) {
  const toneClass = {
    green: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    red: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    violet: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  }[tone] || 'text-gray-400 bg-white/5 border-white/10';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-start w-full transition-all hover:scale-[1.01] hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 cursor-pointer ${toneClass.split(' ').slice(1).join(' ')}`}
      title="Click to view breakdown"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 ${toneClass.split(' ')[0]}`} />
          <span className="text-xs font-semibold uppercase tracking-wide truncate" style={{ color: 'var(--text-muted)' }}>{title}</span>
        </div>
        <ExternalLink className={`w-3.5 h-3.5 shrink-0 opacity-50 ${toneClass.split(' ')[0]}`} />
      </div>
      {/* A real zero must read as "Rs. 0", not the same dash a genuinely
          missing figure would show — otherwise a quiet day looks identical
          to a card that failed to fetch. */}
      <div className={`text-xl font-bold ${toneClass.split(' ')[0]}`}>{formatPKROrZero(amount, lang)}</div>
      {extra}
      {hint && <p className="mt-2 text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide opacity-70" style={{ color: 'var(--text-muted)' }}>
        View breakdown →
      </p>
    </button>
  );
}

function InvoiceLink({ children, onClick, className = '' }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={`inline-flex items-center gap-1 font-mono text-indigo-400 hover:text-indigo-300 hover:underline ${className}`}
      title="Open invoice"
    >
      {children}
      <ExternalLink className="w-3 h-3 opacity-70" />
    </button>
  );
}

export default function SalesReport() {
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { error } = useToast();
  const { shopParams, shopId, branches } = useShopApi();
  const isRTL = lang === 'ur';

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerOptions, setCustomerOptions] = useState(null);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [customerModal, setCustomerModal] = useState(null); // customer row from by_customer / debtors
  const [cardModal, setCardModal] = useState(null); // money-flow KPI breakdown

  // The customer picker's own list — fetched once, independent of the date
  // range/branch, so narrowing the period doesn't also shrink who you can pick.
  useEffect(() => {
    api.get('/reports/modules/sales/filter-options', { params: shopParams() })
      .then(({ data: res }) => setCustomerOptions(res.customers || []))
      .catch(() => setCustomerOptions([]));
  }, [shopParams]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams(), from, to };
      if (branchId) params.branch_id = branchId;
      if (customerId) params.customer_id = customerId;
      const { data: res } = await api.get('/reports/modules/sales/summary', { params });
      setData(res);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [shopParams, from, to, branchId, customerId, error, t]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const openSaleInvoice = (saleId) => {
    if (!saleId) return;
    const qs = shopId ? `?shop_id=${shopId}` : '';
    window.open(`/invoice/sale-${saleId}${qs}`, '_blank', 'noopener,noreferrer');
  };

  const openCustomerDetail = (cust) => {
    if (!cust) return;
    const invoices = (data?.invoices || []).filter(inv => {
      if (cust.customer_id == null) return !inv.customer_id;
      return String(inv.customer_id) === String(cust.customer_id);
    });
    const recoveries = (data?.recoveries || []).filter(r =>
      cust.customer_id != null && String(r.customer_id) === String(cust.customer_id),
    );
    setCustomerModal({ ...cust, invoices, recoveries });
  };

  const flow = data?.flow || {};
  const kpis = data?.kpis || {};

  const openCardBreakdown = (key) => {
    if (!data) return;
    const invoices = data.invoices || [];
    const map = {
      incomings: {
        title: flow.incomings?.label || t('incomings') || 'Incomings — Gross sales',
        subtitle: `${kpis.invoice_count || 0} ${t('invoices') || 'invoices'} · ${formatPKR(kpis.gross_sales, lang)}`,
        type: 'invoices',
        rows: invoices,
        totalKey: 'total',
        total: kpis.gross_sales,
      },
      collected: {
        title: flow.collected_at_sale?.label || t('collectedAtSale') || 'Collected at sale',
        subtitle: `${t('cash') || 'Cash'}: ${formatPKR(flow.collected_at_sale?.cash, lang)} · ${t('bank') || 'Bank'}: ${formatPKR(flow.collected_at_sale?.bank, lang)}`,
        type: 'invoices',
        rows: invoices.filter(inv => (parseFloat(inv.collected) || 0) > 0.009),
        totalKey: 'collected',
        total: kpis.collected_at_sale,
        methods: data.by_payment_method || [],
      },
      credit: {
        title: flow.credit_booked?.label || t('soldOnCredit') || 'Sold on credit',
        subtitle: formatPKR(kpis.credit_booked, lang),
        type: 'invoices',
        rows: invoices.filter(inv => (parseFloat(inv.on_account) || 0) > 0.009),
        totalKey: 'on_account',
        total: kpis.credit_booked,
      },
      recovery: {
        title: flow.recovery?.label || t('recovery') || 'Customer recoveries',
        subtitle: formatPKR(kpis.recovery, lang),
        type: 'recoveries',
        rows: data.recoveries || [],
        totalKey: 'amount',
        total: kpis.recovery,
      },
      returns: {
        title: flow.outgoings?.label || t('outgoingsReturns') || 'Outgoings — Returns',
        subtitle: `${flow.outgoings?.count || 0} ${t('returns') || 'returns'}`,
        type: 'returns',
        rows: data.returns || [],
        totalKey: 'refund_amount',
        total: kpis.returns,
      },
      net: {
        title: flow.net_sales?.label || t('netSales') || 'Net sales',
        subtitle: `${formatPKR(kpis.gross_sales, lang)} − ${formatPKR(kpis.returns, lang)} = ${formatPKR(kpis.net_sales, lang)}`,
        type: 'net',
        rows: [
          { label: t('incomings') || 'Gross sales', value: kpis.gross_sales },
          { label: t('outgoingsReturns') || 'Returns / refunds', value: -(kpis.returns || 0) },
          { label: t('netSales') || 'Net sales', value: kpis.net_sales, bold: true },
          { label: t('cashInTotal') || 'Total cash/bank in', value: kpis.cash_in_total },
        ],
        total: kpis.net_sales,
      },
      receivables: {
        title: flow.receivables?.label || t('receivablesOutstanding') || 'Receivables outstanding',
        subtitle: `${flow.receivables?.customers || 0} ${t('customers') || 'customers'}`,
        type: 'debtors',
        rows: data.debtors || [],
        totalKey: 'outstanding',
        total: kpis.receivables_outstanding,
      },
      advances: {
        title: flow.customer_advances?.label || t('customerAdvances') || 'Customer advances',
        subtitle: formatPKR(kpis.customer_advances, lang),
        type: 'advances',
        rows: data.advances || [],
        totalKey: 'advance',
        total: kpis.customer_advances,
      },
    };
    if (map[key]) setCardModal(map[key]);
  };
  const filters = buildReportFilterList({
    t, from, to, branchId, branches,
    entityLabel: t('customer') || 'Customer', entityValue: customerId, entityOptions: customerOptions,
  });

  const money = (n) => formatPKR(n, 'en'); // English for PDF

  const buildFullDocument = useCallback(() => {
    if (!data) return null;
    const k = data.kpis || {};
    return {
      kind: 'detail',
      title: t('salesSummaryReport') || 'Sales Summary Report',
      filename: `sales-full-report-${from}-to-${to}.pdf`,
      filters,
      meta: [
        `${t('invoices') || 'Invoices'}: ${k.invoice_count || 0}`,
        `${t('branch') || 'Branch'}: ${branchId ? (branches.find(b => String(b.id) === String(branchId))?.name || branchId) : (t('allBranches') || 'All')}`,
      ],
      signature: true,
      sections: [
        {
          heading: t('moneyFlow') || 'Money Flow Summary',
          rows: [
            { label: t('incomings') || 'Gross sales (billed)', value: money(k.gross_sales) },
            { label: t('collectedAtSale') || 'Collected at sale', value: money(k.collected_at_sale) },
            { label: t('soldOnCredit') || 'Sold on credit', value: money(k.credit_booked) },
            { label: t('recovery') || 'Customer recoveries', value: money(k.recovery) },
            { label: t('outgoingsReturns') || 'Returns / refunds', value: money(k.returns) },
            { label: t('netSales') || 'Net sales', value: money(k.net_sales) },
            { label: t('cashInTotal') || 'Total cash/bank in', value: money(k.cash_in_total) },
            { label: t('receivablesOutstanding') || 'Receivables outstanding', value: money(k.receivables_outstanding) },
            { label: t('customerAdvances') || 'Customer advances', value: money(k.customer_advances) },
          ],
        },
      ],
      tables: [
        {
          heading: t('byDay') || 'Sales by day',
          columns: [
            { header: t('date') || 'Date', key: 'date', width: 1.2 },
            { header: t('invoices') || 'Invoices', key: 'invoices', align: 'right', width: 0.8 },
            { header: t('sales') || 'Sales', key: 'sales', money: true, width: 1.2 },
            { header: t('collected') || 'Collected', key: 'collected', money: true, width: 1.2 },
            { header: t('onCredit') || 'On credit', key: 'credit', money: true, width: 1.2 },
          ],
          rows: data.by_day || [],
          totals: {
            __label: t('total') || 'Total',
            invoices: (data.by_day || []).reduce((s, r) => s + (r.invoices || 0), 0),
            sales: k.gross_sales,
            collected: k.collected_at_sale,
            credit: k.credit_booked,
          },
        },
        {
          heading: t('byPaymentMethod') || 'Collected at sale — by method',
          columns: [
            { header: t('method') || 'Method', key: 'method', width: 1.5 },
            { header: t('amount') || 'Amount', key: 'amount', money: true, width: 1.5 },
          ],
          rows: data.by_payment_method || [],
        },
        {
          heading: t('invoices') || 'Invoices',
          columns: [
            { header: t('invoice') || 'Invoice', key: 'invoice_number', width: 1.3 },
            { header: t('date') || 'Date', render: r => shortDate(r.sale_date), width: 1 },
            { header: t('customer') || 'Customer', key: 'customer_name', width: 1.5 },
            { header: t('total') || 'Total', key: 'total', money: true, width: 1 },
            { header: t('collected') || 'Collected', key: 'collected', money: true, width: 1 },
            { header: t('onCredit') || 'On credit', key: 'on_account', money: true, width: 1 },
          ],
          rows: data.invoices || [],
          totals: {
            __label: t('total') || 'Total',
            total: k.gross_sales,
            collected: k.collected_at_sale,
            on_account: k.credit_booked,
          },
        },
        {
          heading: t('byCustomer') || 'By customer',
          columns: [
            { header: t('customer') || 'Customer', key: 'customer_name', width: 1.8 },
            { header: t('invoices') || 'Invoices', key: 'invoices', align: 'right', width: 0.7 },
            { header: t('sales') || 'Sales', key: 'sales', money: true, width: 1 },
            { header: t('collected') || 'Collected', key: 'collected', money: true, width: 1 },
            { header: t('onCredit') || 'On credit', key: 'credit', money: true, width: 1 },
            { header: t('outstanding') || 'Outstanding', key: 'outstanding', money: true, width: 1 },
          ],
          rows: data.by_customer || [],
        },
        {
          heading: t('byProduct') || 'By product',
          columns: [
            { header: t('product') || 'Product', key: 'product_name', width: 2 },
            { header: t('sku') || 'SKU', key: 'sku', width: 1 },
            { header: t('quantity') || 'Qty', render: r => formatQty(r.quantity), align: 'right', width: 0.9 },
            { header: t('amount') || 'Amount', key: 'amount', money: true, width: 1.2 },
          ],
          rows: data.by_product || [],
          totals: {
            __label: t('total') || 'Total',
            amount: (data.by_product || []).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
          },
        },
        {
          heading: t('recoveries') || 'Customer recoveries',
          columns: [
            { header: t('date') || 'Date', render: r => shortDate(r.date), width: 1.1 },
            { header: t('customer') || 'Customer', key: 'customer_name', width: 1.6 },
            { header: t('method') || 'Method', key: 'method', width: 1 },
            { header: t('amount') || 'Amount', key: 'amount', money: true, width: 1.1 },
            { header: t('notes') || 'Notes', key: 'notes', width: 1.8 },
          ],
          rows: data.recoveries || [],
          totals: {
            __label: t('total') || 'Total',
            amount: k.recovery,
          },
        },
        {
          heading: t('receivablesOutstanding') || 'Receivables outstanding',
          columns: [
            { header: t('customer') || 'Customer', key: 'customer_name', width: 2 },
            { header: t('phone') || 'Phone', key: 'phone', width: 1.2 },
            { header: t('outstanding') || 'Outstanding', key: 'outstanding', money: true, width: 1.3 },
          ],
          rows: data.debtors || [],
          totals: {
            __label: t('total') || 'Total',
            outstanding: k.receivables_outstanding,
          },
        },
        {
          heading: t('outgoingsReturns') || 'Returns / refunds',
          columns: [
            { header: t('date') || 'Date', render: r => shortDate(r.date), width: 1.1 },
            { header: t('customer') || 'Customer', key: 'customer_name', width: 1.6 },
            { header: t('method') || 'Method', key: 'refund_method', width: 1 },
            { header: t('amount') || 'Amount', key: 'refund_amount', money: true, width: 1.2 },
          ],
          rows: data.returns || [],
          totals: {
            __label: t('total') || 'Total',
            refund_amount: k.returns,
          },
        },
      ],
    };
  }, [data, t, from, to, filters, branchId, branches]);

  const emptyCell = (
    <tr>
      <td colSpan={8} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
        {t('noEntries') || 'No entries'}
      </td>
    </tr>
  );

  const customerInvoices = useMemo(() => customerModal?.invoices || [], [customerModal]);

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={TrendingUp}
        accent="emerald"
        title={t('salesSummaryReport') || 'Sales Report'}
        subtitle={t('salesReportSub') || 'Incomings, credit, recoveries, returns & customer receivables'}
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/reports')} className="btn-secondary flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />{t('reportsHub') || 'Reports Hub'}
            </button>
            <ReportActions
              getReport={buildFullDocument}
              label
            />
            <button type="button" onClick={fetchReport} className="icon-btn" title={t('refresh') || 'Refresh'}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
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
        entityLabel={t('customer') || 'Customer'}
        entityValue={customerId}
        entityOptions={customerOptions}
        onEntityChange={setCustomerId}
      />

      {loading && !data ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-emerald-400" /></div>
      ) : !data ? (
        <div className="glass-card p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noData') || 'No data'}</div>
      ) : (
        <>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              {t('moneyFlow') || 'Money flow'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <FlowCard icon={ArrowDownCircle} tone="green" title={flow.incomings?.label || (t('incomings') || 'Incomings — Gross sales')} amount={kpis.gross_sales} hint={flow.incomings?.hint} lang={lang}
                onClick={() => openCardBreakdown('incomings')}
                extra={<p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{kpis.invoice_count || 0} {t('invoices') || 'invoices'}</p>} />
              <FlowCard icon={Wallet} tone="blue" title={flow.collected_at_sale?.label || (t('collectedAtSale') || 'Collected at sale')} amount={kpis.collected_at_sale} hint={flow.collected_at_sale?.hint} lang={lang}
                onClick={() => openCardBreakdown('collected')}
                extra={<p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{t('cash') || 'Cash'}: {formatPKR(flow.collected_at_sale?.cash, lang)} · {t('bank') || 'Bank'}: {formatPKR(flow.collected_at_sale?.bank, lang)}</p>} />
              <FlowCard icon={Users} tone="amber" title={flow.credit_booked?.label || (t('soldOnCredit') || 'Sold on credit')} amount={kpis.credit_booked} hint={flow.credit_booked?.hint} lang={lang}
                onClick={() => openCardBreakdown('credit')} />
              <FlowCard icon={RefreshCw} tone="cyan" title={flow.recovery?.label || (t('recovery') || 'Customer recoveries')} amount={kpis.recovery} hint={flow.recovery?.hint} lang={lang}
                onClick={() => openCardBreakdown('recovery')} />
              <FlowCard icon={RotateCcw} tone="red" title={flow.outgoings?.label || (t('outgoingsReturns') || 'Outgoings — Returns')} amount={kpis.returns} hint={flow.outgoings?.hint} lang={lang}
                onClick={() => openCardBreakdown('returns')}
                extra={<p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{flow.outgoings?.count || 0} {t('returns') || 'returns'}</p>} />
              <FlowCard icon={TrendingUp} tone="violet" title={flow.net_sales?.label || (t('netSales') || 'Net sales')} amount={kpis.net_sales} hint={flow.net_sales?.hint} lang={lang}
                onClick={() => openCardBreakdown('net')} />
              <FlowCard icon={ArrowUpCircle} tone="amber" title={flow.receivables?.label || (t('receivablesOutstanding') || 'Receivables outstanding')} amount={kpis.receivables_outstanding} hint={flow.receivables?.hint} lang={lang}
                onClick={() => openCardBreakdown('receivables')}
                extra={<p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{flow.receivables?.customers || 0} {t('customers') || 'customers'}</p>} />
              <FlowCard icon={Wallet} tone="blue" title={flow.customer_advances?.label || (t('customerAdvances') || 'Customer advances')} amount={kpis.customer_advances} hint={flow.customer_advances?.hint} lang={lang}
                onClick={() => openCardBreakdown('advances')} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {TABS.map(tb => (
              <button
                key={tb.id}
                type="button"
                onClick={() => setTab(tb.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === tb.id ? 'bg-emerald-500 text-white' : ''}`}
                style={tab !== tb.id ? { background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' } : {}}
              >
                {t(tb.labelKey) || tb.fallback}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="glass-card overflow-x-auto">
                <div className="p-4 text-sm font-bold" style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>{t('byDay') || 'By day'}</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: 'var(--text-muted)' }}>
                      <th className="text-start p-3">{t('date')}</th>
                      <th className="text-end p-3">{t('invoices')}</th>
                      <th className="text-end p-3">{t('sales')}</th>
                      <th className="text-end p-3">{t('collected')}</th>
                      <th className="text-end p-3">{t('onCredit') || 'Credit'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.by_day || []).map(r => (
                      <tr key={r.date} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <td className="p-3">{r.date}</td>
                        <td className="p-3 text-end">{r.invoices}</td>
                        <td className="p-3 text-end text-emerald-400 font-medium">{formatPKR(r.sales, lang)}</td>
                        <td className="p-3 text-end">{formatPKR(r.collected, lang)}</td>
                        <td className="p-3 text-end text-amber-400">{formatPKR(r.credit, lang)}</td>
                      </tr>
                    ))}
                    {!data.by_day?.length && emptyCell}
                  </tbody>
                </table>
              </div>
              <div className="glass-card overflow-x-auto">
                <div className="p-4 text-sm font-bold" style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>{t('byPaymentMethod') || 'By payment method (at sale)'}</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: 'var(--text-muted)' }}>
                      <th className="text-start p-3">{t('method') || 'Method'}</th>
                      <th className="text-end p-3">{t('amount') || 'Amount'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.by_payment_method || []).map(r => (
                      <tr key={r.method} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <td className="p-3 capitalize">{r.method}</td>
                        <td className="p-3 text-end font-medium text-emerald-400">{formatPKR(r.amount, lang)}</td>
                      </tr>
                    ))}
                    {!data.by_payment_method?.length && emptyCell}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'invoices' && (
            <div className="glass-card overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th className="text-start p-3">{t('invoice') || 'Invoice'}</th>
                    <th className="text-start p-3">{t('date')}</th>
                    <th className="text-start p-3">{t('customer')}</th>
                    <th className="text-end p-3">{t('total')}</th>
                    <th className="text-end p-3">{t('collected')}</th>
                    <th className="text-end p-3">{t('onCredit') || 'On credit'}</th>
                    <th className="text-end p-3">{t('actions') || 'Open'}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.invoices || []).map(inv => (
                    <tr
                      key={inv.id}
                      style={{ borderTop: '1px solid var(--border-subtle)' }}
                      className="hover:bg-white/5 cursor-pointer"
                      onClick={() => openSaleInvoice(inv.id)}
                    >
                      <td className="p-3">
                        <InvoiceLink onClick={() => openSaleInvoice(inv.id)}>{inv.invoice_number}</InvoiceLink>
                      </td>
                      <td className="p-3" style={{ color: 'var(--text-secondary)' }}>{shortDate(inv.sale_date)}</td>
                      <td className="p-3" style={{ color: 'var(--text-primary)' }}>{inv.customer_name}</td>
                      <td className="p-3 text-end font-medium text-emerald-400">{formatPKR(inv.total, lang)}</td>
                      <td className="p-3 text-end">{formatPKR(inv.collected, lang)}</td>
                      <td className="p-3 text-end text-amber-400">{formatPKR(inv.on_account, lang)}</td>
                      <td className="p-3 text-end">
                        <button type="button" className="icon-btn text-indigo-400" onClick={(e) => { e.stopPropagation(); openSaleInvoice(inv.id); }}>
                          <FileText className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!data.invoices?.length && emptyCell}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'customers' && (
            <div className="glass-card overflow-x-auto">
              <p className="px-4 pt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                {t('clickCustomerHint') || 'Click a customer row to see their invoices for this period — then open any invoice slip.'}
              </p>
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th className="text-start p-3">{t('customer')}</th>
                    <th className="text-end p-3">{t('invoices')}</th>
                    <th className="text-end p-3">{t('sales')}</th>
                    <th className="text-end p-3">{t('collected')}</th>
                    <th className="text-end p-3">{t('onCredit') || 'On credit'}</th>
                    <th className="text-end p-3">{t('outstanding')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.by_customer || []).map(c => (
                    <tr
                      key={c.customer_id ?? 'walkin'}
                      style={{ borderTop: '1px solid var(--border-subtle)' }}
                      className="hover:bg-white/5 cursor-pointer"
                      onClick={() => openCustomerDetail(c)}
                    >
                      <td className="p-3 font-medium text-indigo-400 hover:underline">{c.customer_name}</td>
                      <td className="p-3 text-end">{c.invoices}</td>
                      <td className="p-3 text-end font-medium text-emerald-400">{formatPKR(c.sales, lang)}</td>
                      <td className="p-3 text-end">{formatPKR(c.collected, lang)}</td>
                      <td className="p-3 text-end text-amber-400">{formatPKR(c.credit, lang)}</td>
                      <td className="p-3 text-end font-semibold">{formatPKR(c.outstanding, lang)}</td>
                    </tr>
                  ))}
                  {!data.by_customer?.length && emptyCell}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'products' && (
            <div className="glass-card overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th className="text-start p-3">{t('product')}</th>
                    <th className="text-start p-3">{t('sku')}</th>
                    <th className="text-end p-3">{t('quantity')}</th>
                    <th className="text-end p-3">{t('amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.by_product || []).map(p => (
                    <tr key={p.product_id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td className="p-3" style={{ color: 'var(--text-primary)' }}>{p.product_name}</td>
                      <td className="p-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{p.sku || '—'}</td>
                      <td className="p-3 text-end">{formatQty(p.quantity)}</td>
                      <td className="p-3 text-end font-medium text-emerald-400">{formatPKR(p.amount, lang)}</td>
                    </tr>
                  ))}
                  {!data.by_product?.length && emptyCell}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'recovery' && (
            <div className="glass-card overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th className="text-start p-3">{t('date')}</th>
                    <th className="text-start p-3">{t('customer')}</th>
                    <th className="text-start p-3">{t('method')}</th>
                    <th className="text-end p-3">{t('amount')}</th>
                    <th className="text-start p-3">{t('invoice') || 'Linked sale'}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.recoveries || []).map(r => (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                      <td className="p-3">{shortDate(r.date)}</td>
                      <td className="p-3">{r.customer_name}</td>
                      <td className="p-3 capitalize">{r.method || '—'}</td>
                      <td className="p-3 text-end font-medium text-emerald-400">{formatPKR(r.amount, lang)}</td>
                      <td className="p-3">
                        {r.related_sale_id ? (
                          <InvoiceLink onClick={() => openSaleInvoice(r.related_sale_id)}>
                            #{r.related_sale_id}
                          </InvoiceLink>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                  {!data.recoveries?.length && emptyCell}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'receivables' && (
            <div className="glass-card overflow-x-auto">
              <p className="px-4 pt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                {t('clickCustomerHint') || 'Click a customer to drill into their period invoices.'}
              </p>
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th className="text-start p-3">{t('customer')}</th>
                    <th className="text-start p-3">{t('phone')}</th>
                    <th className="text-end p-3">{t('outstanding')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.debtors || []).map(d => (
                    <tr
                      key={d.customer_id}
                      style={{ borderTop: '1px solid var(--border-subtle)' }}
                      className="hover:bg-white/5 cursor-pointer"
                      onClick={() => openCustomerDetail({
                        ...d,
                        sales: (data.by_customer || []).find(c => String(c.customer_id) === String(d.customer_id))?.sales || 0,
                        collected: (data.by_customer || []).find(c => String(c.customer_id) === String(d.customer_id))?.collected || 0,
                        credit: (data.by_customer || []).find(c => String(c.customer_id) === String(d.customer_id))?.credit || 0,
                        invoices: (data.by_customer || []).find(c => String(c.customer_id) === String(d.customer_id))?.invoices || 0,
                      })}
                    >
                      <td className="p-3 font-medium text-indigo-400 hover:underline">{d.customer_name}</td>
                      <td className="p-3" style={{ color: 'var(--text-secondary)' }}>{d.phone || '—'}</td>
                      <td className="p-3 text-end font-bold text-amber-400">{formatPKR(d.outstanding, lang)}</td>
                    </tr>
                  ))}
                  {!data.debtors?.length && emptyCell}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {cardModal && (
        <Modal
          wide
          title={cardModal.title}
          onClose={() => setCardModal(null)}
        >
          <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>{cardModal.subtitle}</p>

          {cardModal.methods?.length > 0 && (
            <div className="mb-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {cardModal.methods.map(m => (
                <div key={m.method} className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                  <div className="text-[11px] uppercase tracking-wide capitalize mb-1" style={{ color: 'var(--text-muted)' }}>{m.method}</div>
                  <div className="text-sm font-bold text-emerald-400">{formatPKR(m.amount, lang)}</div>
                </div>
              ))}
            </div>
          )}

          {cardModal.type === 'net' ? (
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
              <table className="w-full text-sm">
                <tbody>
                  {cardModal.rows.map((r) => (
                    <tr key={r.label} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td className={`p-3 ${r.bold ? 'font-bold' : ''}`}>{r.label}</td>
                      <td className={`p-3 text-end ${r.bold ? 'font-bold text-emerald-400' : ''}`}>{formatPKR(r.value, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border-subtle)' }}>
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)' }}>
                    {cardModal.type === 'invoices' && (
                      <>
                        <th className="text-start p-3">{t('invoice')}</th>
                        <th className="text-start p-3">{t('date')}</th>
                        <th className="text-start p-3">{t('customer')}</th>
                        <th className="text-end p-3">{t('total')}</th>
                        <th className="text-end p-3">{t('collected')}</th>
                        <th className="text-end p-3">{t('onCredit') || 'Credit'}</th>
                      </>
                    )}
                    {cardModal.type === 'recoveries' && (
                      <>
                        <th className="text-start p-3">{t('date')}</th>
                        <th className="text-start p-3">{t('customer')}</th>
                        <th className="text-start p-3">{t('method')}</th>
                        <th className="text-end p-3">{t('amount')}</th>
                        <th className="text-start p-3">{t('invoice') || 'Sale'}</th>
                      </>
                    )}
                    {cardModal.type === 'returns' && (
                      <>
                        <th className="text-start p-3">{t('date')}</th>
                        <th className="text-start p-3">{t('customer')}</th>
                        <th className="text-start p-3">{t('method')}</th>
                        <th className="text-end p-3">{t('amount')}</th>
                      </>
                    )}
                    {(cardModal.type === 'debtors' || cardModal.type === 'advances') && (
                      <>
                        <th className="text-start p-3">{t('customer')}</th>
                        <th className="text-start p-3">{t('phone')}</th>
                        <th className="text-end p-3">{cardModal.type === 'advances' ? (t('customerAdvances') || 'Advance') : (t('outstanding') || 'Outstanding')}</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {cardModal.type === 'invoices' && cardModal.rows.map(inv => (
                    <tr key={inv.id} className="hover:bg-white/5 cursor-pointer" style={{ borderTop: '1px solid var(--border-subtle)' }}
                      onClick={() => openSaleInvoice(inv.id)}>
                      <td className="p-3"><InvoiceLink onClick={() => openSaleInvoice(inv.id)}>{inv.invoice_number}</InvoiceLink></td>
                      <td className="p-3">{shortDate(inv.sale_date)}</td>
                      <td className="p-3">{inv.customer_name}</td>
                      <td className="p-3 text-end text-emerald-400 font-medium">{formatPKR(inv.total, lang)}</td>
                      <td className="p-3 text-end">{formatPKR(inv.collected, lang)}</td>
                      <td className="p-3 text-end text-amber-400">{formatPKR(inv.on_account, lang)}</td>
                    </tr>
                  ))}
                  {cardModal.type === 'recoveries' && cardModal.rows.map(r => (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td className="p-3">{shortDate(r.date)}</td>
                      <td className="p-3">{r.customer_name}</td>
                      <td className="p-3 capitalize">{r.method || '—'}</td>
                      <td className="p-3 text-end text-emerald-400 font-medium">{formatPKR(r.amount, lang)}</td>
                      <td className="p-3">
                        {r.related_sale_id
                          ? <InvoiceLink onClick={() => openSaleInvoice(r.related_sale_id)}>#{r.related_sale_id}</InvoiceLink>
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  {cardModal.type === 'returns' && cardModal.rows.map((r, i) => (
                    <tr key={r.id || i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td className="p-3">{shortDate(r.date)}</td>
                      <td className="p-3">{r.customer_name}</td>
                      <td className="p-3 capitalize">{r.refund_method || '—'}</td>
                      <td className="p-3 text-end text-rose-400 font-medium">{formatPKR(r.refund_amount, lang)}</td>
                    </tr>
                  ))}
                  {cardModal.type === 'debtors' && cardModal.rows.map(d => (
                    <tr key={d.customer_id} className="hover:bg-white/5 cursor-pointer" style={{ borderTop: '1px solid var(--border-subtle)' }}
                      onClick={() => { setCardModal(null); openCustomerDetail(d); }}>
                      <td className="p-3 text-indigo-400 font-medium">{d.customer_name}</td>
                      <td className="p-3">{d.phone || '—'}</td>
                      <td className="p-3 text-end font-semibold text-amber-400">{formatPKR(d.outstanding, lang)}</td>
                    </tr>
                  ))}
                  {cardModal.type === 'advances' && cardModal.rows.map(d => (
                    <tr key={d.customer_id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td className="p-3">{d.customer_name}</td>
                      <td className="p-3">{d.phone || '—'}</td>
                      <td className="p-3 text-end font-semibold text-emerald-400">{formatPKR(d.advance, lang)}</td>
                    </tr>
                  ))}
                  {!cardModal.rows?.length && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
                        {t('noEntries') || 'No entries'}
                      </td>
                    </tr>
                  )}
                </tbody>
                {cardModal.rows?.length > 0 && cardModal.total != null && cardModal.type !== 'net' && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                      <td className="p-3 font-bold" colSpan={cardModal.type === 'invoices' ? 3 : cardModal.type === 'recoveries' ? 3 : cardModal.type === 'returns' ? 3 : 2}>
                        {t('total') || 'Total'}
                      </td>
                      <td className="p-3 text-end font-bold text-emerald-400" colSpan={cardModal.type === 'invoices' ? 3 : 1}>
                        {formatPKR(cardModal.total, lang)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </Modal>
      )}

      {customerModal && (
        <Modal
          wide
          title={`${customerModal.customer_name} — ${t('periodDetail') || 'Period detail'}`}
          onClose={() => setCustomerModal(null)}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: t('sales') || 'Sales', value: customerModal.sales },
              { label: t('collected') || 'Collected', value: customerModal.collected },
              { label: t('onCredit') || 'On credit', value: customerModal.credit },
              { label: t('outstanding') || 'Outstanding', value: customerModal.outstanding },
            ].map(card => (
              <div key={card.label} className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>{card.label}</div>
                <div className="text-sm font-bold text-emerald-400">{formatPKR(card.value || 0, lang)}</div>
              </div>
            ))}
          </div>

          <h4 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
            {t('invoices') || 'Invoices'} ({customerInvoices.length})
          </h4>
          <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border-subtle)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)' }}>
                  <th className="text-start p-3">{t('invoice')}</th>
                  <th className="text-start p-3">{t('date')}</th>
                  <th className="text-end p-3">{t('total')}</th>
                  <th className="text-end p-3">{t('collected')}</th>
                  <th className="text-end p-3">{t('onCredit') || 'Credit'}</th>
                </tr>
              </thead>
              <tbody>
                {customerInvoices.map(inv => (
                  <tr
                    key={inv.id}
                    className="hover:bg-white/5 cursor-pointer"
                    style={{ borderTop: '1px solid var(--border-subtle)' }}
                    onClick={() => openSaleInvoice(inv.id)}
                  >
                    <td className="p-3">
                      <InvoiceLink onClick={() => openSaleInvoice(inv.id)}>{inv.invoice_number}</InvoiceLink>
                    </td>
                    <td className="p-3">{shortDate(inv.sale_date)}</td>
                    <td className="p-3 text-end text-emerald-400 font-medium">{formatPKR(inv.total, lang)}</td>
                    <td className="p-3 text-end">{formatPKR(inv.collected, lang)}</td>
                    <td className="p-3 text-end text-amber-400">{formatPKR(inv.on_account, lang)}</td>
                  </tr>
                ))}
                {!customerInvoices.length && (
                  <tr><td colSpan={5} className="p-6 text-center" style={{ color: 'var(--text-muted)' }}>{t('noInvoicesPeriod') || 'No invoices for this customer in the selected period'}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {(customerModal.recoveries || []).length > 0 && (
            <>
              <h4 className="text-xs font-bold uppercase tracking-wider mt-4 mb-2" style={{ color: 'var(--text-muted)' }}>
                {t('recoveries') || 'Recoveries'} ({customerModal.recoveries.length})
              </h4>
              <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border-subtle)' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)' }}>
                      <th className="text-start p-3">{t('date')}</th>
                      <th className="text-start p-3">{t('method')}</th>
                      <th className="text-end p-3">{t('amount')}</th>
                      <th className="text-start p-3">{t('invoice') || 'Sale'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerModal.recoveries.map(r => (
                      <tr key={r.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <td className="p-3">{shortDate(r.date)}</td>
                        <td className="p-3 capitalize">{r.method || '—'}</td>
                        <td className="p-3 text-end text-emerald-400 font-medium">{formatPKR(r.amount, lang)}</td>
                        <td className="p-3">
                          {r.related_sale_id ? (
                            <InvoiceLink onClick={() => openSaleInvoice(r.related_sale_id)}>#{r.related_sale_id}</InvoiceLink>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
