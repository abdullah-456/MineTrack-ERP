import { useState, useEffect, useCallback, useRef } from 'react';
import {
  RotateCcw, Search, Loader2, Plus, Trash2,
  Banknote, Repeat, XCircle, Printer, ChevronDown,
  User, Package, Hash, Eye,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useShopApi, formatPKR, formatQty } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import ReportActions from '../../components/ui/ReportActions';
import { money } from '../../utils/reportExport';
import api from '../../api/axios';

// ----- ProductDropdown: live-search dropdown for replacement products --------
function ProductDropdown({ onSelect, shopParams, error: showError, lang }) {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchProducts = useCallback(async (q) => {
    setLoading(true);
    try {
      const { data } = await api.get('/products', {
        params: { ...shopParams(), search: q || '', status: 'active' },
      });
      setProducts((data.products || []).slice(0, 12));
      setOpen(true);
    } catch {
      showError('Product search failed');
    } finally {
      setLoading(false);
    }
  }, [shopParams, showError]);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchProducts(val), 300);
  };

  const handleFocus = () => {
    if (!query && products.length === 0) fetchProducts('');
    else setOpen(true);
  };

  const select = (p) => {
    onSelect(p);
    setQuery('');
    setProducts([]);
    setOpen(false);
  };

  const inputStyle = {
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search
          className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--text-secondary)' }}
        />
        <input
          className="w-full pl-9 pr-9 py-2 rounded-lg text-sm outline-none"
          style={inputStyle}
          placeholder="Search product by name, SKU, or barcode..."
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          autoComplete="off"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading && (
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--text-secondary)' }} />
          )}
          <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
        </div>
      </div>

      {open && products.length > 0 && (
        <div
          className="absolute z-50 top-full mt-1.5 w-full rounded-xl shadow-2xl overflow-hidden border border-[var(--border-input)]"
          style={{
            backgroundColor: 'var(--bg-surface)',
            maxHeight: '280px',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
          }}
        >
          {products.map((p) => (
            <button
              key={p.id}
              className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-[var(--bg-hover)] transition-colors border-b last:border-b-0 border-[var(--border-subtle)]"
              onMouseDown={() => select(p)}
            >
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {p.name}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  SKU: {p.sku || '-'}
                  {p.barcode ? ` · Barcode: ${p.barcode}` : ''}
                </p>
              </div>
              <span
                className="text-sm font-bold ml-3 shrink-0"
                style={{ color: 'var(--text-primary)' }}
              >
                {formatPKR(p.sale_price, lang)}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && !loading && products.length === 0 && query && (
        <div
          className="absolute z-50 top-full mt-1.5 w-full rounded-xl px-4 py-3 text-sm text-center border border-[var(--border-input)]"
          style={{
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-secondary)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
          }}
        >
          No products match &quot;{query}&quot;
        </div>
      )}
    </div>
  );
}

// ----- Main component --------------------------------------------------------
export default function SalesReturns() {
  const { lang } = useTheme();
  const { success, error } = useToast();
  const { can } = useAuth();
  const { shopParams } = useShopApi();

  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Wizard state
  const [wizard, setWizard] = useState(false);

  // Step 1 — sale selection
  const [saleSearch, setSaleSearch] = useState('');
  const [allSales, setAllSales] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);

  // Step 2 — return details
  const [returnable, setReturnable] = useState(null);
  const [picked, setPicked] = useState({});
  const [mode, setMode] = useState('refund');
  const [refundMethod, setRefundMethod] = useState('cash');
  const [reason, setReason] = useState('');

  // Exchange state
  const [exchangeItems, setExchangeItems] = useState([]);
  const [settleMethod, setSettleMethod] = useState('cash');
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState(null);

  const saleDebounceRef = useRef(null);

  // ── Fetch existing returns list ─────────────────────────────────────────────
  const fetchReturns = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/returns', { params: { ...shopParams(), search } });
      setReturns(data.returns || []);
    } catch (e) {
      error(e.response?.data?.message || 'Failed to load returns');
    } finally {
      setLoading(false);
    }
  }, [shopParams, search, error]);

  useEffect(() => { fetchReturns(); }, [fetchReturns]);

  // ── Load sales for wizard step 1 ───────────────────────────────────────────
  const loadSales = useCallback(async (q) => {
    setLoadingSales(true);
    try {
      const params = { ...shopParams() };
      if (q && q.trim()) params.search = q.trim();
      const { data } = await api.get('/sales', { params });
      setAllSales(data.sales || []);
    } catch (e) {
      error(e.response?.data?.message || 'Failed to load sales');
    } finally {
      setLoadingSales(false);
    }
  }, [shopParams, error]);

  const openWizard = () => {
    setWizard(true);
    loadSales('');
  };

  const handleSaleSearch = (e) => {
    const val = e.target.value;
    setSaleSearch(val);
    clearTimeout(saleDebounceRef.current);
    saleDebounceRef.current = setTimeout(() => loadSales(val), 350);
  };

  // ── Step 2 helpers ──────────────────────────────────────────────────────────
  const loadReturnable = async (saleId) => {
    try {
      const { data } = await api.get(`/sales/${saleId}/returnable`, { params: shopParams() });
      setReturnable(data);
      setPicked({});
    } catch (e) {
      error(e.response?.data?.message || 'Could not load sale items');
    }
  };

  const setQty = (item, qty) => {
    const q = Math.max(0, Math.min(parseFloat(qty || 0), item.returnable_qty));
    setPicked((prev) => {
      const next = { ...prev };
      if (q > 0) next[item.sale_item_id] = q;
      else delete next[item.sale_item_id];
      return next;
    });
  };

  const returnedValue = (returnable?.items || []).reduce((sum, it) => {
    const q = picked[it.sale_item_id] || 0;
    const unit = it.refund_unit_price ?? it.unit_price;
    return sum + q * unit;
  }, 0);

  // ── Exchange helpers ────────────────────────────────────────────────────────
  const addExchangeItem = (product) => {
    setExchangeItems((prev) => {
      const existing = prev.find((x) => x.product.id === product.id);
      if (existing) {
        return prev.map((x) =>
          x.product.id === product.id ? { ...x, quantity: x.quantity + 1 } : x,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const exchangeTotal = exchangeItems.reduce(
    (s, x) => s + x.quantity * parseFloat(x.product.sale_price),
    0,
  );
  const settlement = Math.max(0, exchangeTotal - returnedValue);
  const exchangeBelowValue =
    mode === 'exchange' && exchangeItems.length > 0 && exchangeTotal < returnedValue;

  // ── Reset wizard ────────────────────────────────────────────────────────────
  const resetWizard = () => {
    setWizard(false);
    setSaleSearch('');
    setAllSales([]);
    setReturnable(null);
    setPicked({});
    setMode('refund');
    setRefundMethod('cash');
    setReason('');
    setExchangeItems([]);
    setSettleMethod('cash');
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const submit = async () => {
    const items = Object.entries(picked).map(([sale_item_id, quantity]) => ({
      sale_item_id: parseInt(sale_item_id, 10),
      quantity,
    }));
    if (!items.length) return error('Select at least one item to return');
    if (mode === 'exchange' && !exchangeItems.length)
      return error('Add at least one replacement product');
    if (exchangeBelowValue)
      return error('Exchange total cannot be less than the returned value');

    setSubmitting(true);
    try {
      const body = {
        sale_id: returnable.sale.id,
        return_type: mode,
        reason,
        items,
        ...(mode === 'refund'
          ? { refund_method: refundMethod }
          : {
              exchange_items: exchangeItems.map((x) => ({
                product_id: x.product.id,
                quantity: x.quantity,
              })),
              settlement_payment_method: settleMethod,
            }),
      };
      const { data } = await api.post('/returns', body, { params: shopParams() });
      success(
        mode === 'refund'
          ? `Return ${data.return.return_number} completed — refund ${formatPKR(data.return.refund_amount, lang)}`
          : `Exchange ${data.return.return_number} completed — new invoice ${data.return.ExchangeSale?.invoice_number}`,
      );
      resetWizard();
      fetchReturns();
      setDetail(data.return);
    } catch (e) {
      error(e.response?.data?.message || 'Return failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Void return ─────────────────────────────────────────────────────────────
  const voidReturn = async (ret) => {
    if (
      !window.confirm(
        `Void ${ret.return_number}? Restocked items will be removed from stock again.`,
      )
    )
      return;
    try {
      const res = await api.post(`/returns/${ret.id}/void`, {}, { params: shopParams() });
      success(res.status === 202 ? 'Deletion request submitted for admin approval.' : 'Return voided');
      fetchReturns();
    } catch (e) {
      error(e.response?.data?.message || 'Void failed');
    }
  };

  const inputCls = 'w-full px-3 py-2 rounded-lg text-sm outline-none';
  const inputStyle = {
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
  };

  const formatDate = (d) =>
    d
      ? new Date(d).toLocaleDateString('en-PK', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : '-';

  const getItemsSummary = (sale) => {
    const items = sale.SaleItems || [];
    if (!items.length) return '';
    return items.map((i) => i.Product?.name || 'Item').join(', ');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={RotateCcw}
        title="Sales Returns"
        subtitle="Refund sold items back into stock, or exchange them for products of equal or higher value"
        accent="rose"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title="Sales Returns"
              columns={[
                { header: 'Return #', key: 'return_number', width: 1.2 },
                { header: 'Date', render: r => new Date(r.return_date || r.created_at).toLocaleDateString('en-PK'), width: 1.1 },
                { header: 'Type', render: r => r.return_type, width: 0.9 },
                { header: 'Invoice', render: r => r.Sale?.invoice_number || '', width: 1.3 },
                { header: 'Customer', render: r => r.Customer?.name || 'Walk-in', width: 1.5 },
                { header: 'Returned Value', key: 'returned_value', money: true, width: 1.2 },
                { header: 'Refund/Settle', render: r => (r.return_type === 'refund' ? money(r.refund_amount) : money(r.settlement_amount)), align: 'right', width: 1.2 },
                { header: 'Status', key: 'status', width: 0.9 },
              ]}
              rows={returns}
              totals={{ __label: 'Total', returned_value: returns.reduce((s, r) => s + parseFloat(r.returned_value || 0), 0) }}
              filename="sales-returns.pdf"
            />
            {can('returns', 'create') && (
              <button className="btn-primary flex items-center gap-2" onClick={openWizard}>
                <Plus className="w-4 h-4" /> New Return
              </button>
            )}
          </div>
        }
      />

      {/* ── Returns list ── */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-secondary)' }}
            />
            <input
              className={`${inputCls} pl-9`}
              style={inputStyle}
              placeholder="Search return number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchReturns()}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : returns.length === 0 ? (
          <p className="text-center py-10 text-sm" style={{ color: 'var(--text-secondary)' }}>
            No returns yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
                  <th className="py-2 pr-4">Return #</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Original Invoice</th>
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4">Returned Value</th>
                  <th className="py-2 pr-4">Refund / Settlement</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody style={{ color: 'var(--text-primary)' }}>
                {returns.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <td className="py-3 pr-4 font-mono text-xs">{r.return_number}</td>
                    <td className="py-3 pr-4 capitalize">
                      <span className="inline-flex items-center gap-1">
                        {r.return_type === 'refund' ? (
                          <Banknote className="w-3.5 h-3.5" />
                        ) : (
                          <Repeat className="w-3.5 h-3.5" />
                        )}
                        {r.return_type}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">{r.Sale?.invoice_number}</td>
                    <td className="py-3 pr-4">{r.Customer?.name || 'Walk-in'}</td>
                    <td className="py-3 pr-4">{formatPKR(r.returned_value, lang)}</td>
                    <td className="py-3 pr-4">
                      {r.return_type === 'refund'
                        ? `Refund ${formatPKR(r.refund_amount, lang)}`
                        : `Paid ${formatPKR(r.settlement_amount, lang)} to ${r.ExchangeSale?.invoice_number || ''}`}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge
                        status={r.status === 'completed' ? 'active' : 'disabled'}
                        label={r.status}
                      />
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <button
                        className="icon-btn"
                        title="Print return invoice"
                        onClick={() => window.open(`/invoice/return-${r.id}?auto_print=1`, '_blank', 'noopener,noreferrer')}
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      <button className="icon-btn" title="View details" onClick={() => setDetail(r)}>
                        <Eye className="w-4 h-4" />
                      </button>
                      {can('returns', 'delete') &&
                        r.status === 'completed' &&
                        r.return_type === 'refund' && (
                          <button
                            className="icon-btn text-rose-400"
                            title="Void"
                            onClick={() => voidReturn(r)}
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── New Return wizard ── */}
      {wizard && (
        <Modal title="New Sales Return" onClose={resetWizard} wide>

          {/* Step 1: Choose a sale */}
          {!returnable && (
            <div className="space-y-4">
              <div>
                <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Search and select the original sale to process a return.
                </p>

                {/* Search hint pills */}
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {[
                    { icon: Hash, label: 'Invoice No.' },
                    { icon: User, label: 'Customer name / phone' },
                    { icon: Package, label: 'Product / item name' },
                  ].map(({ icon: Icon, label }) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <Icon className="w-3 h-3" /> {label}
                    </span>
                  ))}
                </div>

                {/* Search input */}
                <div className="relative">
                  <Search
                    className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--text-secondary)' }}
                  />
                  <input
                    autoFocus
                    className="w-full pl-9 pr-9 py-2.5 rounded-lg text-sm outline-none"
                    style={inputStyle}
                    placeholder="Search by invoice #, customer name, phone or product..."
                    value={saleSearch}
                    onChange={handleSaleSearch}
                  />
                  {loadingSales && (
                    <Loader2
                      className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--text-secondary)' }}
                    />
                  )}
                </div>
              </div>

              {/* Sales list */}
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  border: '1px solid var(--border-subtle)',
                  maxHeight: '380px',
                  overflowY: 'auto',
                }}
              >
                {loadingSales && allSales.length === 0 ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-secondary)' }} />
                  </div>
                ) : allSales.length === 0 ? (
                  <div
                    className="flex flex-col items-center py-10 gap-2"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Search className="w-8 h-8 opacity-30" />
                    <p className="text-sm">
                      No sales found{saleSearch ? ` for "${saleSearch}"` : ''}.
                    </p>
                  </div>
                ) : (
                  allSales.map((s, idx) => (
                    <button
                      key={s.id}
                      className="w-full text-left px-4 py-3 flex items-start gap-3 hover:opacity-80 transition-opacity border-b last:border-b-0"
                      style={{
                        borderColor: 'var(--border-subtle)',
                        backgroundColor: idx % 2 === 0 ? 'var(--bg-elevated)' : 'transparent',
                      }}
                      onClick={() => loadReturnable(s.id)}
                    >
                      <div className="flex-1 min-w-0">
                        {/* Invoice + type + date */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="font-mono text-xs font-semibold"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {s.invoice_number}
                          </span>
                          <span
                            className="text-xs px-1.5 py-0.5 rounded capitalize"
                            style={{
                              backgroundColor: 'var(--bg-card)',
                              color: 'var(--text-secondary)',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            {s.sale_type}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {formatDate(s.sale_date)}
                          </span>
                        </div>
                        {/* Customer */}
                        <div
                          className="mt-0.5 flex items-center gap-1 text-xs"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          <User className="w-3 h-3 shrink-0" />
                          <span>
                            {s.Customer?.name || 'Walk-in'}
                            {s.Customer?.phone ? ` · ${s.Customer.phone}` : ''}
                          </span>
                        </div>
                        {/* Items */}
                        {getItemsSummary(s) && (
                          <div
                            className="mt-0.5 flex items-start gap-1 text-xs"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            <Package className="w-3 h-3 shrink-0 mt-0.5" />
                            <span className="truncate max-w-sm">{getItemsSummary(s)}</span>
                          </div>
                        )}
                      </div>
                      {/* Total + status */}
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                          {formatPKR(s.total, lang)}
                        </p>
                        <p
                          className="text-xs mt-0.5 capitalize"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {s.status}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {!loadingSales && allSales.length > 0 && (
                <p className="text-xs text-right" style={{ color: 'var(--text-secondary)' }}>
                  Showing {allSales.length} sale{allSales.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}

          {/* Step 2: pick items + mode */}
          {returnable && (
            <div className="space-y-4">
              {/* Sale header */}
              <div
                className="flex items-center justify-between p-3 rounded-lg text-sm"
                style={inputStyle}
              >
                <div>
                  <span className="font-mono font-semibold">
                    {returnable.sale.invoice_number}
                  </span>
                  <span
                    className="ml-2 text-xs capitalize"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {returnable.sale.sale_type}
                  </span>
                </div>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {returnable.sale.customer?.name || 'Walk-in'}
                </span>
              </div>

              {/* Returnable items */}
              <div className="space-y-2">
                {returnable.items.map((it) => (
                  <div
                    key={it.sale_item_id}
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={inputStyle}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">{it.product_name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {formatPKR(it.refund_unit_price ?? it.unit_price, lang)}
                        {(it.refund_unit_price ?? it.unit_price) < it.unit_price && (
                          <span className="ms-1 line-through opacity-60">{formatPKR(it.unit_price, lang)}</span>
                        )}
                        {' · '}sold {formatQty(it.sold_qty)} kg · returnable{' '}
                        {formatQty(it.returnable_qty)} kg
                      </p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      max={it.returnable_qty}
                      className="w-24 px-2 py-1 rounded text-sm text-center"
                      style={inputStyle}
                      value={picked[it.sale_item_id] || ''}
                      placeholder="0"
                      disabled={it.returnable_qty === 0}
                      onChange={(e) => setQty(it, e.target.value)}
                    />
                  </div>
                ))}
              </div>

              {/* Returned value summary */}
              <div
                className="flex items-center justify-between p-3 rounded-lg"
                style={inputStyle}
              >
                <span className="text-sm">Returned value</span>
                <span className="font-bold">{formatPKR(returnedValue, lang)}</span>
              </div>

              {/* Mode toggle */}
              <div className="grid grid-cols-2 gap-2">
                {['refund', 'exchange'].map((m) => (
                  <button
                    key={m}
                    className={`p-3 rounded-lg text-sm flex items-center justify-center gap-2 border ${
                      mode === m ? 'border-brand-500' : ''
                    }`}
                    style={{
                      ...inputStyle,
                      borderColor: mode === m ? undefined : 'var(--border-subtle)',
                    }}
                    onClick={() => setMode(m)}
                  >
                    {m === 'refund' ? (
                      <Banknote className="w-4 h-4" />
                    ) : (
                      <Repeat className="w-4 h-4" />
                    )}
                    {m === 'refund' ? 'Refund (cash back)' : 'Exchange (same value or above)'}
                  </button>
                ))}
              </div>

              {/* Refund method */}
              {mode === 'refund' &&
                (returnable.sale.sale_type === 'credit' ? (
                  <p className="text-xs p-3 rounded-lg" style={inputStyle}>
                    This was a credit sale — the returned value will reduce
                    the customer&apos;s outstanding balance; any excess is refunded in cash.
                  </p>
                ) : (
                  <select
                    className={inputCls}
                    style={inputStyle}
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value)}
                  >
                    <option value="cash">Refund method — Cash</option>
                    <option value="card">Refund method — Card</option>
                    <option value="bank">Refund method — Bank</option>
                    <option value="mobile_wallet">Refund method — Mobile Wallet</option>
                  </select>
                ))}

              {/* Exchange product picker */}
              {mode === 'exchange' && (
                <div className="space-y-3">
                  <div>
                    <p
                      className="text-xs mb-1.5 font-medium"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Add replacement products
                    </p>
                    <ProductDropdown
                      onSelect={addExchangeItem}
                      shopParams={shopParams}
                      error={error}
                      lang={lang}
                    />
                  </div>

                  {/* Selected exchange items */}
                  {exchangeItems.length > 0 && (
                    <div className="space-y-2">
                      {exchangeItems.map((x, i) => (
                        <div
                          key={x.product.id}
                          className="flex items-center gap-3 p-2.5 rounded-lg"
                          style={inputStyle}
                        >
                          <span className="flex-1 text-sm">{x.product.name}</span>
                          <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            className="w-20 px-2 py-1 rounded text-sm text-center"
                            style={inputStyle}
                            value={x.quantity}
                            onChange={(e) => {
                              const q = Math.max(0.1, parseFloat(e.target.value || 1));
                              setExchangeItems((prev) =>
                                prev.map((y, j) => (j === i ? { ...y, quantity: q } : y)),
                              );
                            }}
                          />
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>kg</span>
                          <span className="text-sm w-28 text-right">
                            {formatPKR(x.quantity * x.product.sale_price, lang)}
                          </span>
                          <button
                            className="icon-btn text-rose-400"
                            onClick={() =>
                              setExchangeItems((prev) => prev.filter((_, j) => j !== i))
                            }
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Exchange summary */}
                  <div className="p-3 rounded-lg space-y-1 text-sm" style={inputStyle}>
                    <div className="flex justify-between">
                      <span>Exchange total</span>
                      <span>{formatPKR(exchangeTotal, lang)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Returned value (goods credit)</span>
                      <span>− {formatPKR(Math.min(returnedValue, exchangeTotal), lang)}</span>
                    </div>
                    <div
                      className="flex justify-between font-bold border-t pt-1"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <span>Customer pays</span>
                      <span>{formatPKR(settlement, lang)}</span>
                    </div>
                  </div>

                  {exchangeBelowValue && (
                    <p className="text-xs text-rose-400 p-2 rounded-lg border border-rose-500/40">
                      Exchange total is BELOW the returned value ({formatPKR(returnedValue, lang)}
                      ). Add more items — exchanges must be for the same value or above.
                    </p>
                  )}

                  {settlement > 0 && (
                    <select
                      className={inputCls}
                      style={inputStyle}
                      value={settleMethod}
                      onChange={(e) => setSettleMethod(e.target.value)}
                    >
                      <option value="cash">Difference paid by — Cash</option>
                      <option value="card">Difference paid by — Card</option>
                      <option value="bank">Difference paid by — Bank</option>
                      <option value="mobile_wallet">Difference paid by — Mobile Wallet</option>
                    </select>
                  )}
                </div>
              )}

              {/* Reason */}
              <input
                className={inputCls}
                style={inputStyle}
                placeholder="Reason (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />

              {/* Actions */}
              <div className="flex gap-2 justify-end pt-2">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setReturnable(null);
                    setPicked({});
                  }}
                >
                  ← Back to Sales
                </button>
                <button
                  className="btn-primary flex items-center gap-2"
                  disabled={
                    submitting || Object.keys(picked).length === 0 || exchangeBelowValue
                  }
                  onClick={submit}
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {mode === 'refund'
                    ? `Refund ${formatPKR(returnedValue, lang)}`
                    : 'Complete Exchange'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ── Return detail / slip ── */}
      {detail && (
        <Modal
          title={`Return Slip — ${detail.return_number}`}
          onClose={() => setDetail(null)}
          wide
        >
          <div className="space-y-3 text-sm" style={{ color: 'var(--text-primary)' }}>
            <div className="grid grid-cols-2 gap-2">
              <p>
                <span style={{ color: 'var(--text-secondary)' }}>Type: </span>
                {detail.return_type}
              </p>
              <p>
                <span style={{ color: 'var(--text-secondary)' }}>Date: </span>
                {new Date(detail.return_date).toLocaleString()}
              </p>
              <p>
                <span style={{ color: 'var(--text-secondary)' }}>Original invoice: </span>
                {detail.Sale?.invoice_number}
              </p>
              <p>
                <span style={{ color: 'var(--text-secondary)' }}>Customer: </span>
                {detail.Customer?.name || 'Walk-in'}
              </p>
              {detail.reason && (
                <p className="col-span-2">
                  <span style={{ color: 'var(--text-secondary)' }}>Reason: </span>
                  {detail.reason}
                </p>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
                  <th className="py-1">Item</th>
                  <th className="py-1 text-center">Qty</th>
                  <th className="py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(detail.ReturnItems || []).map((it) => (
                  <tr
                    key={it.id}
                    className="border-t"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <td className="py-1.5">{it.Product?.name || `#${it.product_id}`}</td>
                    <td className="py-1.5 text-center">{formatQty(it.quantity)} kg</td>
                    <td className="py-1.5 text-right">{formatPKR(it.line_total, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div
              className="p-3 rounded-lg space-y-1"
              style={{ backgroundColor: 'var(--bg-elevated)' }}
            >
              <div className="flex justify-between">
                <span>Returned value</span>
                <span className="font-bold">{formatPKR(detail.returned_value, lang)}</span>
              </div>
              {detail.return_type === 'refund' ? (
                <div className="flex justify-between">
                  <span>Refunded ({detail.refund_method})</span>
                  <span className="font-bold">{formatPKR(detail.refund_amount, lang)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span>Exchange invoice</span>
                    <span className="font-mono text-xs">
                      {detail.ExchangeSale?.invoice_number}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Customer paid (difference)</span>
                    <span className="font-bold">
                      {formatPKR(detail.settlement_amount, lang)}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2">
              {detail.ExchangeSale && (
                <a
                  className="btn-secondary"
                  href={`/invoice/sale-${detail.ExchangeSale.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open exchange invoice
                </a>
              )}
              <button
                className="btn-primary flex items-center gap-2"
                onClick={() => window.open(`/invoice/return-${detail.id}?auto_print=1`, '_blank', 'noopener,noreferrer')}
              >
                <Printer className="w-4 h-4" /> Print Invoice
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
