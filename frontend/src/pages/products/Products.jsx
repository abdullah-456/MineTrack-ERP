import { useState, useEffect, useCallback } from 'react';
import { Package, Plus, Search, Edit, Loader2, Trash2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import StatusBadge, { StockBadge } from '../../components/ui/StatusBadge';
import ReportActions from '../../components/ui/ReportActions';
import ReportFilters, { activeFilterList } from '../../components/ui/ReportFilters';
import { BankAccountPicker, CashAccountPicker } from '../../components/ui/PaymentAccountSelect';
import LocationPicker from '../../components/ui/LocationPicker';
import { defaultLocation } from '../../utils/locationUtils';
import api from '../../api/axios';

const EMPTY = {
  name: '', sku: '', barcode: '', category_id: '', brand: '',
  cost_price: '0', sale_price: '', tax_rate: '0', reorder_level: '5',
  supplier_id: '', initial_quantity: '0',
  location_type: 'branch', branch_id: '', godown_id: null,
  status: 'active',
  payment_status: 'unpaid', paid_amount: '', payment_method: 'cash', bank_account_id: null,
};

export default function Products() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams, branches } = useShopApi();
  const isRTL = lang === 'ur';

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reportFilters, setReportFilters] = useState({ category_id: '', status: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    // Independent requests (allSettled, not all): a role that can read
    // products but not suppliers (e.g. the built-in cashier role, or any
    // custom role scoped to inventory only) must still see the product list
    // — categories/suppliers are only used for the Add/Edit form's dropdowns.
    const params = { ...shopParams(), search };
    const [pRes, cRes, sRes] = await Promise.allSettled([
      api.get('/products', { params }),
      api.get('/categories', { params: shopParams() }),
      api.get('/suppliers', { params: shopParams() }),
    ]);
    if (pRes.status === 'fulfilled') {
      setProducts(pRes.value.data.products || []);
    } else {
      setProducts([]);
      error(pRes.reason?.response?.data?.message || t('toastErrorGeneric'));
    }
    setCategories(cRes.status === 'fulfilled' ? (cRes.value.data.categories || []) : []);
    setSuppliers(sRes.status === 'fulfilled' ? (sRes.value.data.suppliers || []) : []);
    setLoading(false);
  }, [shopParams, search, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalStock = (p) => (p.Stock || []).reduce((s, x) => s + (parseFloat(x.quantity_on_hand) || 0), 0);

  const openCreate = () => {
    setForm({ ...EMPTY, ...defaultLocation(branches) });
    setSelected(null);
    setModal('create');
  };

  const openEdit = (p) => {
    setSelected(p);
    setForm({
      name: p.name, sku: p.sku, barcode: p.barcode || '', category_id: p.category_id,
      brand: p.brand || '', cost_price: p.cost_price,
      sale_price: p.sale_price, tax_rate: p.tax_rate, reorder_level: p.reorder_level,
      status: p.status, supplier_id: '', initial_quantity: '0',
      location_type: 'branch', branch_id: '', godown_id: null,
      payment_status: 'unpaid', paid_amount: '', payment_method: 'cash', bank_account_id: null,
    });
    setModal('edit');
  };

  const handleDelete = async (p) => {
    const ok = await confirm({ title: t('delete'), message: t('confirmDeleteProduct'), confirmLabel: t('delete'), cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      const res = await api.delete(`/products/${p.id}`, { params: shopParams() });
      success(res.status === 202 ? t('deletionRequestSubmitted') : t('productDeleted'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const initialQty = parseFloat(form.initial_quantity) || 0;
      if (initialQty > 0 && !form.branch_id) {
        error(t('selectBranch') || 'Please select a location for initial stock');
        setSaving(false);
        return;
      }
      const payload = {
        name: form.name,
        sku: form.sku,
        barcode: form.barcode,
        category_id: form.category_id,
        brand: form.brand,
        cost_price: parseFloat(form.cost_price) || 0,
        sale_price: parseFloat(form.sale_price),
        tax_rate: parseFloat(form.tax_rate) || 0,
        reorder_level: parseInt(form.reorder_level, 10) || 5,
        status: form.status,
        initial_quantity: initialQty,
        supplier_id: form.supplier_id || undefined,
        branch_id: form.branch_id || undefined,
        ...shopParams(),
      };
      if (initialQty > 0) {
        payload.payment_status = form.payment_status;
        payload.payment_method = form.payment_method;
        if (form.payment_status === 'partial') {
          payload.paid_amount = parseFloat(form.paid_amount) || 0;
        }
      } else {
        delete payload.payment_status;
        delete payload.paid_amount;
        delete payload.payment_method;
      }
      if (modal === 'create') {
        // Open the tab synchronously (still inside the click gesture) and
        // navigate it once the response arrives — opening it only after the
        // `await` below would get silently blocked as a non-user-initiated popup.
        // Must NOT pass noopener/noreferrer: both make window.open() return
        // null, silently breaking this open-now-navigate-later pattern.
        const printTab = window.open('', '_blank');
        const { data } = await api.post('/products', payload);
        success(t('productCreated'));
        if (data.voucher_id && printTab) {
          printTab.location.href = `/vouchers/${data.voucher_id}?auto_print=1`;
        } else if (printTab) {
          printTab.close();
        }
      } else {
        await api.put(`/products/${selected.id}`, payload);
        success(t('productUpdated'));
      }
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // ── Report model ────────────────────────────────────────────────────────────
  const reportSelects = [
    { key: 'category_id', label: t('category') || 'Category', options: categories.map(c => ({ value: c.id, label: c.name })) },
    { key: 'status', label: t('status') || 'Status', options: [{ value: 'active', label: t('active') || 'Active' }, { value: 'inactive', label: t('inactive') || 'Inactive' }] },
  ];
  let reportRows = products;
  if (reportFilters.category_id) reportRows = reportRows.filter(p => String(p.category_id) === String(reportFilters.category_id));
  if (reportFilters.status) reportRows = reportRows.filter(p => p.status === reportFilters.status);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    reportRows = reportRows.filter(p =>
      (p.sku || '').toLowerCase().includes(q) ||
      (p.name || '').toLowerCase().includes(q) ||
      (p.brand || '').toLowerCase().includes(q) ||
      (p.Category?.name || '').toLowerCase().includes(q) ||
      (p.unit || '').toLowerCase().includes(q) ||
      (p.status || '').toLowerCase().includes(q) ||
      (String(p.cost_price) || '').toLowerCase().includes(q) ||
      (String(p.sale_price) || '').toLowerCase().includes(q) ||
      (p.ProductSuppliers || []).some(ps => (ps.Supplier?.company_name || '').toLowerCase().includes(q))
    );
  }
  const reportColumns = [
    { header: t('sku') || 'SKU', key: 'sku', width: 1 },
    { header: t('name') || 'Name', render: p => p.name + (p.brand ? ` (${p.brand})` : ''), width: 2 },
    { header: t('category') || 'Category', render: p => p.Category?.name || '', width: 1.2 },
    { header: t('totalStock') || 'Stock', key: 'stock', render: p => totalStock(p), qty: true, align: 'right', width: 0.9 },
    { header: t('costPrice') || 'Cost', key: 'cost_price', money: true, width: 1 },
    { header: t('salePrice') || 'Sale', key: 'sale_price', money: true, width: 1 },
    { header: t('stockValue') || 'Stock Value', key: 'stock_value', render: p => totalStock(p) * parseFloat(p.cost_price || 0), money: true, width: 1.1 },
    { header: t('status') || 'Status', key: 'status', width: 0.9 },
  ];
  const reportTotals = {
    __label: t('total') || 'Total',
    stock: reportRows.reduce((s, p) => s + totalStock(p), 0),
    stock_value: reportRows.reduce((s, p) => s + totalStock(p) * parseFloat(p.cost_price || 0), 0),
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Package}
        accent="blue"
        title={t('products')}
        subtitle={t('productsSub')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={t('products') || 'Products Report'}
              columns={reportColumns}
              rows={reportRows}
              totals={reportTotals}
              filters={activeFilterList(reportFilters, reportSelects)}
              filename="products-report.pdf"
            />
            <button type="button" onClick={openCreate} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('addProduct')}
            </button>
          </div>
        }
      />

      <div className="glass-card p-4 space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" style={{ [isRTL ? 'right' : 'left']: '12px' }} />
          <input className="input" style={{ paddingInlineStart: '2.5rem' }} placeholder={t('searchProducts')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <ReportFilters
          value={reportFilters}
          onChange={(k, v) => setReportFilters(f => ({ ...f, [k]: v }))}
          onClear={() => setReportFilters({ category_id: '', status: '' })}
          selects={reportSelects}
          showDates={false}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-400" /></div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('sku')}</th>
                <th className="text-start p-4">{t('name')}</th>
                <th className="text-start p-4">{t('category')}</th>
                <th className="text-start p-4">{t('totalStock')}</th>
                <th className="text-start p-4">{t('costPrice')}</th>
                <th className="text-start p-4">{t('salePrice')}</th>
                <th className="text-start p-4">{t('status')}</th>
                <th className="text-end p-4">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-mono text-blue-400 text-xs">{p.sku}</td>
                  <td className="p-4">
                    <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</div>
                    {p.brand && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.brand}</div>}
                  </td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{p.Category?.name}</td>
                  <td className="p-4"><StockBadge qty={totalStock(p)} reorder={p.reorder_level} /></td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{formatPKR(p.cost_price, lang)}</td>
                  <td className="p-4 font-semibold text-emerald-400">{formatPKR(p.sale_price, lang)}</td>
                  <td className="p-4"><StatusBadge status={p.status} /></td>
                  <td className="p-4 text-end">
                    <button type="button" onClick={() => openEdit(p)} className="icon-btn"><Edit className="w-4 h-4" /></button>
                    <button type="button" onClick={() => handleDelete(p)} className="icon-btn text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {reportRows.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noProducts')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal title={modal === 'create' ? t('addProduct') : t('editProduct')} onClose={() => setModal(null)} wide>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <FormLabel required>{t('name')}</FormLabel>
                <input className="input" required value={form.name} onChange={setF('name')} />
              </div>
              <div>
                <FormLabel required>{t('category')}</FormLabel>
                <select className="input" required value={form.category_id} onChange={setF('category_id')}>
                  <option value="">{t('selectCategory')}</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <FormLabel>{t('brand')}</FormLabel>
                <input className="input" value={form.brand} onChange={setF('brand')} />
              </div>
              <div>
                <FormLabel>{t('sku')}</FormLabel>
                <input className="input" value={form.sku} onChange={setF('sku')} placeholder={t('autoGenerated')} />
              </div>
              <div>
                <FormLabel>{t('barcode')}</FormLabel>
                <input className="input" value={form.barcode} onChange={setF('barcode')} />
              </div>
              <div>
                <FormLabel>{t('costPrice')}</FormLabel>
                <input className="input" type="number" min="0" step="0.01" value={form.cost_price} onChange={setF('cost_price')} />
              </div>
              <div>
                <FormLabel required>{t('salePrice')}</FormLabel>
                <input className="input" type="number" min="0" step="0.01" required value={form.sale_price} onChange={setF('sale_price')} />
              </div>
              <div>
                <FormLabel>{t('reorderLevel')}</FormLabel>
                <input className="input" type="number" min="0" value={form.reorder_level} onChange={setF('reorder_level')} />
              </div>
              {modal === 'create' && (
                <>
                  <div>
                    <FormLabel>{t('supplier')}</FormLabel>
                    <select className="input" value={form.supplier_id} onChange={setF('supplier_id')}>
                      <option value="">{t('optional')}</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <FormLabel>{t('initialStock')} ({t('kg') || 'kg'})</FormLabel>
                    <input className="input" type="number" min="0" step="0.1" value={form.initial_quantity} onChange={setF('initial_quantity')} />
                  </div>
                  <div>
                    <LocationPicker
                      required={(parseFloat(form.initial_quantity) || 0) > 0}
                      label={t('location') || t('userBranch')}
                      value={{
                        location_type: form.location_type,
                        branch_id: form.branch_id,
                        godown_id: form.godown_id,
                      }}
                      onChange={(loc) => setForm(f => ({
                        ...f,
                        location_type: loc.location_type,
                        branch_id: loc.branch_id,
                        godown_id: loc.godown_id,
                      }))}
                    />
                  </div>
                </>
              )}
            </div>

            {modal === 'create' && (parseFloat(form.initial_quantity) || 0) > 0 && (() => {
              const sup = form.supplier_id ? suppliers.find(s => String(s.id) === String(form.supplier_id)) : null;
              const availableCredit = parseFloat(sup?.credit_balance || 0);
              const totalCost = (parseFloat(form.initial_quantity) || 0) * (parseFloat(form.cost_price) || 0);
              return (
                <div className="rounded-lg p-3 space-y-3" style={{ border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-elevated)' }}>
                  <label className="text-xs font-semibold block" style={{ color: 'var(--text-secondary)' }}>{t('paid') || 'Paid?'}</label>
                  <div className="flex gap-2">
                    {['unpaid', 'paid', 'partial'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, payment_status: opt }))}
                        className={`px-3 py-1.5 rounded text-xs font-bold flex-1 transition-all ${form.payment_status === opt ? 'bg-emerald-500 text-white' : ''
                          }`}
                        style={form.payment_status !== opt ? { backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' } : {}}
                      >
                        {opt === 'unpaid' ? (t('no') || 'No') : opt === 'paid' ? (t('yes') || 'Yes') : (t('partial') || 'Partial')}
                      </button>
                    ))}
                  </div>

                  {form.payment_status !== 'unpaid' && (
                    <div className="grid grid-cols-2 gap-3">
                      {form.payment_status === 'partial' && (
                        <div>
                          <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>{t('amountPaid') || 'Amount Paid'}</label>
                          <input
                            className="input" type="number" step="0.01" min="0" max={totalCost || undefined}
                            value={form.paid_amount} onChange={setF('paid_amount')}
                          />
                        </div>
                      )}
                      <div className={form.payment_status === 'partial' ? '' : 'col-span-2'}>
                        <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>{t('method') || 'Method'}</label>
                        <select className="input" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value, bank_account_id: null }))}>
                          <option value="cash">{t('cash') || 'Cash'}</option>
                          <option value="bank">{t('bank') || 'Bank'}</option>
                          {form.supplier_id && (
                            <option value="supplier_credit" disabled={availableCredit <= 0}>
                              {(t('supplierCredit') || 'Supplier Credit')} ({formatPKR(availableCredit, lang)} {t('available') || 'available'})
                            </option>
                          )}
                        </select>
                        {form.payment_method === 'cash' && (
                          <CashAccountPicker
                            className="input mt-2"
                            value={form.bank_account_id}
                            onChange={bank_account_id => setForm(f => ({ ...f, bank_account_id }))}
                          />
                        )}
                        {form.payment_method === 'bank' && (
                          <BankAccountPicker
                            required
                            className="input mt-2"
                            value={form.bank_account_id}
                            onChange={bank_account_id => setForm(f => ({ ...f, bank_account_id }))}
                          />
                        )}
                      </div>
                    </div>
                  )}
                  {form.supplier_id && availableCredit > 0 && totalCost > 0 && (
                    <p className="text-xs text-emerald-400">
                      {form.payment_status === 'unpaid'
                        ? (t('supplierCreditAutoApply') || 'Prepaid supplier credit will apply automatically — payable only increases if the purchase exceeds available credit.')
                        : (t('supplierCreditAutoApplyPartial') || 'Any remaining amount after cash/bank payment will also draw from prepaid supplier credit first.')}
                      {' '}{formatPKR(Math.min(availableCredit, totalCost), lang)} {t('available') || 'available'}.
                    </p>
                  )}
                  {totalCost > 0 && (
                    <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('totalCost') || 'Total cost'}: {formatPKR(totalCost, lang)}</p>
                  )}
                </div>
              );
            })()}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">{t('save')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
