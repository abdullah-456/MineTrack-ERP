import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, Plus, Search, Eye, Loader2, Receipt, Printer, Ticket } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR, formatQty } from '../../hooks/useShopApi';
import { useHighlightRow } from '../../hooks/useHighlightRow';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import StatusBadge from '../../components/ui/StatusBadge';
import ReportActions from '../../components/ui/ReportActions';
import ReportFilters, { filterByDate, activeFilterList } from '../../components/ui/ReportFilters';
import { BankAccountPicker, CashAccountPicker } from '../../components/ui/PaymentAccountSelect';
import LocationPicker from '../../components/ui/LocationPicker';
import { defaultLocation, stockForProductAtLocation, filterRowsByLocation } from '../../utils/locationUtils';
import api from '../../api/axios';


export default function Sales() {
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams, branches } = useShopApi();
  const isRTL = lang === 'ur';
  const { isHighlighted } = useHighlightRow();

  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [createdSalePrompt, setCreatedSalePrompt] = useState(null);
  const [godowns, setGodowns] = useState([]);
  const [gatePassForm, setGatePassForm] = useState({
    location_type: 'branch', branch_id: '', godown_id: null,
    sale_id: null, customer_id: '', customer_name: '', customer_phone: '',
    gate_pass_date: new Date().toISOString().slice(0, 16), type: 'sale_dispatch',
    vehicle_no: '', driver_name: '', driver_phone: '', remarks: '', items: []
  });
  const [form, setForm] = useState({
    customer_id: '', location_type: 'branch', branch_id: '', godown_id: null,
    employee_id: '', sale_type: 'cash',
    items: [{ product_id: '', quantity: 1, unit_price: '' }],
    discount: '0', tax: '0', payment_amount: '', payment_method: 'cash', bank_account_id: null, description: '', sale_date: '',
  });
  const [reportFilters, setReportFilters] = useState({ from: '', to: '', sale_type: '', customer_id: '', product_id: '', employee_id: '' });
  const [locationFilter, setLocationFilter] = useState({ location_type: 'branch', branch_id: '', godown_id: null });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams(), search };
      const [sRes, pRes, cRes, eRes] = await Promise.all([
        api.get('/sales', { params }),
        api.get('/products', { params: shopParams() }),
        api.get('/customers', { params: shopParams() }),
        api.get('/employees', { params: shopParams() }),
      ]);
      setSales(sRes.data.sales || []);
      setProducts(pRes.data.products || []);
      setCustomers(cRes.data.customers || []);
      setEmployees(eRes.data.employees || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, search, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    api.get('/godowns', { params: shopParams() })
      .then(({ data }) => setGodowns(data.godowns || []))
      .catch(() => setGodowns([]));
  }, [shopParams]);

  useEffect(() => {
    if (branches.length && !form.branch_id) {
      setForm(f => ({ ...f, ...defaultLocation(branches) }));
    }
  }, [branches, form.branch_id]);

  const saleLocation = {
    location_type: form.location_type,
    branch_id: form.branch_id,
    godown_id: form.godown_id,
  };

  const stockForProduct = (productId, location = saleLocation) =>
    stockForProductAtLocation(productId, location, products, branches, godowns);

  const addLine = () => setForm(f => ({ ...f, items: [...f.items, { product_id: '', quantity: 1, unit_price: '' }] }));
  const updateLine = (i, k, v) => setForm(f => {
    const items = [...f.items];
    items[i] = { ...items[i], [k]: v };
    if (k === 'product_id') {
      const prod = products.find(p => String(p.id) === String(v));
      if (prod) items[i].unit_price = prod.sale_price;
    }
    return { ...f, items };
  });

  const removeLine = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

  // Computed totals
  const subtotal = useMemo(() =>
    form.items.reduce((sum, it) => {
      if (!it.product_id || !it.unit_price) return sum;
      return sum + (parseFloat(it.unit_price) || 0) * (parseFloat(it.quantity) || 0);
    }, 0),
  [form.items]);
  const total = useMemo(() =>
    subtotal - (parseFloat(form.discount) || 0) + (parseFloat(form.tax) || 0),
  [subtotal, form.discount, form.tax]);


  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const items = form.items.filter(i => i.product_id).map(i => ({
        product_id: parseInt(i.product_id, 10),
        quantity: parseFloat(i.quantity),
        unit_price: parseFloat(i.unit_price),
      }));
      if (!items.length) { error(t('addAtLeastOneItem')); setSaving(false); return; }
      if (!form.branch_id) {
        error(form.location_type === 'godown' ? (t('selectGodown') || 'Please select a godown with linked branches') : t('selectBranch'));
        setSaving(false);
        return;
      }
      if (form.sale_type === 'credit' && !form.customer_id) {
        error(t('mustSelectRegisteredCustomer')); setSaving(false); return;
      }

      const payload = {
        customer_id: form.customer_id || null,
        branch_id: parseInt(form.branch_id, 10),
        employee_id: form.employee_id ? parseInt(form.employee_id, 10) : null,
        sale_type: form.sale_type,
        items,
        discount: parseFloat(form.discount) || 0,
        tax: parseFloat(form.tax) || 0,
        payment_method: form.payment_method,
        payment_amount: form.sale_type === 'credit' && form.payment_amount !== '' ? parseFloat(form.payment_amount) : undefined,
        bank_account_id: (form.sale_type === 'bank' || (form.sale_type === 'credit' && parseFloat(form.payment_amount) > 0)) ? form.bank_account_id : null,
        description: form.description?.trim() || null,
        sale_date: form.sale_date || undefined,
        ...shopParams(),
      };


      const { data } = await api.post('/sales', payload);
      success(t('saleCreated'));
      setModal(null);
      fetchData();
      if (data.sale) {
        setCreatedSalePrompt(data.sale);
      }
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const openGatePassForSale = (saleObj) => {
    setCreatedSalePrompt(null);
    const saleItems = (saleObj.SaleItems || []).map(item => ({
      product_id: item.product_id,
      product_name: item.Product?.name || item.product_name || 'Item',
      quantity: item.quantity,
      unit: item.Product?.unit || 'kg',
      notes: ''
    }));

    setGatePassForm({
      location_type: 'branch',
      branch_id: String(saleObj.branch_id || branches[0]?.id || ''),
      godown_id: null,
      sale_id: saleObj.id,
      customer_id: saleObj.customer_id ? String(saleObj.customer_id) : '',
      customer_name: saleObj.Customer?.name || '',
      customer_phone: saleObj.Customer?.phone || '',
      gate_pass_date: new Date().toISOString().slice(0, 16),
      type: 'sale_dispatch',
      vehicle_no: '',
      driver_name: '',
      driver_phone: '',
      remarks: `Gatepass issued for Invoice #${saleObj.invoice_number}`,
      items: saleItems.length > 0 ? saleItems : [{ product_id: '', product_name: '', quantity: 1, unit: 'kg', notes: '' }]
    });
    setModal('create_gatepass');
  };

  const handleCreateGatePass = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const validItems = gatePassForm.items.filter(i => i.product_id || i.product_name?.trim()).map(i => ({
        product_id: i.product_id ? parseInt(i.product_id, 10) : null,
        product_name: i.product_name?.trim() || 'Item',
        quantity: parseFloat(i.quantity) || 1,
        unit: i.unit || 'kg',
        notes: i.notes?.trim() || null
      }));

      const payload = {
        branch_id: parseInt(gatePassForm.branch_id, 10),
        sale_id: gatePassForm.sale_id || null,
        customer_id: gatePassForm.customer_id ? parseInt(gatePassForm.customer_id, 10) : null,
        customer_name: gatePassForm.customer_name?.trim() || null,
        customer_phone: gatePassForm.customer_phone?.trim() || null,
        gate_pass_date: gatePassForm.gate_pass_date,
        type: gatePassForm.type,
        vehicle_no: gatePassForm.vehicle_no?.trim() || null,
        driver_name: gatePassForm.driver_name?.trim() || null,
        driver_phone: gatePassForm.driver_phone?.trim() || null,
        remarks: gatePassForm.remarks?.trim() || null,
        items: validItems,
        ...shopParams()
      };

      const { data } = await api.post('/gatepasses', payload);
      success(t('gatepassCreatedSuccess') || 'Gatepass created successfully');
      setModal(null);

      if (data.gate_pass?.id) {
        window.open(`/gatepass/${data.gate_pass.id}?auto_print=1`, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const viewDetail = async (id) => {
    try {
      const { data } = await api.get(`/sales/${id}`, { params: shopParams() });
      setDetail(data.sale);
      setModal('detail');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };


  const saleTypeBadgeColor = {
    cash: 'badge-green', bank: 'badge-blue', credit: 'badge-yellow', card: 'badge-blue',
  };

  // Advance credit the selected customer already holds (negative balance).
  const selectedCustomer = customers.find(c => String(c.id) === String(form.customer_id));
  const selectedAdvance = selectedCustomer
    ? Math.max(0, -parseFloat(selectedCustomer.current_balance || 0))
    : 0;

  // ── Report: filter the on-screen sales, then feed <ReportActions/> ──────────
  const reportSelects = [
    { key: 'sale_type', label: t('saleType') || 'Type', options: ['cash', 'bank', 'credit', 'card'].map(v => ({ value: v, label: t(v) || v })) },
    { key: 'customer_id', label: t('customer') || 'Customer', options: customers.map(c => ({ value: c.id, label: c.name })) },
    { key: 'product_id', label: t('product') || 'Product', options: products.map(p => ({ value: p.id, label: p.name })) },
    { key: 'employee_id', label: t('employee') || 'Sales Rep', options: employees.map(e => ({ value: e.id, label: e.name })) },
  ];
  let reportRows = filterByDate(sales, 'sale_date', reportFilters.from, reportFilters.to);
  reportRows = filterRowsByLocation(reportRows, locationFilter, godowns, branches);
  if (reportFilters.sale_type) reportRows = reportRows.filter(s => s.sale_type === reportFilters.sale_type);
  if (reportFilters.customer_id) reportRows = reportRows.filter(s => String(s.Customer?.id || s.customer_id) === String(reportFilters.customer_id));
  if (reportFilters.product_id) reportRows = reportRows.filter(s => (s.SaleItems || []).some(item => String(item.product_id || item.Product?.id) === String(reportFilters.product_id)));
  if (reportFilters.employee_id) reportRows = reportRows.filter(s => String(s.Employee?.id || s.employee_id) === String(reportFilters.employee_id));
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    reportRows = reportRows.filter(s =>
      (s.invoice_number || '').toLowerCase().includes(q) ||
      (s.Customer?.name || 'walk-in').toLowerCase().includes(q) ||
      (s.Customer?.phone || '').toLowerCase().includes(q) ||
      (s.Branch?.name || '').toLowerCase().includes(q) ||
      (s.sale_type || '').toLowerCase().includes(q) ||
      (s.status || '').toLowerCase().includes(q) ||
      (s.Cashier?.name || '').toLowerCase().includes(q) ||
      (s.Employee?.name || '').toLowerCase().includes(q) ||
      (String(s.total) || '').toLowerCase().includes(q) ||
      new Date(s.sale_date).toLocaleDateString('en-PK').toLowerCase().includes(q) ||
      (s.SaleItems || []).some(i => (i.Product?.name || '').toLowerCase().includes(q) || (i.Product?.sku || '').toLowerCase().includes(q))
    );
  }
  const reportColumns = [
    { header: t('invoiceNo') || 'Invoice #', key: 'invoice_number', width: 1.4 },
    { header: t('date') || 'Date', render: s => new Date(s.sale_date).toLocaleDateString('en-PK'), width: 1.1 },
    { header: t('customer') || 'Customer', render: s => s.Customer?.name || t('walkIn') || 'Walk-in', width: 1.4 },
    { header: t('userBranch') || 'Branch', render: s => s.Branch?.name || '', width: 1.1 },
    { header: t('product') || 'Products Sold', render: s => (s.SaleItems || []).map(i => i.Product?.name || i.product_name || '').filter(Boolean).join(', ') || '—', width: 2 },
    { header: t('quantity') || 'Qty', render: s => (s.SaleItems || []).map(i => `${formatQty(i.quantity)}`).join(', ') || '—', width: 1 },
    { header: t('saleType') || 'Type', render: s => t(s.sale_type) || s.sale_type, width: 0.9 },
    { header: t('total') || 'Total', key: 'total', money: true, width: 1.1 },
  ];
  const reportTotals = { __label: t('total') || 'Total', total: reportRows.reduce((s, r) => s + parseFloat(r.total || 0), 0) };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={TrendingUp}
        accent="rose"
        title={t('sales')}
        subtitle={t('salesSub')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={t('sales') || 'Sales Report'}
              columns={reportColumns}
              rows={reportRows}
              totals={reportTotals}
              filters={activeFilterList(reportFilters, reportSelects)}
              filename="sales-report.pdf"
            />
            <button
              type="button"
              onClick={() => {
                setForm({ customer_id: '', ...defaultLocation(branches), employee_id: '', sale_type: 'cash', items: [{ product_id: '', quantity: 1, unit_price: '' }], discount: '0', tax: '0', payment_amount: '', payment_method: 'cash', bank_account_id: null, description: '' });
                setModal('create');
              }}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />{t('newSale')}
            </button>
          </div>
        }
      />

      <div className="glass-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
            <input className="input" style={{ paddingInlineStart: '2.5rem' }} placeholder={t('searchInvoice')} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <LocationPicker
            compact
            value={locationFilter}
            onChange={setLocationFilter}
          />
        </div>
        <ReportFilters
          value={reportFilters}
          onChange={(k, v) => setReportFilters(f => ({ ...f, [k]: v }))}
          onClear={() => setReportFilters({ from: '', to: '', sale_type: '', customer_id: '', product_id: '', employee_id: '' })}
          selects={reportSelects}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-rose-400" /></div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('invoiceNo')}</th>
                <th className="text-start p-4">{t('date')}</th>
                <th className="text-start p-4">{t('customer')}</th>
                <th className="text-start p-4">{t('userBranch')}</th>
                <th className="text-start p-4">{t('saleType')}</th>
                <th className="text-start p-4">{t('total')}</th>
                <th className="text-start p-4">{t('status')}</th>
                <th className="text-end p-4">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map(s => (
                <tr
                  key={s.id}
                  id={`row-${s.id}`}
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  className={`${isHighlighted(s.id) ? 'highlight-row' : 'hover:bg-white/5'} cursor-pointer transition-colors`}
                  onClick={(e) => {
                    if (e.target.closest('button')) return;
                    viewDetail(s.id);
                  }}
                >
                  <td className="p-4 font-mono text-rose-400 text-xs">{s.invoice_number}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(s.sale_date).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK')}
                  </td>
                  <td className="p-4" style={{ color: 'var(--text-primary)' }}>{s.Customer?.name || t('walkIn')}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{s.Branch?.name}</td>
                  <td className="p-4">
                    <span className={`badge ${saleTypeBadgeColor[s.sale_type] || 'badge-blue'}`}>
                      {t(s.sale_type) || s.sale_type}
                    </span>
                    {parseFloat(s.tax) > 0 && (
                      <span className="badge badge-yellow ms-1">{t('tax') || 'Tax'}</span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="font-bold text-emerald-400">{formatPKR(s.total, lang)}</div>
                    {(() => {
                      const paid = (s.Payments || []).reduce((acc, p) => acc + parseFloat(p.amount || 0), 0);
                      const due = Math.max(0, parseFloat(s.total || 0) - paid);
                      if (s.sale_type === 'credit' || due > 0.01) {
                        return (
                          <div className="text-[11px] mt-0.5 whitespace-nowrap">
                            <span style={{ color: 'var(--text-muted)' }}>Paid: {formatPKR(paid, lang)}</span>
                            {due > 0.01 && (
                              <span className="font-semibold text-amber-400 ms-1">
                                (Due: {formatPKR(due, lang)})
                              </span>
                            )}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </td>
                  <td className="p-4"><StatusBadge status={s.status} /></td>
                  <td className="p-4 text-end whitespace-nowrap space-x-1">
                    <button
                      type="button"
                      title={t('createGatepass') || 'Create Gatepass'}
                      onClick={() => openGatePassForSale(s)}
                      className="icon-btn"
                    >
                      <Ticket className="w-4 h-4 text-indigo-400" />
                    </button>
                    <button
                      type="button"
                      title={t('printInvoice') || 'Print invoice'}
                      onClick={() => window.open(`/invoice/sale-${s.id}?auto_print=1`, '_blank', 'noopener,noreferrer')}
                      className="icon-btn"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    <button type="button" title={t('viewDetails') || 'View details'} onClick={() => viewDetail(s.id)} className="icon-btn"><Eye className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {reportRows.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noSales')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create Sale Modal ── */}
      {modal === 'create' && (
        <Modal title={t('newSale')} onClose={() => setModal(null)} wide>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <FormLabel required={form.sale_type === 'credit'}>{t('customer')}</FormLabel>
                <select className="input" required={form.sale_type === 'credit'} value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}>
                  <option value="">{t('walkIn')} ({t('walkin')})</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({t('registered')}){c.phone ? ` - ${c.phone}` : ''}
                    </option>
                  ))}
                </select>
                {form.sale_type === 'credit' && !form.customer_id && (
                  <p className="text-xs text-amber-400 mt-1">⚠ {t('mustSelectRegisteredCustomer')}</p>
                )}
                {selectedAdvance > 0 && (
                  <p className="text-xs text-emerald-400 mt-1">
                    {t('advanceAvailable') || 'Advance available'}: {formatPKR(selectedAdvance, lang)}
                    {form.sale_type === 'credit' && (
                      <span style={{ color: 'var(--text-muted)' }}> — {t('advanceWillApply') || 'will be applied to this sale'}</span>
                    )}
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
                <LocationPicker
                  required
                  label={t('location') || 'Branch / Godown Location'}
                  value={saleLocation}
                  onChange={(loc) => setForm(f => ({
                    ...f,
                    location_type: loc.location_type,
                    branch_id: loc.branch_id,
                    godown_id: loc.godown_id,
                  }))}
                />
              </div>
              <div>
                <FormLabel>Employee / Sales Agent (Optional)</FormLabel>
                <select className="input" value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}>
                  <option value="">Select Employee (Optional)</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.designation || 'Staff'})</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <FormLabel>{t('saleType')}</FormLabel>
                <div className="grid grid-cols-4 gap-2">
                  {['cash', 'bank', 'credit'].map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, sale_type: type, payment_method: type, bank_account_id: null }))}
                      className={`py-2 rounded-lg text-sm font-medium border transition-all ${
                        form.sale_type === type
                          ? type === 'credit' ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                          : type === 'bank' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                          : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                          : 'hover:bg-[var(--bg-hover)]'
                      }`}
                      style={form.sale_type !== type ? { color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' } : {}}
                    >
                      {t(type)}
                    </button>
                  ))}
                </div>
              </div>
              {form.sale_type === 'cash' && (
                <div>
                  <FormLabel>{t('cashAccount') || 'Cash Account'}</FormLabel>
                  <CashAccountPicker
                    value={form.bank_account_id}
                    onChange={bank_account_id => setForm(f => ({ ...f, bank_account_id }))}
                  />
                </div>
              )}
              {form.sale_type === 'bank' && (
                <div>
                  <FormLabel required>{t('bankAccount') || 'Bank Account'}</FormLabel>
                  <BankAccountPicker
                    required
                    value={form.bank_account_id}
                    onChange={bank_account_id => setForm(f => ({ ...f, bank_account_id }))}
                  />
                </div>
              )}
              <div>
                <FormLabel>{t('saleDate') || 'Sale Date & Time (Optional)'}</FormLabel>
                <input
                  type="datetime-local"
                  className="input"
                  value={form.sale_date || ''}
                  onChange={e => setForm(f => ({ ...f, sale_date: e.target.value }))}
                />
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {t('saleItems')}<span className="text-red-400 ms-0.5" aria-hidden="true">*</span>
                </span>
                <button type="button" onClick={addLine} className="text-xs text-brand-400 hover:underline">{t('addLine')}</button>
              </div>
              {form.items.map((item, i) => {
                const avail = item.product_id ? stockForProduct(item.product_id, form.branch_id) : null;
                const lineQty = parseFloat(item.quantity) || 0;
                const linePrice = parseFloat(item.unit_price) || 0;
                return (
                  <div key={i} className="space-y-1">
                    <div className="grid grid-cols-3 gap-2 items-center">
                      <select className="input col-span-2" required value={item.product_id} onChange={e => updateLine(i, 'product_id', e.target.value)}>
                        <option value="">{t('selectProduct')}</option>
                        {products.filter(p => p.status === 'active').map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({stockForProduct(p.id, form.branch_id)} {t('inStock')})</option>
                        ))}
                      </select>
                      <div className="flex gap-1.5 items-center">
                        <div className="relative w-20">
                          <input
                            className="input w-full pe-7" type="number" min="0.1" step="0.1" required
                            max={avail || undefined} value={item.quantity}
                            onChange={e => updateLine(i, 'quantity', e.target.value)}
                          />
                          <span
                            className="absolute top-1/2 -translate-y-1/2 text-[10px] font-bold px-1 py-0.5 rounded"
                            style={{ [isRTL ? 'left' : 'right']: '4px', color: 'var(--text-muted)', backgroundColor: 'var(--bg-elevated)' }}
                          >
                            {t('kg') || 'kg'}
                          </span>
                        </div>
                        <input className="input flex-1" type="number" min="0" step="0.01" required placeholder={t('price')} value={item.unit_price} onChange={e => updateLine(i, 'unit_price', e.target.value)} />
                        {form.items.length > 1 && (
                          <button type="button" onClick={() => removeLine(i)} className="px-2 text-red-400 hover:text-red-300 text-lg">×</button>
                        )}
                      </div>
                    </div>
                    {lineQty > 0 && linePrice > 0 && (
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {formatQty(lineQty)} {t('kg') || 'kg'} × {formatPKR(linePrice, lang)} = <span className="font-semibold text-emerald-400">{formatPKR(lineQty * linePrice, lang)}</span>
                      </p>
                    )}
                    {avail !== null && lineQty > avail && (
                      <p className="text-xs text-red-400">{t('insufficientStock')}: {avail}</p>
                    )}
                  </div>
                );
              })}
            </div>

              {/* Discount + Tax */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FormLabel>{t('discount')}</FormLabel>
                  <input className="input" type="number" min="0" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} />
                </div>
                <div>
                  <FormLabel>{t('tax')}</FormLabel>
                  <input className="input" type="number" min="0" value={form.tax} onChange={e => setForm(f => ({ ...f, tax: e.target.value }))} />
                </div>
              </div>

              {form.sale_type === 'credit' && (
                <div className="space-y-3 p-3 rounded-xl border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
                  <div>
                    <FormLabel>{t('paymentAmount') || 'Upfront Payment (Paid Now)'}</FormLabel>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max={total || undefined}
                      placeholder="0.00 (Enter amount customer pays now e.g. 20000)"
                      value={form.payment_amount || ''}
                      onChange={e => setForm(f => ({ ...f, payment_amount: e.target.value }))}
                    />
                    <p className="text-xs text-amber-400 mt-1">
                      Customer pays {formatPKR(parseFloat(form.payment_amount) || 0, lang)} now; remaining {formatPKR(Math.max(0, total - (parseFloat(form.payment_amount) || 0)), lang)} will be added to customer credit balance.
                    </p>
                  </div>

                  {parseFloat(form.payment_amount) > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                      <div>
                        <FormLabel>{t('upfrontPaymentMethod') || 'Deposit Upfront Payment To'}</FormLabel>
                        <div className="grid grid-cols-2 gap-2">
                          {['cash', 'bank'].map(pm => (
                            <button
                              key={pm}
                              type="button"
                              onClick={() => setForm(f => ({ ...f, payment_method: pm, bank_account_id: null }))}
                              className={`py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                (form.payment_method || 'cash') === pm
                                  ? pm === 'bank' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                                  : 'hover:bg-[var(--bg-hover)]'
                              }`}
                              style={(form.payment_method || 'cash') !== pm ? { color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' } : {}}
                            >
                              {pm === 'bank' ? (t('bank') || 'Bank') : (t('cash') || 'Cash')}
                            </button>
                          ))}
                        </div>
                      </div>

                      {(form.payment_method || 'cash') === 'cash' ? (
                        <div>
                          <FormLabel>{t('cashAccount') || 'Cash Account'}</FormLabel>
                          <CashAccountPicker
                            value={form.bank_account_id}
                            onChange={bank_account_id => setForm(f => ({ ...f, bank_account_id }))}
                          />
                        </div>
                      ) : (
                        <div>
                          <FormLabel required>{t('bankAccount') || 'Bank Account'}</FormLabel>
                          <BankAccountPicker
                            required
                            value={form.bank_account_id}
                            onChange={bank_account_id => setForm(f => ({ ...f, bank_account_id }))}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Description / note */}
              <div>
                <FormLabel>{t('description') || 'Description'}</FormLabel>
                <textarea
                  className="input min-h-[60px] resize-none"
                  placeholder={t('saleDescriptionPlaceholder') || 'Optional note for this sale (e.g. delivery details, remarks)...'}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>

              {/* Totals */}
              {subtotal > 0 && (
                <div className="rounded-xl p-3 space-y-1 text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                  <div className="flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                    <span>{t('subtotal')}</span><span>{formatPKR(subtotal, lang)}</span>
                  </div>
                  {parseFloat(form.discount) > 0 && (
                    <div className="flex justify-between text-red-400">
                      <span>- {t('discount')}</span><span>- {formatPKR(form.discount, lang)}</span>
                    </div>
                  )}
                  {parseFloat(form.tax) > 0 && (
                    <div className="flex justify-between text-amber-400">
                      <span>+ {t('tax')}</span><span>+ {formatPKR(form.tax, lang)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-emerald-400 pt-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <span>{t('total')}</span><span>{formatPKR(total, lang)}</span>
                  </div>
                  {form.sale_type === 'credit' && (
                    <>
                      <div className="flex justify-between text-blue-400 pt-1" style={{ borderTop: '1px dashed var(--border-subtle)' }}>
                        <span>{t('paidNow') || 'Paid Now'}</span>
                        <span>{formatPKR(parseFloat(form.payment_amount) || 0, lang)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-amber-400">
                        <span>{t('creditRemaining') || 'Remaining Credit (Due)'}</span>
                        <span>{formatPKR(Math.max(0, total - (parseFloat(form.payment_amount) || 0)), lang)}</span>
                      </div>
                    </>
                  )}
                </div>
              )}


            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('completeSale')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Sale Detail Modal ── */}
      {modal === 'detail' && detail && (
        <Modal title={t('saleDetail')} onClose={() => { setModal(null); setDetail(null); }} wide>
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => window.open(`/invoice/sale-${detail.id}?auto_print=1`, '_blank', 'noopener,noreferrer')}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                <Printer className="w-4 h-4" />{t('printInvoice') || 'Print Invoice'}
              </button>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <Receipt className="w-8 h-8 text-rose-400" />
              <div>
                <p className="font-mono font-bold text-rose-400">{detail.invoice_number}</p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {new Date(detail.sale_date).toLocaleString(lang === 'ur' ? 'ur-PK' : 'en-PK')}
                </p>
              </div>
              <div className="ms-auto text-end">
                <p className="text-2xl font-bold text-emerald-400">{formatPKR(detail.total, lang)}</p>
                <div className="flex items-center gap-1.5 justify-end mt-1">
                  <StatusBadge status={detail.status} />
                  {parseFloat(detail.tax) > 0 && <span className="badge badge-yellow">{t('tax') || 'Tax'}</span>}
                </div>
              </div>
            </div>

            {/* Customer + Employee + Type */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{t('customer')}</p>
                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{detail.Customer?.name || t('walkIn')}</p>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Employee</p>
                <p className="font-medium text-emerald-400">{detail.Employee?.name || 'None'}</p>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{t('saleType')}</p>
                <span className={`badge ${saleTypeBadgeColor[detail.sale_type] || 'badge-blue'}`}>{t(detail.sale_type) || detail.sale_type}</span>
              </div>
            </div>

            {detail.description && (
              <div className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{t('description') || 'Description'}</p>
                <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{detail.description}</p>
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th className="text-start p-2">{t('product')}</th>
                  <th className="text-start p-2">{t('quantity')}</th>
                  <th className="text-end p-2">{t('total')}</th>
                </tr>
              </thead>
              <tbody>
                {(detail.SaleItems || []).map(item => (
                  <tr key={item.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="p-2" style={{ color: 'var(--text-primary)' }}>{item.Product?.name || item.product_name}</td>
                    <td className="p-2" style={{ color: 'var(--text-secondary)' }}>{formatQty(item.quantity)} {t('kg') || 'kg'}</td>
                    <td className="p-2 text-end text-emerald-400">{formatPKR(item.line_total, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {/* ── Post-Sale Gatepass Prompt Modal ── */}
      {createdSalePrompt && (
        <Modal title={t('createGatepass') || 'Create Gatepass'} onClose={() => setCreatedSalePrompt(null)}>
          <div className="space-y-4 text-center py-2">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
              <Ticket className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                {t('saleCreated') || 'Sale completed successfully!'}
              </h3>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                {t('askCreateGatepass') || 'Do you want to create a Gatepass for this sale?'}
              </p>
              <p className="text-xs font-mono text-indigo-400 mt-2">
                Invoice #{createdSalePrompt.invoice_number}
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCreatedSalePrompt(null)}
                className="btn-secondary flex-1"
              >
                {t('no') || 'No, Skip'}
              </button>
              <button
                type="button"
                onClick={() => openGatePassForSale(createdSalePrompt)}
                className="btn-primary flex-1 bg-indigo-600 hover:bg-indigo-700"
              >
                {t('yes') || 'Yes, Create Gatepass'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Create Gatepass Modal (Linked to Sale) ── */}
      {modal === 'create_gatepass' && (
        <Modal title={t('createGatepass') || 'Create Gatepass'} onClose={() => setModal(null)} wide>
          <form onSubmit={handleCreateGatePass} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3">
                <LocationPicker
                  required
                  label={t('location') || 'Branch / Godown Location'}
                  value={{
                    location_type: gatePassForm.location_type,
                    branch_id: gatePassForm.branch_id,
                    godown_id: gatePassForm.godown_id,
                  }}
                  onChange={(loc) => setGatePassForm(f => ({
                    ...f,
                    location_type: loc.location_type,
                    branch_id: loc.branch_id,
                    godown_id: loc.godown_id,
                  }))}
                />
              </div>

              <div>
                <FormLabel>{t('gatepassType') || 'Dispatch Type'}</FormLabel>
                <select className="input" value={gatePassForm.type} onChange={e => setGatePassForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="sale_dispatch">{t('saleDispatch') || 'Sale Dispatch'}</option>
                  <option value="pre_sale">{t('preSale') || 'Pre-Sale Dispatch'}</option>
                  <option value="transfer">{t('transfer') || 'Stock Transfer'}</option>
                  <option value="return">{t('sampleReturn') || 'Return / Sample'}</option>
                  <option value="other">{t('otherDispatch') || 'Other Dispatch'}</option>
                </select>
              </div>

              <div>
                <FormLabel required>{t('gatepassDate') || 'Gatepass Date & Time'}</FormLabel>
                <input
                  type="datetime-local"
                  className="input"
                  required
                  value={gatePassForm.gate_pass_date}
                  onChange={e => setGatePassForm(f => ({ ...f, gate_pass_date: e.target.value }))}
                />
              </div>

              <div>
                <FormLabel>{t('receiverName') || 'Receiver / Customer'}</FormLabel>
                <input
                  className="input"
                  placeholder="Receiver or customer name..."
                  value={gatePassForm.customer_name}
                  onChange={e => setGatePassForm(f => ({ ...f, customer_name: e.target.value }))}
                />
              </div>

              <div>
                <FormLabel>{t('receiverPhone') || 'Receiver Phone'}</FormLabel>
                <input
                  className="input"
                  placeholder="Receiver phone number..."
                  value={gatePassForm.customer_phone}
                  onChange={e => setGatePassForm(f => ({ ...f, customer_phone: e.target.value }))}
                />
              </div>

              <div>
                <FormLabel>{t('vehicleNo') || 'Vehicle Number'}</FormLabel>
                <input
                  className="input"
                  placeholder="e.g. LES-1234, Suzuki Truck..."
                  value={gatePassForm.vehicle_no}
                  onChange={e => setGatePassForm(f => ({ ...f, vehicle_no: e.target.value }))}
                />
              </div>

              <div>
                <FormLabel>{t('driverName') || 'Driver Name'}</FormLabel>
                <input
                  className="input"
                  placeholder="Driver full name..."
                  value={gatePassForm.driver_name}
                  onChange={e => setGatePassForm(f => ({ ...f, driver_name: e.target.value }))}
                />
              </div>

              <div>
                <FormLabel>{t('driverPhone') || 'Driver Phone'}</FormLabel>
                <input
                  className="input"
                  placeholder="Driver phone number..."
                  value={gatePassForm.driver_phone}
                  onChange={e => setGatePassForm(f => ({ ...f, driver_phone: e.target.value }))}
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Dispatched Products / Items<span className="text-red-400 ms-0.5">*</span>
                </span>
                <button type="button" onClick={() => setGatePassForm(f => ({ ...f, items: [...f.items, { product_id: '', product_name: '', quantity: 1, unit: 'kg', notes: '' }] }))} className="text-xs text-indigo-400 hover:underline">
                  {t('addLine') || '+ Add line'}
                </button>
              </div>

              {gatePassForm.items.map((item, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center rounded-lg p-2" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="sm:col-span-4">
                    <select
                      className="input text-xs"
                      value={item.product_id || ''}
                      onChange={e => {
                        const pid = e.target.value;
                        const prod = products.find(p => String(p.id) === String(pid));
                        setGatePassForm(f => {
                          const items = [...f.items];
                          items[i] = {
                            ...items[i],
                            product_id: pid,
                            product_name: prod ? prod.name : items[i].product_name,
                            unit: prod ? (prod.unit || 'kg') : items[i].unit
                          };
                          return { ...f, items };
                        });
                      }}
                    >
                      <option value="">-- Pick Product or Custom --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <input
                      className="input text-xs"
                      placeholder="Item description..."
                      value={item.product_name}
                      onChange={e => {
                        const val = e.target.value;
                        setGatePassForm(f => {
                          const items = [...f.items];
                          items[i] = { ...items[i], product_name: val };
                          return { ...f, items };
                        });
                      }}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      type="number"
                      min="0.1"
                      step="0.01"
                      required
                      className="input text-xs"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={e => {
                        const val = e.target.value;
                        setGatePassForm(f => {
                          const items = [...f.items];
                          items[i] = { ...items[i], quantity: val };
                          return { ...f, items };
                        });
                      }}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      className="input text-xs"
                      placeholder="Unit (kg, pcs)"
                      value={item.unit}
                      onChange={e => {
                        const val = e.target.value;
                        setGatePassForm(f => {
                          const items = [...f.items];
                          items[i] = { ...items[i], unit: val };
                          return { ...f, items };
                        });
                      }}
                    />
                  </div>
                  <div className="sm:col-span-1 text-end">
                    {gatePassForm.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setGatePassForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))}
                        className="text-red-400 hover:text-red-300 text-lg px-2"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Remarks */}
            <div>
              <FormLabel>{t('remarks') || 'Remarks / Notes'}</FormLabel>
              <textarea
                className="input min-h-[60px] resize-none"
                placeholder="Gatepass remarks, vehicle details, special instructions..."
                value={gatePassForm.remarks}
                onChange={e => setGatePassForm(f => ({ ...f, remarks: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 bg-indigo-600 hover:bg-indigo-700">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (t('createGatepass') || 'Save & Print Gatepass')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
