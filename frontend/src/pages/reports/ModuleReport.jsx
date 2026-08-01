import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  TrendingUp, Loader2, ArrowLeft, ArrowDownCircle, ArrowUpCircle,
  Wallet, Users, RefreshCw, RotateCcw, ExternalLink, Package,
  ShoppingCart, Building2, Receipt, BookOpen, UserCheck, Crown,
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

function resolveOpen(row) {
  if (!row) return null;
  if (row.open?.type && row.open?.id != null) return row.open;
  if (row.sale_open?.type && row.sale_open?.id != null) return row.sale_open;
  if (row.purchase_order_open?.type && row.purchase_order_open?.id != null) return row.purchase_order_open;
  if (row.customer_id) return { type: 'customer', id: row.customer_id };
  if (row.supplier_id) return { type: 'supplier', id: row.supplier_id };
  if (row.employee_id) return { type: 'employee', id: row.employee_id };
  if (row.board_member_id || row.member_id) return { type: 'board_member', id: row.board_member_id || row.member_id };
  if (row.product_id) return { type: 'product', id: row.product_id };
  if (row.voucher_id) return { type: 'voucher', id: row.voucher_id };
  if (row.related_sale_id) return { type: 'sale', id: row.related_sale_id };
  if (row.purchase_order_id) return { type: 'purchase_order', id: row.purchase_order_id };
  if (row.purchase_invoice_id) return { type: 'purchase_invoice', id: row.purchase_invoice_id };
  return null;
}

function openRecord(target, shopId) {
  if (!target?.type || target.id == null) return;
  const qs = shopId ? `?shop_id=${shopId}` : '';
  const id = target.id;
  const routes = {
    customer: `/customers/${id}`,
    supplier: `/suppliers/${id}`,
    employee: `/employees/${id}`,
    board_member: `/admin/board-of-directors/${id}/ledger`,
    voucher: `/vouchers/${id}`,
    sale: `/invoice/sale-${id}${qs}`,
    purchase_invoice: `/invoice/purchase-${id}${qs}`,
    purchase_order: `/purchase-order/${id}`,
    product: `/inventory`,
    grn: `/purchase-orders`,
  };
  const url = routes[target.type];
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

const TONE = {
  green: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  red: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  violet: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
};

const ICONS = {
  ArrowDownCircle, ArrowUpCircle, Wallet, Users, RefreshCw, RotateCcw,
  TrendingUp, Package, ShoppingCart, Building2, Receipt, BookOpen, UserCheck, Crown,
};

// entityParam/entityLabelKey/entityOptionsKey drive the "narrow to one X" filter
// generically — see the effect below that fetches each module's own
// filter-options endpoint. `accounting` uses `staticEntityOptions` instead of a
// fetch: voucher type is a fixed enum, not a lookup table.
const VOUCHER_TYPES = ['payment', 'receipt', 'journal', 'contra', 'opening', 'closing'];

const MODULE_META = {
  purchases: {
    titleKey: 'purchasesSummaryReport', title: 'Purchases Report',
    subKey: 'purchasesReportSub', sub: 'Stock received, payments, credit purchases & supplier payables',
    icon: ShoppingCart, accent: 'indigo', endpoint: '/reports/modules/purchases/summary', perm: 'purchases',
    entityParam: 'supplier_id', entityLabelKey: 'supplier', optionsEndpoint: '/reports/modules/purchases/filter-options', entityOptionsKey: 'suppliers',
  },
  inventory: {
    titleKey: 'inventorySummaryReport', title: 'Inventory Report',
    subKey: 'inventoryReportSub', sub: 'Stock movements, on-hand value & low stock',
    icon: Package, accent: 'blue', endpoint: '/reports/modules/inventory/summary', perm: 'inventory',
    entityParam: 'product_id', entityLabelKey: 'product', optionsEndpoint: '/reports/modules/inventory/filter-options', entityOptionsKey: 'products',
  },
  customers: {
    titleKey: 'customersSummaryReport', title: 'Customers Report',
    subKey: 'customersReportSub', sub: 'Charges, recoveries, returns & receivables',
    icon: Users, accent: 'cyan', endpoint: '/reports/modules/customers/summary', perm: 'customers',
    entityParam: 'customer_id', entityLabelKey: 'customer', optionsEndpoint: '/reports/modules/customers/filter-options', entityOptionsKey: 'customers',
  },
  suppliers: {
    titleKey: 'suppliersSummaryReport', title: 'Suppliers Report',
    subKey: 'suppliersReportSub', sub: 'Stock in, payments out, payables & advances',
    icon: Building2, accent: 'amber', endpoint: '/reports/modules/suppliers/summary', perm: 'suppliers',
    entityParam: 'supplier_id', entityLabelKey: 'supplier', optionsEndpoint: '/reports/modules/suppliers/filter-options', entityOptionsKey: 'suppliers',
  },
  expenses: {
    titleKey: 'expensesSummaryReport', title: 'Expenses Report',
    subKey: 'expensesReportSub', sub: 'Cash and bank outgoings by category',
    icon: Receipt, accent: 'rose', endpoint: '/reports/modules/expenses/summary', perm: 'expenses',
    entityParam: 'category', entityLabelKey: 'category', optionsEndpoint: '/reports/modules/expenses/filter-options', entityOptionsKey: 'categories',
  },
  accounting: {
    titleKey: 'accountingSummaryReport', title: 'Accounting Report',
    subKey: 'accountingReportSub', sub: 'Receipts, payments, journals & voucher activity',
    icon: BookOpen, accent: 'violet', endpoint: '/reports/modules/accounting/summary', perm: 'accounting',
    entityParam: 'voucher_type', entityLabelKey: 'voucherType',
    staticEntityOptions: VOUCHER_TYPES.map(v => ({ id: v, name: v })),
  },
  employees: {
    titleKey: 'employeesSummaryReport', title: 'Employees / HR Report',
    subKey: 'employeesReportSub', sub: 'Salary, advances, loans, recoveries & dues',
    icon: UserCheck, accent: 'teal', endpoint: '/reports/modules/employees/summary', perm: 'employees',
    entityParam: 'employee_id', entityLabelKey: 'employee', optionsEndpoint: '/reports/modules/employees/filter-options', entityOptionsKey: 'employees',
  },
  board: {
    titleKey: 'boardSummaryReport', title: 'Board / Capital Report',
    subKey: 'boardReportSub', sub: 'Contributions, withdrawals & member balances',
    icon: Crown, accent: 'yellow', endpoint: '/reports/modules/board/summary', perm: 'board_directors',
    entityParam: 'board_member_id', entityLabelKey: 'boardMember', optionsEndpoint: '/reports/modules/board/filter-options', entityOptionsKey: 'board_members',
  },
};

function cellValue(col, row, lang) {
  if (col.render === 'date' || /date|_at$/i.test(col.key || '')) return shortDate(row[col.key]);
  if (col.render === 'qty' || col.qty) return formatQty(row[col.key]);
  if (col.money) return formatPKR(row[col.key], lang);
  const v = row[col.key];
  return v == null || v === '' ? '—' : String(v);
}

function FlowCard({ card, lang, onClick }) {
  const toneClass = TONE[card.tone] || TONE.blue;
  const Icon = ICONS[card.icon] || Wallet;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-start w-full transition-all hover:scale-[1.01] hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 cursor-pointer ${toneClass.split(' ').slice(1).join(' ')}`}
      title="Click to view breakdown"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 ${toneClass.split(' ')[0]}`} />
          <span className="text-xs font-semibold uppercase tracking-wide truncate" style={{ color: 'var(--text-muted)' }}>{card.title}</span>
        </div>
        <ExternalLink className={`w-3.5 h-3.5 shrink-0 opacity-50 ${toneClass.split(' ')[0]}`} />
      </div>
      {/* A real zero must read as "Rs. 0", not the same dash a genuinely
          missing figure would show — otherwise a quiet day looks identical
          to a card that failed to fetch. */}
      <div className={`text-xl font-bold ${toneClass.split(' ')[0]}`}>{formatPKROrZero(card.amount, lang)}</div>
      {card.extra && <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{card.extra}</p>}
      {card.hint && <p className="mt-2 text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>{card.hint}</p>}
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide opacity-70" style={{ color: 'var(--text-muted)' }}>
        View breakdown →
      </p>
    </button>
  );
}

function DataTable({ columns = [], rows = [], totals, lang, shopId, emptyLabel }) {
  const moneyKey = columns.length ? columns[columns.length - 1].key : null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
            {columns.map(col => (
              <th key={col.key} className={`p-3 ${col.align === 'right' || col.money ? 'text-end' : 'text-start'}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const target = resolveOpen(row);
            const clickable = !!target;
            return (
              <tr
                key={row.id ?? `${idx}-${row[columns[0]?.key] || ''}`}
                style={{ borderTop: '1px solid var(--border-subtle)' }}
                className={clickable ? 'hover:bg-white/5 cursor-pointer' : ''}
                onClick={() => clickable && openRecord(target, shopId)}
                title={clickable ? 'Open related record' : undefined}
              >
                {columns.map((col, ci) => (
                  <td
                    key={col.key}
                    className={`p-3 ${col.align === 'right' || col.money ? 'text-end' : 'text-start'} ${col.money ? 'font-medium text-emerald-400' : ''} ${clickable && ci === 0 ? 'text-indigo-400 font-medium' : ''}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {cellValue(col, row, lang)}
                      {clickable && ci === 0 && <ExternalLink className="w-3 h-3 opacity-60" />}
                    </span>
                  </td>
                ))}
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <td colSpan={columns.length || 1} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
        {totals && rows.length > 0 && (
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
              {columns.map((col, i) => (
                <td key={col.key} className={`p-3 font-bold ${col.align === 'right' || col.money ? 'text-end text-emerald-400' : 'text-start'}`}>
                  {i === 0
                    ? (totals.__label || 'Total')
                    : (totals[col.key] != null
                      ? (col.money ? formatPKR(totals[col.key], lang) : totals[col.key])
                      : (moneyKey && col.key === moneyKey && totals[moneyKey] == null && totals.__amount != null
                        ? formatPKR(totals.__amount, lang)
                        : ''))}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export default function ModuleReport({ moduleKey: moduleKeyProp }) {
  const { moduleKey: paramKey } = useParams();
  const moduleKey = moduleKeyProp || paramKey;
  const meta = MODULE_META[moduleKey];
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { error } = useToast();
  const { shopParams, shopId, branches } = useShopApi();
  const isRTL = lang === 'ur';

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState('');
  const [entityId, setEntityId] = useState('');
  const [entityOptions, setEntityOptions] = useState(null);
  const [tab, setTab] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [cardModal, setCardModal] = useState(null);

  // Switching modules means switching what the entity filter even means
  // (Supplier on Purchases vs Employee on Employees) — reset both the
  // selection and the stale options list rather than carrying one module's
  // picked id into another's differently-shaped query param.
  useEffect(() => {
    setEntityId('');
    if (!meta) { setEntityOptions(null); return; }
    if (meta.staticEntityOptions) { setEntityOptions(meta.staticEntityOptions); return; }
    if (!meta.optionsEndpoint) { setEntityOptions(null); return; }
    let cancelled = false;
    api.get(meta.optionsEndpoint, { params: shopParams() })
      .then(({ data: res }) => { if (!cancelled) setEntityOptions(res[meta.entityOptionsKey] || []); })
      .catch(() => { if (!cancelled) setEntityOptions([]); });
    return () => { cancelled = true; };
  }, [meta, shopParams]);

  const fetchReport = useCallback(async () => {
    if (!meta) return;
    setLoading(true);
    try {
      const params = { ...shopParams(), from, to };
      if (branchId) params.branch_id = branchId;
      if (entityId && meta.entityParam) params[meta.entityParam] = entityId;
      const { data: res } = await api.get(meta.endpoint, { params });
      setData(res);
      const firstTab = res.tabs?.[0]?.id || '';
      setTab((prev) => (res.tabs || []).some(tb => tb.id === prev) ? prev : firstTab);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [meta, shopParams, from, to, branchId, entityId, error, t]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const entityLabel = meta ? (t(meta.entityLabelKey) || meta.entityLabelKey) : undefined;
  const filters = buildReportFilterList({
    t, from, to, branchId, branches,
    entityLabel, entityValue: entityId, entityOptions,
  });

  const buildFullDocument = useCallback(() => {
    if (!data?.pdf || !meta) return null;
    return {
      kind: 'detail',
      title: data.pdf.title || t(meta.titleKey) || meta.title,
      filename: `${moduleKey}-report-${from}-to-${to}.pdf`,
      filters,
      signature: true,
      sections: data.pdf.sections || [],
      tables: data.pdf.tables || [],
    };
  }, [data, t, meta, moduleKey, from, to, filters]);

  if (!meta) {
    return (
      <div className="glass-card p-8 text-center" style={{ color: 'var(--text-muted)' }}>
        Unknown report module.
        <button type="button" className="btn-secondary mt-4" onClick={() => navigate('/reports')}>Back to hub</button>
      </div>
    );
  }

  const Icon = meta.icon;
  const activeTab = (data?.tabs || []).find(tb => tb.id === tab) || data?.tabs?.[0];
  const emptyLabel = t('noEntries') || 'No entries';

  const modalTotals = (() => {
    if (cardModal?.breakdown?.total == null) return null;
    const cols = cardModal.breakdown.columns || [];
    const lastKey = cols[cols.length - 1]?.key;
    if (!lastKey) return { __label: t('total') || 'Total', __amount: cardModal.breakdown.total };
    return { __label: t('total') || 'Total', [lastKey]: cardModal.breakdown.total };
  })();

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Icon}
        accent={meta.accent}
        title={t(meta.titleKey) || meta.title}
        subtitle={t(meta.subKey) || meta.sub}
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/reports')} className="btn-secondary flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />{t('reportsHub') || 'Reports Hub'}
            </button>
            <ReportActions getReport={buildFullDocument} label />
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
        entityLabel={entityLabel}
        entityValue={entityId}
        entityOptions={entityOptions}
        onEntityChange={setEntityId}
      />

      {loading && !data ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-400" /></div>
      ) : !data ? (
        <div className="glass-card p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noData') || 'No data'}</div>
      ) : (
        <>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              {t('moneyFlow') || 'Money flow'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {(data.cards || []).map(card => (
                <FlowCard key={card.key} card={card} lang={lang} onClick={() => setCardModal(card)} />
              ))}
            </div>
          </div>

          {(data.tabs || []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.tabs.map(tb => (
                <button
                  key={tb.id}
                  type="button"
                  onClick={() => setTab(tb.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === tb.id ? 'bg-indigo-500 text-white' : ''}`}
                  style={tab !== tb.id ? { background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' } : {}}
                >
                  {tb.label}
                </button>
              ))}
            </div>
          )}

          {activeTab && (
            <div className="glass-card overflow-hidden">
              <DataTable
                columns={activeTab.columns || []}
                rows={activeTab.rows || []}
                totals={activeTab.totals}
                lang={lang}
                shopId={shopId}
                emptyLabel={emptyLabel}
              />
            </div>
          )}
        </>
      )}

      {cardModal && (
        <Modal wide title={cardModal.title} onClose={() => setCardModal(null)}>
          {cardModal.hint && <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>{cardModal.hint}</p>}
          {cardModal.extra && <p className="text-sm mb-3 font-medium">{cardModal.extra}</p>}
          {!(cardModal.breakdown?.columns || []).length ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {cardModal.breakdown?.total != null
                ? `${t('total') || 'Total'}: ${formatPKR(cardModal.breakdown.total, lang)}`
                : emptyLabel}
            </p>
          ) : (
            <DataTable
              columns={cardModal.breakdown.columns}
              rows={cardModal.breakdown.rows || []}
              totals={modalTotals}
              lang={lang}
              shopId={shopId}
              emptyLabel={emptyLabel}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
