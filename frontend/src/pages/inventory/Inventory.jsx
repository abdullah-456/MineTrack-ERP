import { useState, useEffect, useCallback } from 'react';
import { Building2, Package, AlertTriangle, TrendingUp, Plus, Loader2, ArrowDownUp, RefreshCw, Eye, ListFilter } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR, formatQty } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import { StockBadge } from '../../components/ui/StatusBadge';
import ReportActions from '../../components/ui/ReportActions';
import api from '../../api/axios';

export default function Inventory() {
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams, branches } = useShopApi();
  const isRTL = lang === 'ur';

  // Sub-tabs: 'levels' or 'movements'
  const [activeTab, setActiveTab] = useState('levels');

  // Stock levels state
  const [summary, setSummary] = useState([]);
  const [totals, setTotals] = useState({});
  const [inventory, setInventory] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState('');

  // Movements state
  const [movements, setMovements] = useState([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [movementProductFilter, setMovementProductFilter] = useState('');
  const [movementBranchFilter, setMovementBranchFilter] = useState('');

  // Modals state
  const [modal, setModal] = useState(null); // 'receive' or 'adjust'
  const [saving, setSaving] = useState(false);

  // Form states
  const [formReceive, setFormReceive] = useState({
    product_id: '',
    branch_id: '',
    quantity: '',
    supplier_id: '',
    purchase_price: '',
    notes: '',
    payment_status: 'unpaid',
    paid_amount: '',
    payment_method: 'cash',
  });

  const [formAdjust, setFormAdjust] = useState({
    product_id: '',
    branch_id: '',
    quantity: '',
    direction: 'decrease', // 'increase' or 'decrease'
    reason: 'Physical Audit Correction', // Default reason
    notes: '',
  });

  // Fetch stock levels and products/suppliers
  const fetchData = useCallback(async () => {
    setLoading(true);
    // Independent requests (allSettled, not all): a role that can read stock
    // but not suppliers (e.g. cashier, or any custom role scoped to inventory
    // only) must still see stock levels — suppliers is only used for the
    // Receive Stock form's supplier dropdown.
    const params = { ...shopParams(), branch_id: branchFilter || undefined };
    const [sumRes, invRes, prodRes, supRes] = await Promise.allSettled([
      api.get('/inventory/summary', { params: shopParams() }),
      api.get('/inventory', { params }),
      api.get('/products', { params: shopParams() }),
      api.get('/suppliers', { params: shopParams() }),
    ]);
    if (sumRes.status === 'fulfilled') {
      setSummary(sumRes.value.data.summary || []);
      setTotals(sumRes.value.data.totals || {});
    } else {
      error(sumRes.reason?.response?.data?.message || t('toastErrorGeneric'));
    }
    if (invRes.status === 'fulfilled') {
      setInventory(invRes.value.data.inventory || []);
    } else {
      error(invRes.reason?.response?.data?.message || t('toastErrorGeneric'));
    }
    setProducts(prodRes.status === 'fulfilled' ? (prodRes.value.data.products || []) : []);
    setSuppliers(supRes.status === 'fulfilled' ? (supRes.value.data.suppliers || []) : []);
    setLoading(false);
  }, [shopParams, branchFilter, error, t]);

  // Fetch audit log movements
  const fetchMovements = useCallback(async () => {
    setLoadingMovements(true);
    try {
      const params = {
        ...shopParams(),
        product_id: movementProductFilter || undefined,
        branch_id: movementBranchFilter || undefined,
        limit: 100,
      };
      const { data } = await api.get('/inventory/movements', { params });
      setMovements(data.movements || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoadingMovements(false);
    }
  }, [shopParams, movementProductFilter, movementBranchFilter, error, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (activeTab === 'movements') {
      fetchMovements();
    }
  }, [activeTab, fetchMovements]);

  // Auto-fill cost price on product selection in receive form
  const handleProductChangeInReceive = (prodId) => {
    const p = products.find(x => String(x.id) === String(prodId));
    setFormReceive(f => ({
      ...f,
      product_id: prodId,
      purchase_price: p ? p.cost_price || '' : '',
    }));
  };

  // Quick action buttons from stock levels table
  const openReceiveQuick = (prodId, branchId) => {
    const p = products.find(x => String(x.id) === String(prodId));
    setFormReceive({
      product_id: String(prodId),
      branch_id: String(branchId),
      quantity: '',
      supplier_id: '',
      purchase_price: p ? p.cost_price || '' : '',
      notes: '',
      payment_status: 'unpaid',
      paid_amount: '',
      payment_method: 'cash',
    });
    setModal('receive');
  };

  const openAdjustQuick = (prodId, branchId) => {
    setFormAdjust({
      product_id: String(prodId),
      branch_id: String(branchId),
      quantity: '',
      direction: 'decrease',
      reason: 'Damaged / Broken Goods',
      notes: '',
    });
    setModal('adjust');
  };

  // Submit operations
  const submitReceive = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        product_id: parseInt(formReceive.product_id, 10),
        branch_id: parseInt(formReceive.branch_id, 10),
        quantity: parseFloat(formReceive.quantity),
        supplier_id: formReceive.supplier_id ? parseInt(formReceive.supplier_id, 10) : undefined,
        purchase_price: formReceive.purchase_price ? parseFloat(formReceive.purchase_price) : undefined,
        notes: formReceive.notes.trim() || undefined,
        ...shopParams(),
      };
      if (formReceive.supplier_id) {
        payload.payment_status = formReceive.payment_status;
        payload.payment_method = formReceive.payment_method;
        if (formReceive.payment_status === 'partial') {
          payload.paid_amount = parseFloat(formReceive.paid_amount) || 0;
        }
      } else {
        // No supplier — direct purchase; the full cost is deducted now from
        // the chosen account (only cash/bank are valid without a supplier).
        payload.payment_method = ['cash', 'bank'].includes(formReceive.payment_method)
          ? formReceive.payment_method
          : 'cash';
      }
      await api.post('/inventory/receive', payload);
      success(t('stockReceived') || 'Stock received successfully');
      setModal(null);
      fetchData();
      if (activeTab === 'movements') fetchMovements();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const submitAdjust = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        product_id: parseInt(formAdjust.product_id, 10),
        branch_id: parseInt(formAdjust.branch_id, 10),
        quantity: parseFloat(formAdjust.quantity),
        direction: formAdjust.direction,
        reason: formAdjust.reason,
        notes: formAdjust.notes.trim() || undefined,
        ...shopParams(),
      };
      await api.post('/inventory/adjust', payload);
      success(t('stockAdjusted') || 'Stock adjusted successfully');
      setModal(null);
      fetchData();
      if (activeTab === 'movements') fetchMovements();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const getMovementBadge = (type) => {
    const map = {
      purchase:   { bg: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20', label: 'Purchase/GRN' },
      sale:       { bg: 'bg-blue-500/10 text-blue-400 border border-blue-500/20', label: 'Sale' },
      adjustment: { bg: 'bg-amber-500/10 text-amber-400 border border-amber-500/20', label: 'Adjustment' },
      transfer:   { bg: 'bg-purple-500/10 text-purple-400 border border-purple-500/20', label: 'Transfer' },
      return:     { bg: 'bg-red-500/10 text-red-400 border border-red-500/20', label: 'Return' },
    };
    const s = map[type?.toLowerCase()] || { bg: 'bg-gray-500/10 text-gray-400 border border-gray-500/20', label: type };
    return <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${s.bg}`}>{s.label}</span>;
  };

  const statCards = [
    { label: t('totalProducts'), value: totals.total_products || 0, icon: Package, color: 'text-blue-400' },
    { label: t('totalStock'), value: formatQty(totals.total_units || 0, lang), icon: TrendingUp, color: 'text-emerald-400' },
    { label: t('stockValue'), value: formatPKR(totals.total_value, lang), icon: Building2, color: 'text-amber-400' },
    { label: t('lowStockItems'), value: totals.low_stock_count || 0, icon: AlertTriangle, color: 'text-red-400' },
  ];

  // ── Report model — reflects the active tab ──────────────────────────────────
  const report = activeTab === 'movements'
    ? {
        title: t('stockMovements') || 'Stock Movements',
        filename: 'stock-movements.pdf',
        columns: [
          { header: t('date') || 'Timestamp', render: m => new Date(m.created_at || m.createdAt).toLocaleString('en-PK'), width: 1.6 },
          { header: t('product') || 'Product', render: m => m.Product?.name || '', width: 1.8 },
          { header: t('userBranch') || 'Branch', render: m => m.Branch?.name || '', width: 1.1 },
          { header: t('type') || 'Type', render: m => m.ref_type || '', width: 1 },
          { header: t('quantity') || 'Qty', render: m => `${m.quantity > 0 ? '+' : ''}${formatQty(m.quantity)}`, align: 'right', width: 1 },
          { header: t('currentStock') || 'Balance', render: m => formatQty(m.balance_after), align: 'right', width: 1 },
        ],
        rows: movements,
        filters: [
          movementProductFilter ? { label: t('product') || 'Product', value: products.find(p => String(p.id) === String(movementProductFilter))?.name || movementProductFilter } : null,
          movementBranchFilter ? { label: t('branch') || 'Branch', value: branches.find(b => String(b.id) === String(movementBranchFilter))?.name || movementBranchFilter } : null,
        ].filter(Boolean),
      }
    : {
        title: `${(t('currentInventory') || 'Current Inventory').replace(/\s*\([^)]*\)/g, '')} (${branchFilter ? (branches.find(b => String(b.id) === String(branchFilter))?.name || branchFilter) : (t('allBranches') || 'All Branches').replace(/\s*\([^)]*\)/g, '')})`,
        filename: 'inventory-report.pdf',
        columns: [
          { header: t('product') || 'Product', render: r => r.Product?.name || '', width: 2 },
          { header: t('sku') || 'SKU', render: r => r.Product?.sku || '', width: 1.1 },
          { header: t('userBranch') || 'Branch', render: r => r.Branch?.name || '', width: 1.1 },
          { header: t('currentStock') || 'Stock', key: 'stock', render: r => parseFloat(r.quantity_on_hand) || 0, qty: true, align: 'right', width: 0.9 },
          { header: t('supplier') || 'Supplier', render: r => r.Product?.ProductSuppliers?.[0]?.Supplier?.company_name || '', width: 1.4 },
          { header: t('stockValue') || 'Stock Value', key: 'stock_value', render: r => (parseFloat(r.quantity_on_hand) || 0) * parseFloat(r.Product?.cost_price || 0), money: true, width: 1.2 },
        ],
        rows: inventory,
        totals: {
          __label: t('total') || 'Total',
          stock: inventory.reduce((s, r) => s + (parseFloat(r.quantity_on_hand) || 0), 0),
          stock_value: inventory.reduce((s, r) => s + (parseFloat(r.quantity_on_hand) || 0) * parseFloat(r.Product?.cost_price || 0), 0),
        },
        filters: branchFilter ? [{ label: t('branch') || 'Branch', value: branches.find(b => String(b.id) === String(branchFilter))?.name || branchFilter }] : [],
      };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Building2}
        accent="emerald"
        title={t('inventoryDashboard')}
        subtitle={t('inventorySub')}
        action={
          <div className="flex flex-wrap gap-2">
            <ReportActions {...report} />
            <button
              type="button"
              onClick={() => {
                setFormReceive({
                  product_id: '',
                  branch_id: branches[0]?.id || '',
                  quantity: '',
                  supplier_id: '',
                  purchase_price: '',
                  notes: '',
                  payment_status: 'unpaid',
                  paid_amount: '',
                  payment_method: 'cash',
                });
                setModal('receive');
              }}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />{t('receiveStock')}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormAdjust({
                  product_id: '',
                  branch_id: branches[0]?.id || '',
                  quantity: '',
                  direction: 'decrease',
                  reason: 'Physical Audit Correction',
                  notes: '',
                });
                setModal('adjust');
              }}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg text-sm transition-colors flex items-center gap-2"
            >
              <ArrowDownUp className="w-4 h-4" />{t('stockAdjustment')}
            </button>
          </div>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <Icon className={`w-5 h-5 ${color}`} />
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex gap-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <button
          onClick={() => setActiveTab('levels')}
          className={`pb-3 font-semibold text-sm transition-all border-b-2 px-1 ${
            activeTab === 'levels' ? 'border-brand-500 text-brand-400' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t('currentInventory') || 'Current Inventory'}
        </button>
        <button
          onClick={() => setActiveTab('movements')}
          className={`pb-3 font-semibold text-sm transition-all border-b-2 px-1 ${
            activeTab === 'movements' ? 'border-brand-500 text-brand-400' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          ⏱ {t('auditLog') || 'Stock Movements History'}
        </button>
      </div>

      {/* TAB 1: STOCK LEVELS VIEW */}
      {activeTab === 'levels' && (
        <div className="space-y-4">
          <div className="glass-card p-4 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-3">
              <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('filterByBranch')}</label>
              <select className="input max-w-xs" value={branchFilter} onChange={e => setBranchFilter(e.target.value)}>
                <option value="">{t('allBranches')}</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <button
              onClick={fetchData}
              className="icon-btn"
              title="Refresh levels"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-emerald-400" /></div>
          ) : (
            <div className="space-y-6">
              {/* Branch stock table */}
              <div className="glass-card overflow-x-auto">
                <div className="p-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                  <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <ArrowDownUp className="w-4 h-4 text-emerald-400" />{t('currentInventory')}
                  </h2>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t('currentInventoryHint')}</p>
                </div>
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                      <th className="text-start p-4">{t('product')}</th>
                      <th className="text-start p-4">{t('userBranch')}</th>
                      <th className="text-start p-4">{t('currentStock')}</th>
                      <th className="text-start p-4">{t('supplier')}</th>
                      <th className="text-start p-4">{t('stockValue')}</th>
                      <th className="text-end p-4">{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map(row => (
                      <tr key={row.id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.15s' }} className="hover:bg-[var(--bg-hover)]">
                        <td className="p-4">
                          <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{row.Product?.name}</div>
                          <div className="text-xs font-mono text-emerald-400">{row.Product?.sku}</div>
                        </td>
                        <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{row.Branch?.name}</td>
                        <td className="p-4">
                          <StockBadge qty={parseFloat(row.quantity_on_hand) || 0} reorder={row.Product?.reorder_level} />
                        </td>
                        <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {row.Product?.ProductSuppliers?.[0]?.Supplier?.company_name || '—'}
                        </td>
                        <td className="p-4" style={{ color: 'var(--text-secondary)' }}>
                          {formatPKR((parseFloat(row.quantity_on_hand) || 0) * parseFloat(row.Product?.cost_price || 0), lang)}
                        </td>
                        <td className="p-4 text-end">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openReceiveQuick(row.product_id, row.branch_id)}
                              className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded transition-colors"
                              title="Receive Stock"
                            >
                              + Receive
                            </button>
                            <button
                              type="button"
                              onClick={() => openAdjustQuick(row.product_id, row.branch_id)}
                              className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold rounded transition-colors"
                              title="Adjust Stock"
                            >
                              ⚙ Adjust
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {inventory.length === 0 && (
                      <tr><td colSpan={6} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noInventory')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Aggregated Total Stock overview */}
              <div className="glass-card overflow-x-auto">
                <div className="p-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                  <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('totalStockOverview')}</h2>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t('totalStockHint')}</p>
                </div>
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                      <th className="text-start p-4">{t('product')}</th>
                      <th className="text-start p-4">{t('category')}</th>
                      <th className="text-start p-4">{t('totalStock')}</th>
                      <th className="text-start p-4">{t('currentStock') || 'Current Stock'}</th>
                      <th className="text-start p-4">{t('reorderLevel')}</th>
                      <th className="text-start p-4">{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map(row => (
                      <tr key={row.product_id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.15s' }} className="hover:bg-[var(--bg-hover)]">
                        <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{row.name}</td>
                        <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{row.category}</td>
                        <td className="p-4 font-mono text-emerald-400">{formatQty(row.total_stock)} {t('kg') || 'kg'}</td>
                        <td className="p-4"><StockBadge qty={row.current_inventory} reorder={row.reorder_level} /></td>
                        <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{row.reorder_level}</td>
                        <td className="p-4">
                          {row.low_stock ? (
                            <span className="badge badge-yellow">{t('lowStock')}</span>
                          ) : (
                            <span className="badge badge-green">{t('inStock')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: AUDIT LOG movements history VIEW */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          <div className="glass-card p-4 flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Filter Product</span>
              <select
                className="input max-w-xs"
                value={movementProductFilter}
                onChange={e => setMovementProductFilter(e.target.value)}
              >
                <option value="">All Products</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Filter Branch</span>
              <select
                className="input max-w-xs"
                value={movementBranchFilter}
                onChange={e => setMovementBranchFilter(e.target.value)}
              >
                <option value="">All Branches</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2 ms-auto">
              <button onClick={fetchMovements} className="btn-secondary flex items-center gap-2">
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
            </div>
          </div>

          {loadingMovements ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
          ) : (
            <div className="glass-card overflow-x-auto">
              <div className="p-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Stock Movements History (Audit Log)</h2>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Direct log of stock operations: Purchases, Sales, Transfers, and Adjustments</p>
              </div>
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                    <th className="text-start p-4">Timestamp</th>
                    <th className="text-start p-4">Product</th>
                    <th className="text-start p-4">Branch</th>
                    <th className="text-start p-4">Movement Type</th>
                    <th className="text-end p-4">Quantity Changed</th>
                    <th className="text-end p-4">New Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map(m => (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.15s' }} className="hover:bg-[var(--bg-hover)]">
                      <td className="p-4 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                        {new Date(m.created_at || m.createdAt).toLocaleString('en-PK')}
                      </td>
                      <td className="p-4 font-semibold" style={{ color: 'var(--text-primary)' }}>{m.Product?.name}</td>
                      <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{m.Branch?.name}</td>
                      <td className="p-4">{getMovementBadge(m.ref_type)}</td>
                      <td className={`p-4 text-end font-bold text-base ${m.quantity > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {m.quantity > 0 ? `+${formatQty(m.quantity)}` : formatQty(m.quantity)} {t('kg') || 'kg'}
                      </td>
                      <td className="p-4 text-end font-bold" style={{ color: 'var(--text-primary)' }}>{formatQty(m.balance_after)} {t('kg') || 'kg'}</td>
                    </tr>
                  ))}
                  {movements.length === 0 && (
                    <tr><td colSpan={6} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>No stock movements found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── RECEIVE STOCK MODAL ── */}
      {modal === 'receive' && (
        <Modal title={t('receiveStock')} onClose={() => setModal(null)}>
          <form onSubmit={submitReceive} className="space-y-4">
            <div>
              <FormLabel variant="semibold" required>{t('product')}</FormLabel>
              <select
                className="input"
                required
                value={formReceive.product_id}
                onChange={e => handleProductChangeInReceive(e.target.value)}
              >
                <option value="">{t('selectProduct')}</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FormLabel variant="semibold" required>{t('userBranch')}</FormLabel>
                <select
                  className="input"
                  required
                  value={formReceive.branch_id}
                  onChange={e => setFormReceive(f => ({ ...f, branch_id: e.target.value }))}
                >
                  <option value="">Select Branch</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <FormLabel variant="semibold">{t('supplier')}</FormLabel>
                <select
                  className="input"
                  value={formReceive.supplier_id}
                  onChange={e => setFormReceive(f => ({ ...f, supplier_id: e.target.value }))}
                >
                  <option value="">{t('optional')}</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FormLabel variant="semibold" required>{t('quantity')} ({t('kg') || 'kg'})</FormLabel>
                <input
                  className="input"
                  type="number"
                  min="0.1"
                  step="0.1"
                  required
                  value={formReceive.quantity}
                  onChange={e => setFormReceive(f => ({ ...f, quantity: e.target.value }))}
                  placeholder="e.g. 10.5"
                />
              </div>
              <div>
                <FormLabel variant="semibold">Purchase Unit Cost (PKR)</FormLabel>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={formReceive.purchase_price}
                  onChange={e => setFormReceive(f => ({ ...f, purchase_price: e.target.value }))}
                  placeholder="Cost per unit"
                />
              </div>
            </div>

            {formReceive.supplier_id && (() => {
              const sup = suppliers.find(s => String(s.id) === String(formReceive.supplier_id));
              const availableCredit = parseFloat(sup?.credit_balance || 0);
              const totalCost = (parseFloat(formReceive.quantity) || 0) * (parseFloat(formReceive.purchase_price) || 0);
              return (
                <div className="rounded-lg p-3 space-y-3" style={{ border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-elevated)' }}>
                  <label className="text-xs font-semibold block" style={{ color: 'var(--text-secondary)' }}>{t('paid') || 'Paid?'}</label>
                  <div className="flex gap-2">
                    {['unpaid', 'paid', 'partial'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setFormReceive(f => ({ ...f, payment_status: opt }))}
                        className={`px-3 py-1.5 rounded text-xs font-bold flex-1 transition-all ${
                          formReceive.payment_status === opt ? 'bg-emerald-500 text-white' : ''
                        }`}
                        style={formReceive.payment_status !== opt ? { backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' } : {}}
                      >
                        {opt === 'unpaid' ? (t('no') || 'No') : opt === 'paid' ? (t('yes') || 'Yes') : (t('partial') || 'Partial')}
                      </button>
                    ))}
                  </div>

                  {formReceive.payment_status !== 'unpaid' && (
                    <div className="grid grid-cols-2 gap-3">
                      {formReceive.payment_status === 'partial' && (
                        <div>
                          <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>{t('amountPaid') || 'Amount Paid'}</label>
                          <input
                            className="input" type="number" step="0.01" min="0" max={totalCost || undefined}
                            value={formReceive.paid_amount}
                            onChange={e => setFormReceive(f => ({ ...f, paid_amount: e.target.value }))}
                          />
                        </div>
                      )}
                      <div className={formReceive.payment_status === 'partial' ? '' : 'col-span-2'}>
                        <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>{t('method') || 'Method'}</label>
                        <select
                          className="input"
                          value={formReceive.payment_method}
                          onChange={e => setFormReceive(f => ({ ...f, payment_method: e.target.value }))}
                        >
                          <option value="cash">{t('cash') || 'Cash'}</option>
                          <option value="bank">{t('bank') || 'Bank'}</option>
                          <option value="supplier_credit" disabled={availableCredit <= 0}>
                            {(t('supplierCredit') || 'Supplier Credit')} ({formatPKR(availableCredit, lang)} {t('available') || 'available'})
                          </option>
                        </select>
                      </div>
                    </div>
                  )}
                  {formReceive.payment_status !== 'unpaid' && totalCost > 0 && (
                    <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('totalCost') || 'Total cost'}: {formatPKR(totalCost, lang)}</p>
                  )}
                </div>
              );
            })()}

            {!formReceive.supplier_id && (() => {
              const totalCost = (parseFloat(formReceive.quantity) || 0) * (parseFloat(formReceive.purchase_price) || 0);
              const method = ['cash', 'bank'].includes(formReceive.payment_method) ? formReceive.payment_method : 'cash';
              return (
                <div className="rounded-lg p-3 space-y-3" style={{ border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-elevated)' }}>
                  <FormLabel variant="semibold" required>{t('paymentMethod') || 'Payment Method'}</FormLabel>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t('directPurchaseHint') || 'No supplier selected — the full cost is paid now from the account below.'}
                  </p>
                  <select
                    className="input"
                    value={method}
                    onChange={e => setFormReceive(f => ({ ...f, payment_method: e.target.value }))}
                  >
                    <option value="cash">{t('cash') || 'Cash'}</option>
                    <option value="bank">{t('bank') || 'Bank'}</option>
                  </select>
                  {totalCost > 0 && (
                    <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('totalCost') || 'Total cost'}: {formatPKR(totalCost, lang)}</p>
                  )}
                </div>
              );
            })()}

            <div>
              <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Notes / Remarks</label>
              <textarea
                className="input min-h-[80px]"
                value={formReceive.notes}
                onChange={e => setFormReceive(f => ({ ...f, notes: e.target.value }))}
                placeholder="Enter invoice numbers, notes, audit details..."
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? 'Processing...' : (t('save') || 'Save')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── ADJUST STOCK MODAL ── */}
      {modal === 'adjust' && (
        <Modal title={t('stockAdjustment')} onClose={() => setModal(null)}>
          <form onSubmit={submitAdjust} className="space-y-4">
            <div>
              <FormLabel variant="semibold" required>{t('product')}</FormLabel>
              <select
                className="input"
                required
                value={formAdjust.product_id}
                onChange={e => setFormAdjust(f => ({ ...f, product_id: e.target.value }))}
              >
                <option value="">{t('selectProduct')}</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FormLabel variant="semibold" required>{t('userBranch')}</FormLabel>
                <select
                  className="input"
                  required
                  value={formAdjust.branch_id}
                  onChange={e => setFormAdjust(f => ({ ...f, branch_id: e.target.value }))}
                >
                  <option value="">Select Branch</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <FormLabel variant="semibold" required>Adjustment Direction</FormLabel>
                <select
                  className="input"
                  required
                  value={formAdjust.direction}
                  onChange={e => setFormAdjust(f => ({ ...f, direction: e.target.value }))}
                >
                  <option value="decrease">Decrease Stock (-)</option>
                  <option value="increase">Increase Stock (+)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FormLabel variant="semibold" required>{t('quantity')} ({t('kg') || 'kg'})</FormLabel>
                <input
                  className="input"
                  type="number"
                  min="0.1"
                  step="0.1"
                  required
                  value={formAdjust.quantity}
                  onChange={e => setFormAdjust(f => ({ ...f, quantity: e.target.value }))}
                  placeholder="e.g. 5.5"
                />
              </div>
              <div>
                <FormLabel variant="semibold" required>Formal Reason</FormLabel>
                <select
                  className="input"
                  required
                  value={formAdjust.reason}
                  onChange={e => setFormAdjust(f => ({ ...f, reason: e.target.value }))}
                >
                  <option value="Physical Audit Correction">Physical Audit Correction</option>
                  <option value="Damaged / Broken Goods">Damaged / Broken Goods</option>
                  <option value="Theft / Loss">Theft / Loss</option>
                  <option value="Customer Return">Customer Return</option>
                  <option value="Vendor Shortage">Vendor Shortage</option>
                  <option value="Other">Other (Describe in Notes)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Audit Notes / Explanations</label>
              <textarea
                className="input min-h-[80px]"
                required={formAdjust.reason === 'Other'}
                value={formAdjust.notes}
                onChange={e => setFormAdjust(f => ({ ...f, notes: e.target.value }))}
                placeholder="Enter details of why this stock is being adjusted..."
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving...' : (t('save') || 'Save')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
