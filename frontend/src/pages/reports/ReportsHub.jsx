import { useNavigate } from 'react-router-dom';
import {
  FileBarChart2, TrendingUp, Package, ShoppingCart, Users, Building2,
  CreditCard, Receipt, Crown, BookOpen, ChevronRight,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/ui/PageHeader';

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
    ready: true,
  },
  {
    key: 'purchases',
    titleKey: 'purchaseOrders',
    title: 'Purchases',
    desc: 'Stock received, supplier payables & payments — coming next',
    icon: ShoppingCart,
    accent: 'text-indigo-400',
    path: null,
    module: 'purchases',
    ready: false,
  },
  {
    key: 'inventory',
    titleKey: 'stock',
    title: 'Inventory',
    desc: 'Stock on hand, movements & valuation — coming next',
    icon: Package,
    accent: 'text-blue-400',
    path: null,
    module: 'inventory',
    ready: false,
  },
  {
    key: 'customers',
    titleKey: 'customers',
    title: 'Customers',
    desc: 'Receivables aging & statements — coming next',
    icon: Users,
    accent: 'text-cyan-400',
    path: null,
    module: 'customers',
    ready: false,
  },
  {
    key: 'suppliers',
    titleKey: 'suppliers',
    title: 'Suppliers',
    desc: 'Payables aging & statements — coming next',
    icon: Building2,
    accent: 'text-amber-400',
    path: null,
    module: 'suppliers',
    ready: false,
  },
  {
    key: 'expenses',
    titleKey: 'expenses',
    title: 'Expenses',
    desc: 'Outgoings by category — coming next',
    icon: Receipt,
    accent: 'text-rose-400',
    path: null,
    module: 'expenses',
    ready: false,
  },
  {
    key: 'accounting',
    titleKey: 'accounting',
    title: 'Accounting',
    desc: 'Trial balance, P&L, balance sheet, cash flow',
    icon: BookOpen,
    accent: 'text-violet-400',
    path: '/reports/trial-balance',
    module: 'reports',
    ready: true,
  },
  {
    key: 'board',
    titleKey: 'boardOfDirectors',
    title: 'Board / Capital',
    desc: 'Director balances — coming next',
    icon: Crown,
    accent: 'text-yellow-400',
    path: null,
    module: 'board_directors',
    ready: false,
  },
];

export default function ReportsHub() {
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { can } = useAuth();
  const isRTL = lang === 'ur';

  const visible = MODULES.filter(m => !m.module || can(m.module, 'read'));

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={FileBarChart2}
        accent="indigo"
        title={t('reportsHub') || 'Reports Hub'}
        subtitle={t('reportsHubSub') || 'Module-wise consolidated reports — incomings, outgoings, recovery & dues'}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {visible.map(m => {
          const Icon = m.icon;
          const disabled = !m.ready || !m.path;
          return (
            <button
              key={m.key}
              type="button"
              disabled={disabled}
              onClick={() => m.path && navigate(m.path)}
              className="glass-card p-5 text-start transition-all group disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-white/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`p-2.5 rounded-lg bg-white/5 ${m.accent}`}>
                  <Icon className="w-5 h-5" />
                </div>
                {m.ready ? (
                  <ChevronRight className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-muted)' }} />
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                    {t('comingSoon') || 'Soon'}
                  </span>
                )}
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

      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <CreditCard className="w-4 h-4 text-indigo-400" />
          <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('financialStatements') || 'Financial Statements'}
          </h4>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { to: '/reports/trial-balance', label: t('trialBalance') || 'Trial Balance' },
            { to: '/reports/profit-and-loss', label: t('plStatement') || 'Profit & Loss' },
            { to: '/reports/balance-sheet', label: t('balanceSheet') || 'Balance Sheet' },
            { to: '/reports/equity-statement', label: t('equityStatement') || 'Equity' },
            { to: '/reports/cash-flow', label: t('cashFlowStatement') || 'Cash Flow' },
          ].map(link => (
            <button
              key={link.to}
              type="button"
              onClick={() => navigate(link.to)}
              className="btn-secondary text-xs"
            >
              {link.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
