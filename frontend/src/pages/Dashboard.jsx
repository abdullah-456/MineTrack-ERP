import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useShopApi, formatQty } from '../hooks/useShopApi';
import ReportActions from '../components/ui/ReportActions';
import ReportFilters, { filterByDate } from '../components/ui/ReportFilters';
import { money } from '../utils/reportExport';
import api from '../api/axios';
import {
  Package, AlertTriangle,
  ShoppingCart, DollarSign, ArrowUpRight,
  ArrowDownRight, Loader2, RefreshCw,
  TrendingUp, Wallet, Banknote
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts';

const POLL_MS = 30000;

function StatCard({ title, value, sub, icon: Icon, change, color, prefix = '', onClick }) {
  const isUp = change !== undefined && parseFloat(change) > 0;
  return (
    <div
      className={`stat-card animate-fade-in ${onClick ? 'cursor-pointer hover:scale-[1.02] transition-transform' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>
            {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {prefix}{typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{title}</p>
        {sub && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label, t }) {
  if (active && payload && payload.length) {
    return (
      <div className="glass-card px-3 py-2 text-xs">
        <p className="mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</p>
        {payload.map(p => (
          <p key={p.name} style={{ color: p.color }} className="font-semibold">
            {p.name}: Rs. {p.value.toLocaleString()}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { t, lang, theme } = useTheme();
  const { shopParams } = useShopApi();

  const [stats, setStats] = useState({ today_total: 0, today_orders: 0, low_stock_count: 0, sales_change: 0 });
  const [weeklyChart, setWeeklyChart] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [balances, setBalances] = useState(null);
  const [moneyFlow, setMoneyFlow] = useState({ total_received: 0, total_spent: 0, net: 0 });
  const [inventoryTotals, setInventoryTotals] = useState({});
  const [allExpenses, setAllExpenses] = useState([]);
  const [reportRange, setReportRange] = useState({ from: '', to: '' });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [salesRes, balancesRes, invRes, expRes, flowRes] = await Promise.all([
        api.get('/sales/stats', { params: shopParams() }),
        api.get('/balances').catch(() => ({ data: null })),
        api.get('/inventory/summary', { params: shopParams() }).catch(() => ({ data: { totals: {} } })),
        api.get('/expenses', { params: shopParams() }).catch(() => ({ data: { expenses: [] } })),
        api.get('/money-flow', { params: { ...shopParams(), from: reportRange.from || undefined, to: reportRange.to || undefined } })
          .catch(() => ({ data: { total_received: 0, total_spent: 0, net: 0 } })),
      ]);
      setInventoryTotals(invRes.data?.totals || {});
      setAllExpenses(expRes.data?.expenses || []);
      setMoneyFlow(flowRes.data || { total_received: 0, total_spent: 0, net: 0 });

      const d = salesRes.data;
      setStats(d.stats || {});
      setWeeklyChart(d.weekly_chart || []);
      setRecentSales((d.recent_sales || []).map(s => ({
        id: s.invoice_number,
        customer: s.Customer?.name || t('walkIn'),
        amount: parseFloat(s.total),
        type: s.sale_type,
        status: s.status,
      })));
      setLowStock((d.low_stock || []).map(row => ({
        name: row.Product?.name,
        sku: row.Product?.sku,
        stock: row.quantity_on_hand,
        reorder: row.Product?.reorder_level || 5,
      })));
      if (balancesRes.data) setBalances(balancesRes.data);
      setLastUpdated(d.fetched_at ? new Date(d.fetched_at) : new Date());
    } catch {
      // keep previous data on silent refresh failure
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [shopParams, t, reportRange.from, reportRange.to]);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(() => loadDashboard(true), POLL_MS);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  const hr = new Date().getHours();
  const greeting = hr < 12 ? t('goodMorning') : hr < 17 ? t('goodAfternoon') : t('goodEvening');

  // Business-wide money in/out is financial data — show only to admin & accountant,
  // matching the admin-only cash/bank balance pills.
  const showMoneyFlow = ['admin', 'accountant'].includes(user?.role);

  const roleLabels = {
    super_admin: t('roleSuperAdmin'),
    admin:       t('roleAdmin'),
    accountant:  t('roleAccountant'),
    user:        t('roleUser'),
  };

  const axisColor   = theme === 'dark' ? '#64748b' : '#94a3b8';
  const gridColor   = theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';

  const chartData = weeklyChart.length > 0 ? weeklyChart : [{ day: '—', sales: 0, purchases: 0 }];

  // ── Comprehensive dashboard report (respects the date range for expenses) ────
  const rangedExpenses = filterByDate(allExpenses, 'expense_date', reportRange.from, reportRange.to);
  const rangedExpenseTotal = rangedExpenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const rangeLabel = reportRange.from || reportRange.to
    ? `${reportRange.from || '…'} → ${reportRange.to || '…'}`
    : (t('allTime') || 'All time');

  const buildDashboardReport = () => ({
    kind: 'detail',
    title: t('businessSummary') || 'Business Summary Report',
    filename: 'dashboard-report.pdf',
    meta: [`${t('filters') || 'Range'}: ${rangeLabel}`],
    sections: [
      {
        heading: t('salesSummary') || 'Sales & Revenue',
        rows: [
          { label: t('todaySales') || "Today's Sales", value: money(stats.today_total) },
          { label: t('ordersToday') || 'Orders Today', value: String(stats.today_orders || 0) },
          { label: t('weekSales') || 'This Week Sales', value: money(stats.week_sales_total) },
          { label: (t('ordersThisWeek') || 'Orders This Week'), value: String(stats.week_orders || 0) },
        ],
      },
      {
        heading: t('cashAndBank') || 'Cash & Bank',
        rows: [
          { label: t('cashInHand') || 'Cash in Hand', value: money(balances?.cash_in_hand) },
          { label: t('bankBalance') || 'Bank Balance', value: money(balances?.bank_balance) },
        ],
      },
      {
        heading: `${t('moneyFlow') || 'Money Flow'} (${rangeLabel})`,
        rows: [
          { label: t('totalReceived') || 'Total Received', value: money(moneyFlow.total_received) },
          { label: t('totalSpent') || 'Total Spent', value: money(moneyFlow.total_spent) },
        ],
      },
      {
        heading: t('inventory') || 'Inventory',
        rows: [
          { label: t('totalProducts') || 'Total Products', value: String(inventoryTotals.total_products || 0) },
          { label: t('totalStock') || 'Total Stock Units', value: formatQty(inventoryTotals.total_units || 0) },
          { label: t('stockValue') || 'Stock Value', value: money(inventoryTotals.total_value) },
          { label: t('lowStockItems') || 'Low Stock Items', value: String(inventoryTotals.low_stock_count || stats.low_stock_count || 0) },
        ],
      },
      {
        heading: t('expenses') || 'Expenses',
        rows: [
          { label: `${t('totalExpenses') || 'Total Expenses'} (${rangeLabel})`, value: money(rangedExpenseTotal) },
          { label: t('expenseCount') || 'Expense Entries', value: String(rangedExpenses.length) },
        ],
      },
    ],
    tables: [
      {
        heading: t('recentSales') || 'Recent Sales',
        columns: [
          { header: t('invoiceNo') || 'Invoice #', render: r => r.id, width: 1.4 },
          { header: t('customer') || 'Customer', render: r => r.customer, width: 1.6 },
          { header: t('saleType') || 'Type', render: r => t(r.type) || r.type, width: 1 },
          { header: t('total') || 'Total', render: r => money(r.amount), align: 'right', width: 1.1 },
        ],
        rows: recentSales,
      },
      {
        heading: t('lowStockAlerts') || 'Low Stock Alerts',
        columns: [
          { header: t('name') || 'Product', render: r => r.name, width: 2 },
          { header: t('sku') || 'SKU', render: r => r.sku, width: 1.2 },
          { header: t('currentStock') || 'Stock', render: r => r.stock, qty: true, align: 'right', width: 1 },
          { header: t('reorderLevel') || 'Reorder', render: r => r.reorder, align: 'right', width: 1 },
        ],
        rows: lowStock,
      },
    ],
    signature: true,
  });

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {greeting},{' '}
            <span className="text-gradient">{user?.name?.split(' ')[0]}</span> 👋
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {roleLabels[user?.role]} &mdash;{' '}
            {new Date().toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Balance Pills — cash & bank shown inline next to Updated-at */}
          {balances && user?.role === 'admin' && (
            <>
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{
                  background: 'rgba(16,185,129,0.10)',
                  border: '1px solid rgba(16,185,129,0.25)',
                  color: 'rgb(16,185,129)',
                }}
                title="Live cash in hand (today's opening + cash collected - cash refunds)"
              >
                <Wallet className="w-3.5 h-3.5" />
                Cash: Rs. {(balances.cash_in_hand || 0).toLocaleString()}
              </div>
              {(balances.bank_balance > 0 || (balances.bank_accounts?.length > 0)) && (
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{
                    background: 'rgba(99,102,241,0.10)',
                    border: '1px solid rgba(99,102,241,0.25)',
                    color: 'rgb(99,102,241)',
                  }}
                  title={balances.bank_accounts?.map(a => `${a.name}: Rs. ${a.balance?.toLocaleString()}`).join(' | ')}
                >
                  <Banknote className="w-3.5 h-3.5" />
                  Bank: Rs. {(balances.bank_balance || 0).toLocaleString()}
                </div>
              )}
            </>
          )}
          {lastUpdated && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('lastUpdated')}: {lastUpdated.toLocaleTimeString(lang === 'ur' ? 'ur-PK' : 'en-PK')}
            </span>
          )}
          <ReportActions getReport={buildDashboardReport} />
          <button
            type="button"
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            className="topbar-btn flex items-center gap-1.5 text-xs"
            title={t('refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {t('live')}
          </button>
        </div>
      </div>

      {/* Report date range — applies to the expense totals in the printable summary */}
      <div className="glass-card p-3">
        <ReportFilters
          value={reportRange}
          onChange={(k, v) => setReportRange(f => ({ ...f, [k]: v }))}
          onClear={() => setReportRange({ from: '', to: '' })}
        />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('todaySales')}    value={stats.today_total || 0}  prefix="Rs. "
          change={stats.sales_change} icon={DollarSign}   color="bg-brand-500/20 text-brand-500"
        />
        <StatCard
          title={t('ordersToday')}   value={stats.today_orders || 0}
          icon={ShoppingCart} color="bg-emerald-500/20 text-emerald-500"
        />
        <StatCard
          title={t('lowStockItems')} value={stats.low_stock_count || 0}
          icon={AlertTriangle} color="bg-red-500/20 text-red-500"
        />
      </div>

      {/* Second Stats Row */}
      <div className={`grid grid-cols-1 gap-4 ${showMoneyFlow ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <StatCard
          title={t('weekSales')}
          value={stats.week_sales_total || 0}
          prefix="Rs. "
          sub={`${stats.week_orders || 0} ${t('ordersThisWeek')}`}
          icon={TrendingUp}
          color="bg-indigo-500/20 text-indigo-500"
        />
        {showMoneyFlow && (
          <>
            <StatCard
              title={t('totalReceived')}
              value={moneyFlow.total_received || 0}
              prefix="Rs. "
              sub={reportRange.from || reportRange.to ? rangeLabel : (t('allTime') || 'All time')}
              icon={Wallet}
              color="bg-emerald-500/20 text-emerald-500"
            />
            <StatCard
              title={t('totalSpent')}
              value={moneyFlow.total_spent || 0}
              prefix="Rs. "
              sub={reportRange.from || reportRange.to ? rangeLabel : (t('allTime') || 'All time')}
              icon={Banknote}
              color="bg-red-500/20 text-red-500"
            />
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('weeklyPerformance')}</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('salesVsPurchases')}</p>
            </div>
            <span className="badge badge-blue">{t('sevenDays')}</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gPurchases" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="day" tick={{ fill: axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false}
                     tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip t={t} />} />
              <Area type="monotone" dataKey="sales"     stroke="#6366f1" strokeWidth={2} fill="url(#gSales)"     name={t('salesTooltip')} />
              <Area type="monotone" dataKey="purchases" stroke="#a855f7" strokeWidth={2} fill="url(#gPurchases)" name={t('purchasesTooltip')} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-5">
          <div className="mb-5">
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('salesByDay')}</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('revenueBreakdown')}</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="day" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={<CustomTooltip t={t} />} />
              <Bar dataKey="sales" fill="#6366f1" radius={[6, 6, 0, 0]} name={t('salesTooltip')} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Sales */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('recentSales')}</h2>
            <Link to="/sales" className="text-brand-500 hover:text-brand-400 text-xs font-medium transition-colors">
              {t('viewAll')}
            </Link>
          </div>
          <div className="space-y-0">
            {recentSales.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>{t('noSales')}</p>
            ) : recentSales.map((sale, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 last:border-0"
                   style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="w-8 h-8 rounded-lg bg-brand-600/20 flex items-center justify-center flex-shrink-0">
                  <ShoppingCart className="w-3.5 h-3.5 text-brand-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{sale.customer}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{sale.id} &bull; {t(sale.type) || sale.type}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Rs. {sale.amount.toLocaleString()}</p>
                  <span className={`badge ${sale.status === 'completed' ? 'badge-green' : 'badge-yellow'}`}>
                    {t(sale.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Low Stock */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('lowStockAlerts')}</h2>
            <span className="badge badge-red">{t('actionNeeded')}</span>
          </div>
          <div className="space-y-3">
            {lowStock.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>{t('inStock')}</p>
            ) : lowStock.map((item, i) => (
              <div key={i}
                className="flex items-center gap-3 p-3 rounded-xl border border-red-500/10 hover:border-red-500/30 transition-all"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <Package className="w-3.5 h-3.5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.sku}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-lg font-bold ${item.stock === 0 ? 'text-red-500' : 'text-yellow-500'}`}>
                    {formatQty(item.stock)} {t('kg') || 'kg'}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>/ {item.reorder} min</p>
                </div>
              </div>
            ))}
            {lowStock.length > 0 && (
              <div className="pt-2 flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                <span>{lowStock.filter(i => i.stock === 0).length} {t('outOfStock')}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
