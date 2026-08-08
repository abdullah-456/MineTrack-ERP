import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileBarChart2, TrendingUp, Package, ShoppingCart, Users, Building2,
  Receipt, Crown, UserCheck, BookOpen, ChevronRight, Factory,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
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

const MODULES = [
  {
    key: 'sales',
    titleKey: 'sales',
    title: 'Sales',
    descKey: 'salesReportHubDesc',
    desc: 'Incomings, credit sales, recoveries, returns & receivables',
    icon: TrendingUp,
    accent: 'text-emerald-400',
    path: '/reports/sales',
    module: 'sales',
    endpoint: '/reports/modules/sales/summary',
  },
  {
    key: 'purchases',
    titleKey: 'purchaseOrders',
    title: 'Purchases',
    descKey: 'purchasesReportHubDesc',
    desc: 'Stock received, payments out, credit purchases & supplier payables',
    icon: ShoppingCart,
    accent: 'text-indigo-400',
    path: '/reports/purchases',
    module: 'purchases',
    endpoint: '/reports/modules/purchases/summary',
  },
  {
    key: 'inventory',
    titleKey: 'stock',
    title: 'Inventory',
    descKey: 'inventoryReportHubDesc',
    desc: 'Stock in/out movements, on-hand value & low stock',
    icon: Package,
    accent: 'text-blue-400',
    path: '/reports/inventory',
    module: 'inventory',
    endpoint: '/reports/modules/inventory/summary',
  },
  {
    key: 'customers',
    titleKey: 'customers',
    title: 'Customers',
    descKey: 'customersReportHubDesc',
    desc: 'Charges, recoveries, returns credit & receivables',
    icon: Users,
    accent: 'text-cyan-400',
    path: '/reports/customers',
    module: 'customers',
    endpoint: '/reports/modules/customers/summary',
  },
  {
    key: 'suppliers',
    titleKey: 'suppliers',
    title: 'Suppliers',
    descKey: 'suppliersReportHubDesc',
    desc: 'Stock from suppliers, payments, payables & advances',
    icon: Building2,
    accent: 'text-amber-400',
    path: '/reports/suppliers',
    module: 'suppliers',
    endpoint: '/reports/modules/suppliers/summary',
  },
  {
    key: 'expenses',
    titleKey: 'expenses',
    title: 'Expenses',
    descKey: 'expensesReportHubDesc',
    desc: 'Cash/bank outgoings by category & branch',
    icon: Receipt,
    accent: 'text-rose-400',
    path: '/reports/expenses',
    module: 'expenses',
    endpoint: '/reports/modules/expenses/summary',
  },
  {
    key: 'accounting',
    titleKey: 'accounting',
    title: 'Accounting',
    descKey: 'accountingReportHubDesc',
    desc: 'Receipts, payments, journals & voucher activity',
    icon: BookOpen,
    accent: 'text-violet-400',
    path: '/reports/accounting',
    module: 'accounting',
    endpoint: '/reports/modules/accounting/summary',
  },
  {
    key: 'employees',
    titleKey: 'employees',
    title: 'Employees / HR',
    descKey: 'employeesReportHubDesc',
    desc: 'Salary out, advances, loans, recoveries & dues',
    icon: UserCheck,
    accent: 'text-teal-400',
    path: '/reports/employees',
    module: 'employees',
    endpoint: '/reports/modules/employees/summary',
  },
  {
    key: 'board',
    titleKey: 'boardOfDirectors',
    title: 'Board / Capital',
    descKey: 'boardReportHubDesc',
    desc: 'Contributions in, withdrawals out & member balances',
    icon: Crown,
    accent: 'text-yellow-400',
    path: '/reports/board',
    module: 'board_directors',
    endpoint: '/reports/modules/board/summary',
  },
  {
    key: 'production',
    titleKey: 'production',
    title: 'Production Minerals',
    descKey: 'productionReportHubDesc',
    desc: 'Daily mineral output by mine, pit, bench & mineral',
    icon: Factory,
    accent: 'text-green-400',
    path: '/reports/production',
    module: 'branches',
    endpoint: '/reports/modules/production/summary',
  },
];

function moneyEn(n) {
  return formatPKR(n, 'en');
}

/** Normalize any module summary API payload into PDF sections + tables. */
function normalizeModuleExport(mod, data) {
  const title = mod.title;
  const sections = [];
  const tables = [];

  if (data?.pdf) {
    (data.pdf.sections || []).forEach((s) => {
      sections.push({
        heading: `${title} — ${s.heading || 'Summary'}`,
        rows: s.rows || [],
      });
    });
    (data.pdf.tables || []).forEach((tb) => {
      tables.push({
        ...tb,
        heading: `${title} — ${tb.heading || 'Details'}`,
        rows: (tb.rows || []).slice(0, 80),
      });
    });
    return { sections, tables };
  }

  // Sales (legacy KPI shape)
  if (data?.kpis) {
    const k = data.kpis;
    sections.push({
      heading: `${title} — Money flow`,
      rows: [
        { label: 'Gross sales (billed)', value: moneyEn(k.gross_sales) },
        { label: 'Collected at sale', value: moneyEn(k.collected_at_sale) },
        { label: 'Sold on credit', value: moneyEn(k.credit_booked) },
        { label: 'Customer recoveries', value: moneyEn(k.recovery) },
        { label: 'Returns / refunds', value: moneyEn(k.returns) },
        { label: 'Net sales', value: moneyEn(k.net_sales) },
        { label: 'Total cash/bank in', value: moneyEn(k.cash_in_total) },
        { label: 'Receivables outstanding', value: moneyEn(k.receivables_outstanding) },
        { label: 'Customer advances', value: moneyEn(k.customer_advances) },
      ],
    });
    tables.push({
      heading: `${title} — By day`,
      columns: [
        { header: 'Date', key: 'date' },
        { header: 'Invoices', key: 'invoices', align: 'right' },
        { header: 'Sales', key: 'sales', money: true },
        { header: 'Collected', key: 'collected', money: true },
        { header: 'On credit', key: 'credit', money: true },
      ],
      rows: data.by_day || [],
    });
    tables.push({
      heading: `${title} — Invoices`,
      columns: [
        { header: 'Invoice', key: 'invoice_number' },
        { header: 'Customer', key: 'customer_name' },
        { header: 'Total', key: 'total', money: true },
        { header: 'Collected', key: 'collected', money: true },
        { header: 'On credit', key: 'on_account', money: true },
      ],
      rows: (data.invoices || []).slice(0, 80),
    });
    return { sections, tables };
  }

  // Generic cards + tabs fallback
  if (data?.cards?.length) {
    sections.push({
      heading: `${title} — Money flow`,
      rows: data.cards.map(c => ({ label: c.title, value: moneyEn(c.amount) })),
    });
  }
  (data?.tabs || []).slice(0, 3).forEach((tab) => {
    tables.push({
      heading: `${title} — ${tab.label}`,
      columns: tab.columns || [],
      rows: (tab.rows || []).slice(0, 80),
      totals: tab.totals,
    });
  });

  return { sections, tables };
}

export default function ReportsHub() {
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { can } = useAuth();
  const { error } = useToast();
  const { shopParams, branches } = useShopApi();
  const isRTL = lang === 'ur';

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState('');

  const visible = MODULES.filter(m => !m.module || can(m.module, 'read'));
  const filters = buildReportFilterList({ t, from, to, branchId, branches });

  const buildCombinedReport = useCallback(async () => {
    if (!visible.length) return null;

    const params = { ...shopParams(), from, to };
    if (branchId) params.branch_id = branchId;

    const results = await Promise.allSettled(
      visible.map(async (mod) => {
        const { data } = await api.get(mod.endpoint, { params });
        return { mod, data };
      }),
    );

    const sections = [];
    const tables = [];
    const included = [];
    const failed = [];

    results.forEach((r, idx) => {
      const mod = visible[idx];
      if (r.status !== 'fulfilled') {
        failed.push(mod.title);
        return;
      }
      included.push(mod.title);
      const title = t(mod.titleKey) || mod.title;
      const chunk = normalizeModuleExport({ ...mod, title }, r.value.data);
      sections.push(...chunk.sections);
      tables.push(...chunk.tables);
    });

    if (!sections.length && !tables.length) {
      error(t('toastErrorGeneric') || 'Could not build combined report');
      return null;
    }

    if (failed.length) {
      sections.unshift({
        heading: 'Modules skipped',
        rows: failed.map(name => ({ label: name, value: 'Unavailable for this user/filters' })),
      });
    }

    return {
      kind: 'detail',
      title: t('allModulesReport') || 'All Modules Consolidated Report',
      filename: `all-modules-report-${from}-to-${to}.pdf`,
      filters,
      meta: [
        `Modules: ${included.join(', ') || '—'}`,
        `Period: ${from} → ${to}`,
      ],
      signature: true,
      sections,
      tables,
    };
  }, [visible, shopParams, from, to, branchId, filters, t, error]);

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={FileBarChart2}
        accent="indigo"
        title={t('reportsHub') || 'Reports Hub'}
        subtitle={t('reportsHubSub') || 'Module-wise consolidated reports — incomings, outgoings, recovery & dues'}
        action={
          <ReportActions
            getReport={buildCombinedReport}
            label
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
      />

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {t('allModulesReportHint')
          || 'Print / PDF exports every module you can access, using the date range and branch/godown filter above.'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {visible.map(m => {
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => navigate(m.path)}
              className="glass-card p-5 text-start transition-all group hover:bg-white/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`p-2.5 rounded-lg bg-white/5 ${m.accent}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <ChevronRight className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-muted)' }} />
              </div>
              <h3 className="mt-4 font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                {t(m.titleKey) || m.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {m.descKey ? (t(m.descKey) || m.desc) : m.desc}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
