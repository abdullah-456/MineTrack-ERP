import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, Plus, Search, Eye, Loader2, Receipt, Calendar, CreditCard, ChevronRight } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import api from '../../api/axios';

const EMPTY_INSTALLMENT = {
  down_payment: '0',
  number_of_installments: '6',
  frequency: 'monthly',
  markup_rate: '0',
  start_date: new Date().toISOString().slice(0, 10),
};

export default function Sales() {
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams, branches } = useShopApi();
  const isRTL = lang === 'ur';

  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customer_id: '', branch_id: '', employee_id: '', sale_type: 'cash',
    items: [{ product_id: '', quantity: 1, unit_price: '' }],
    discount: '0', tax: '0', payment_method: 'cash',
  });
  const [installmentPlan, setInstallmentPlan] = useState(EMPTY_INSTALLMENT);

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
    if (branches.length && !form.branch_id) {
      setForm(f => ({ ...f, branch_id: String(branches[0].id) }));
    }
  }, [branches, form.branch_id]);

  const stockForProduct = (productId, branchId) => {
    const p = products.find(x => String(x.id) === String(productId));
    if (!p?.Stock) return 0;
    const bid = branchId || form.branch_id;
    if (bid) {
      const row = p.Stock.find(s => String(s.branch_id) === String(bid));
      return row?.quantity_on_hand ?? 0;
    }
    return p.Stock.reduce((sum, s) => sum + s.quantity_on_hand, 0);
  };

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
      return sum + (parseFloat(it.unit_price) || 0) * (parseInt(it.quantity, 10) || 0);
    }, 0),
  [form.items]);
  const total = useMemo(() =>
    subtotal - (parseFloat(form.discount) || 0) + (parseFloat(form.tax) || 0),
  [subtotal, form.discount, form.tax]);

  // Installment preview schedule
  const installmentPreview = useMemo(() => {
    if (form.sale_type !== 'installment') return [];
    const dp = parseFloat(installmentPlan.down_payment || 0);
    const principal = total - dp;
    if (principal <= 0 || !installmentPlan.number_of_installments) return [];
    const markup = parseFloat(installmentPlan.markup_rate || 0) / 100;
    const totalWithMarkup = principal * (1 + markup);
    const num = parseInt(installmentPlan.number_of_installments, 10);
    if (!num || num <= 0) return [];
    const perInst = Math.round((totalWithMarkup / num) * 100) / 100;
    const rows = [];
    for (let i = 1; i <= num; i++) {
      const d = new Date(installmentPlan.start_date || new Date());
      if (installmentPlan.frequency === 'monthly') d.setMonth(d.getMonth() + (i - 1));
      else d.setDate(d.getDate() + (i - 1) * 7);
      rows.push({
        no: i,
        due_date: d.toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK'),
        amount: i === num ? Math.round((totalWithMarkup - perInst * (num - 1)) * 100) / 100 : perInst,
      });
    }
    return rows;
  }, [form.sale_type, installmentPlan, total, lang]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const items = form.items.filter(i => i.product_id).map(i => ({
        product_id: parseInt(i.product_id, 10),
        quantity: parseInt(i.quantity, 10),
        unit_price: parseFloat(i.unit_price),
      }));
      if (!items.length) { error(t('addAtLeastOneItem')); setSaving(false); return; }
      if (!form.branch_id) { error(t('selectBranch')); setSaving(false); return; }
      if ((form.sale_type === 'installment' || form.sale_type === 'credit') && !form.customer_id) {
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
        ...shopParams(),
      };

      if (form.sale_type === 'installment') {
        payload.installment_plan = {
          down_payment: parseFloat(installmentPlan.down_payment || 0),
          number_of_installments: parseInt(installmentPlan.number_of_installments, 10),
          frequency: installmentPlan.frequency,
          markup_rate: parseFloat(installmentPlan.markup_rate || 0),
          start_date: installmentPlan.start_date,
        };
      }

      await api.post('/sales', payload);
      success(t('saleCreated'));
      setModal(null);
      fetchData();
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

  const setIP = (k) => (e) => setInstallmentPlan(p => ({ ...p, [k]: e.target.value }));

  const saleTypeBadgeColor = {
    cash: 'badge-green', bank: 'badge-blue', credit: 'badge-yellow', installment: 'badge-purple', card: 'badge-blue',
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={TrendingUp}
        accent="rose"
        title={t('sales')}
        subtitle={t('salesSub')}
        action={
          <button
            type="button"
            onClick={() => {
              setForm({ customer_id: '', branch_id: branches[0]?.id || '', sale_type: 'cash', items: [{ product_id: '', quantity: 1, unit_price: '' }], discount: '0', tax: '0', payment_method: 'cash' });
              setInstallmentPlan(EMPTY_INSTALLMENT);
              setModal('create');
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />{t('newSale')}
          </button>
        }
      />

      <div className="glass-card p-4">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingInlineStart: '2.5rem' }} placeholder={t('searchInvoice')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
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
              {sales.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
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
                    {s.sale_type === 'installment' && s.InstallmentPlan && (
                      <span className="ms-1 text-xs text-purple-400">({s.InstallmentPlan.status})</span>
                    )}
                  </td>
                  <td className="p-4 font-bold text-emerald-400">{formatPKR(s.total, lang)}</td>
                  <td className="p-4"><StatusBadge status={s.status} /></td>
                  <td className="p-4 text-end">
                    <button type="button" onClick={() => viewDetail(s.id)} className="icon-btn"><Eye className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
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
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                  {t('customer')} {(form.sale_type === 'installment' || form.sale_type === 'credit') && <span className="text-red-400">*</span>}
                </label>
                <select className="input" value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}>
                  <option value="">{t('walkIn')} ({t('walkin')})</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({t('registered')}){c.phone ? ` - ${c.phone}` : ''}
                    </option>
                  ))}
                </select>
                {(form.sale_type === 'installment' || form.sale_type === 'credit') && !form.customer_id && (
                  <p className="text-xs text-amber-400 mt-1">⚠ {t('mustSelectRegisteredCustomer')}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('userBranch')} *</label>
                <select className="input" required value={form.branch_id} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Employee / Sales Agent (Optional)</label>
                <select className="input" value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}>
                  <option value="">Select Employee (Optional)</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.designation || 'Staff'})</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('saleType')}</label>
                <div className="grid grid-cols-4 gap-2">
                  {['cash', 'bank', 'credit', 'installment'].map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, sale_type: type, payment_method: type === 'installment' ? 'cash' : type }))}
                      className={`py-2 rounded-lg text-sm font-medium border transition-all ${
                        form.sale_type === type
                          ? type === 'installment' ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                          : type === 'credit' ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                          : type === 'bank' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                          : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                          : 'hover:bg-white/5'
                      }`}
                      style={form.sale_type !== type ? { color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' } : {}}
                    >
                      {t(type)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('saleItems')}</label>
                <button type="button" onClick={addLine} className="text-xs text-brand-400 hover:underline">{t('addLine')}</button>
              </div>
              {form.items.map((item, i) => {
                const avail = item.product_id ? stockForProduct(item.product_id, form.branch_id) : null;
                return (
                  <div key={i} className="space-y-1">
                    <div className="grid grid-cols-3 gap-2 items-center">
                      <select className="input col-span-2" required value={item.product_id} onChange={e => updateLine(i, 'product_id', e.target.value)}>
                        <option value="">{t('selectProduct')}</option>
                        {products.filter(p => p.status === 'active').map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({stockForProduct(p.id, form.branch_id)} {t('inStock')})</option>
                        ))}
                      </select>
                      <div className="flex gap-1.5">
                        <input className="input w-16" type="number" min="1" max={avail || undefined} value={item.quantity} onChange={e => updateLine(i, 'quantity', e.target.value)} />
                        <input className="input flex-1" type="number" min="0" step="0.01" placeholder={t('price')} value={item.unit_price} onChange={e => updateLine(i, 'unit_price', e.target.value)} />
                        {form.items.length > 1 && (
                          <button type="button" onClick={() => removeLine(i)} className="px-2 text-red-400 hover:text-red-300 text-lg">×</button>
                        )}
                      </div>
                    </div>
                    {avail !== null && item.quantity > avail && (
                      <p className="text-xs text-red-400">{t('insufficientStock')}: {avail}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Discount + Tax */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('discount')}</label>
                <input className="input" type="number" min="0" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('tax')}</label>
                <input className="input" type="number" min="0" value={form.tax} onChange={e => setForm(f => ({ ...f, tax: e.target.value }))} />
              </div>
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
              </div>
            )}

            {/* ── Installment Plan Section ── */}
            {form.sale_type === 'installment' && (
              <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.25)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-4 h-4 text-purple-400" />
                  <h3 className="font-semibold text-sm text-purple-400">{t('installmentPlan')}</h3>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('downPayment')}</label>
                    <input className="input" type="number" min="0" max={total} value={installmentPlan.down_payment} onChange={setIP('down_payment')} />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('numInstallments')}</label>
                    <input className="input" type="number" min="1" max="60" value={installmentPlan.number_of_installments} onChange={setIP('number_of_installments')} />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('frequency')}</label>
                    <select className="input" value={installmentPlan.frequency} onChange={setIP('frequency')}>
                      <option value="monthly">{t('monthly')}</option>
                      <option value="weekly">{t('weekly')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('markupRate')}</label>
                    <input className="input" type="number" min="0" step="0.1" value={installmentPlan.markup_rate} onChange={setIP('markup_rate')} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('startDate')}</label>
                    <input className="input" type="date" value={installmentPlan.start_date} onChange={setIP('start_date')} />
                  </div>
                </div>

                {/* Per-installment summary */}
                {installmentPreview.length > 0 && (
                  <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(168,85,247,0.08)' }}>
                    <p className="font-medium text-purple-300 mb-1">
                      {t('perInstallment')}: <span className="text-white">{formatPKR(installmentPreview[0]?.amount, lang)}</span>
                    </p>
                    <p style={{ color: 'var(--text-muted)' }}>
                      {t('downPayment')}: {formatPKR(installmentPlan.down_payment, lang)} + {installmentPreview.length} × {formatPKR(installmentPreview[0]?.amount, lang)}
                    </p>
                  </div>
                )}

                {/* Schedule Preview */}
                {installmentPreview.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-2 text-purple-300">{t('installmentPreview')}</p>
                    <div className="max-h-48 overflow-y-auto rounded-lg" style={{ border: '1px solid var(--border-subtle)' }}>
                      <table className="w-full text-xs">
                        <thead style={{ background: 'var(--bg-elevated)' }}>
                          <tr>
                            <th className="text-start p-2 font-medium" style={{ color: 'var(--text-muted)' }}>{t('installmentNo')}</th>
                            <th className="text-start p-2 font-medium" style={{ color: 'var(--text-muted)' }}>{t('dueDate')}</th>
                            <th className="text-end p-2 font-medium" style={{ color: 'var(--text-muted)' }}>{t('dueAmount')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {installmentPreview.map(row => (
                            <tr key={row.no} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                              <td className="p-2 text-purple-400 font-mono">#{row.no}</td>
                              <td className="p-2" style={{ color: 'var(--text-secondary)' }}>{row.due_date}</td>
                              <td className="p-2 text-end font-medium text-emerald-400">{formatPKR(row.amount, lang)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
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
                <StatusBadge status={detail.status} />
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
                    <td className="p-2" style={{ color: 'var(--text-secondary)' }}>{item.quantity}</td>
                    <td className="p-2 text-end text-emerald-400">{formatPKR(item.line_total, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Installment Plan Summary in Detail */}
            {detail.InstallmentPlan && (
              <div className="rounded-xl p-4" style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)' }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-purple-400" />
                    <span className="font-semibold text-sm text-purple-400">{t('installmentPlan')}</span>
                  </div>
                  <span className={`badge ${detail.InstallmentPlan.status === 'closed' ? 'badge-green' : detail.InstallmentPlan.status === 'defaulted' ? 'badge-red' : 'badge-purple'}`}>
                    {t(detail.InstallmentPlan.status + 'Plan') || detail.InstallmentPlan.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('downPayment')}</p>
                    <p className="font-medium text-emerald-400">{formatPKR(detail.InstallmentPlan.down_payment, lang)}</p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('numInstallments')}</p>
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{detail.InstallmentPlan.number_of_installments}</p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('frequency')}</p>
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{t(detail.InstallmentPlan.frequency)}</p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('markupRate')}</p>
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{detail.InstallmentPlan.markup_rate}%</p>
                  </div>
                </div>
                {detail.InstallmentPlan.InstallmentSchedules?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{t('installmentPreview')}</p>
                    <div className="max-h-36 overflow-y-auto rounded-lg" style={{ border: '1px solid var(--border-subtle)' }}>
                      <table className="w-full text-xs">
                        <tbody>
                          {detail.InstallmentPlan.InstallmentSchedules.map(s => (
                            <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                              <td className="p-1.5 text-purple-400 font-mono">#{s.installment_no}</td>
                              <td className="p-1.5" style={{ color: 'var(--text-secondary)' }}>
                                {new Date(s.due_date).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK')}
                              </td>
                              <td className="p-1.5 text-end text-emerald-400">{formatPKR(s.due_amount, lang)}</td>
                              <td className="p-1.5 text-end">
                                <span className={`badge text-xs ${s.status === 'paid' ? 'badge-green' : s.status === 'overdue' ? 'badge-red' : 'badge-yellow'}`}>
                                  {t(s.status)}
                                </span>
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
          </div>
        </Modal>
      )}
    </div>
  );
}
