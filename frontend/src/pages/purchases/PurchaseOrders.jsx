import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList, Plus, Search, Loader2, Send, Ban, Trash2, PackageCheck, Eye, Edit, RefreshCw, Printer,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR, formatQty } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import LocationPicker from '../../components/ui/LocationPicker';
import { defaultLocation } from '../../utils/locationUtils';
import api from '../../api/axios';

const STATUS_BADGE = {
  draft: 'badge-yellow',
  sent: 'badge-blue',
  partially_received: 'badge-purple',
  received: 'badge-green',
  cancelled: 'badge-red',
};

const EMPTY_LINE = { product_id: '', quantity_ordered: 1, unit_cost: '', notes: '' };

export default function PurchaseOrders() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams, branches, shopId } = useShopApi();
  const navigate = useNavigate();
  const isRTL = lang === 'ur';

  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    supplier_id: '',
    ...defaultLocation(branches),
    order_date: new Date().toISOString().slice(0, 10),
    expected_date: '',
    discount: '0',
    tax: '0',
    notes: '',
    items: [{ ...EMPTY_LINE }],
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams(), search, status: statusFilter !== 'all' ? statusFilter : undefined };
      const [poRes, supRes, prodRes] = await Promise.all([
        api.get('/purchase-orders', { params }),
        api.get('/suppliers', { params: shopParams() }),
        api.get('/products', { params: shopParams() }),
      ]);
      setOrders(poRes.data.purchase_orders || []);
      setSuppliers(supRes.data.suppliers || []);
      setProducts(prodRes.data.products || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, search, statusFilter, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (branches.length && !form.branch_id) {
      setForm(f => ({ ...f, ...defaultLocation(branches) }));
    }
  }, [branches, form.branch_id]);

  const resetForm = () => setForm({
    supplier_id: '',
    ...defaultLocation(branches),
    order_date: new Date().toISOString().slice(0, 10),
    expected_date: '',
    discount: '0',
    tax: '0',
    notes: '',
    items: [{ ...EMPTY_LINE }],
  });

  const openCreate = () => { resetForm(); setModal('create'); };
  const openEdit = (order) => {
    setForm({
      id: order.id,
      supplier_id: order.supplier_id,
      branch_id: order.branch_id || '',
      location_type: 'branch',
      godown_id: null,
      order_date: order.order_date,
      expected_date: order.expected_date || '',
      discount: String(order.discount || 0),
      tax: String(order.tax || 0),
      notes: order.notes || '',
      items: (order.PurchaseOrderItems || []).map(i => ({
        product_id: i.product_id,
        quantity_ordered: i.quantity_ordered,
        unit_cost: i.unit_cost,
        notes: i.notes || '',
      })),
    });
    setModal('edit');
  };

  const addLine = () => setForm(f => ({ ...f, items: [...f.items, { ...EMPTY_LINE }] }));
  const updateLine = (idx, key, val) => setForm(f => {
    const items = [...f.items];
    items[idx] = { ...items[idx], [key]: val };
    if (key === 'product_id') {
      const prod = products.find(p => String(p.id) === String(val));
      if (prod && !items[idx].unit_cost) items[idx].unit_cost = prod.cost_price || '';
    }
    return { ...f, items };
  });
  const removeLine = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const buildPayload = () => ({
    supplier_id: form.supplier_id,
    branch_id: form.branch_id || null,
    order_date: form.order_date,
    expected_date: form.expected_date || null,
    discount: parseFloat(form.discount) || 0,
    tax: parseFloat(form.tax) || 0,
    notes: form.notes,
    items: form.items.filter(i => i.product_id).map(i => ({
      product_id: i.product_id,
      quantity_ordered: parseFloat(i.quantity_ordered) || 0,
      unit_cost: parseFloat(i.unit_cost) || 0,
      notes: i.notes,
    })),
  });

  const openPrint = (orderId, autoPrint = false) => {
    const qs = new URLSearchParams();
    if (shopId) qs.set('shop_id', shopId);
    if (autoPrint) qs.set('auto_print', '1');
    const q = qs.toString();
    window.open(`/purchase-order/${orderId}${q ? `?${q}` : ''}`, '_blank', 'noopener,noreferrer');
  };

  const handleSave = async (e, sendAfter = false) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = buildPayload();
      if (modal === 'edit') {
        await api.put(`/purchase-orders/${form.id}`, payload);
        success(t('poUpdated') || 'Purchase order updated');
        setModal(null);
        fetchData();
      } else {
        const { data } = await api.post('/purchase-orders', { ...payload, status: sendAfter ? 'sent' : 'draft' });
        let po = data.purchase_order;
        if (sendAfter && po?.status === 'draft') {
          await api.post(`/purchase-orders/${po.id}/send`);
          po = { ...po, status: 'sent' };
        }
        success(sendAfter ? (t('poSent') || 'Purchase order sent') : (t('poCreated') || 'Purchase order created'));
        setModal(null);
        fetchData();
        if (po?.id) openPrint(po.id, true);
      }
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (order) => {
    try {
      await api.post(`/purchase-orders/${order.id}/send`);
      success(t('poSent') || 'Purchase order sent');
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const handleCancel = async (order) => {
    const ok = await confirm({
      title: t('cancelPO') || 'Cancel PO',
      message: t('confirmCancelPO') || 'Cancel this purchase order?',
      confirmLabel: t('cancelPO') || 'Cancel PO',
    });
    if (!ok) return;
    try {
      await api.post(`/purchase-orders/${order.id}/cancel`);
      success(t('poCancelled') || 'Purchase order cancelled');
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const handleDelete = async (order) => {
    const ok = await confirm({
      title: t('deletePO') || 'Delete PO',
      message: t('confirmDeletePO') || 'Delete this draft purchase order?',
      confirmLabel: t('delete') || 'Delete',
    });
    if (!ok) return;
    try {
      await api.delete(`/purchase-orders/${order.id}`);
      success(t('poDeleted') || 'Purchase order deleted');
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const handleReceive = (order) => {
    navigate(`/inventory?receivePo=${order.id}`);
  };

  const viewDetail = async (order) => {
    try {
      const { data } = await api.get(`/purchase-orders/${order.id}`);
      setDetail(data.purchase_order);
      setModal('detail');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const statusLabel = (s) => ({
    draft: t('poStatusDraft') || 'Draft',
    sent: t('poStatusSent') || 'Sent',
    partially_received: t('poStatusPartial') || 'Partial',
    received: t('poStatusReceived') || 'Received',
    cancelled: t('poStatusCancelled') || 'Cancelled',
  }[s] || s);

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={ClipboardList}
        accent="indigo"
        title={t('purchaseOrders') || 'Purchase Orders'}
        subtitle={t('purchaseOrdersSub') || 'Create POs for suppliers and receive stock against them'}
        action={
          <div className="flex gap-2">
            <button type="button" onClick={fetchData} className="icon-btn"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
            <button type="button" onClick={openCreate} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('newPO') || 'New PO'}
            </button>
          </div>
        }
      />

      <div className="glass-card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingInlineStart: '2.5rem' }} placeholder={t('search')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">{t('all')}</option>
          <option value="draft">{t('poStatusDraft') || 'Draft'}</option>
          <option value="sent">{t('poStatusSent') || 'Sent'}</option>
          <option value="partially_received">{t('poStatusPartial') || 'Partial'}</option>
          <option value="received">{t('poStatusReceived') || 'Received'}</option>
          <option value="cancelled">{t('poStatusCancelled') || 'Cancelled'}</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-400" /></div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('poNumber') || 'PO #'}</th>
                <th className="text-start p-4">{t('date')}</th>
                <th className="text-start p-4">{t('supplier')}</th>
                <th className="text-start p-4">{t('total')}</th>
                <th className="text-start p-4">{t('status')}</th>
                <th className="text-end p-4">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-mono text-indigo-400 text-xs">{o.po_number}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{o.order_date}</td>
                  <td className="p-4" style={{ color: 'var(--text-primary)' }}>{o.Supplier?.company_name}</td>
                  <td className="p-4 font-semibold text-emerald-400">{formatPKR(o.total, lang)}</td>
                  <td className="p-4"><span className={`badge ${STATUS_BADGE[o.status] || 'badge-blue'}`}>{statusLabel(o.status)}</span></td>
                  <td className="p-4 text-end whitespace-nowrap space-x-1">
                    <button type="button" className="icon-btn" title={t('viewDetails')} onClick={() => viewDetail(o)}><Eye className="w-4 h-4" /></button>
                    <button type="button" className="icon-btn text-indigo-400" title={t('printPO') || 'Print PO'} onClick={() => openPrint(o.id)}><Printer className="w-4 h-4" /></button>
                    {o.status === 'draft' && (
                      <>
                        <button type="button" className="icon-btn" title={t('edit')} onClick={() => openEdit(o)}><Edit className="w-4 h-4" /></button>
                        <button type="button" className="icon-btn text-blue-400" title={t('sendPO') || 'Send'} onClick={() => handleSend(o)}><Send className="w-4 h-4" /></button>
                        <button type="button" className="icon-btn text-red-400" title={t('delete')} onClick={() => handleDelete(o)}><Trash2 className="w-4 h-4" /></button>
                      </>
                    )}
                    {['sent', 'partially_received'].includes(o.status) && (
                      <button type="button" className="icon-btn text-emerald-400" title={t('receiveStock') || 'Receive'} onClick={() => handleReceive(o)}><PackageCheck className="w-4 h-4" /></button>
                    )}
                    {o.status === 'sent' && (
                      <button type="button" className="icon-btn text-amber-400" title={t('cancelPO')} onClick={() => handleCancel(o)}><Ban className="w-4 h-4" /></button>
                    )}
                  </td>
                </tr>
              ))}
              {!orders.length && (
                <tr><td colSpan={6} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noPOs') || 'No purchase orders yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'edit' ? (t('editPO') || 'Edit PO') : (t('newPO') || 'New PO')} onClose={() => setModal(null)} wide>
          <form onSubmit={e => handleSave(e, false)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel required>{t('supplier')}</FormLabel>
                <select className="input" required value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
                  <option value="">{t('selectSupplier') || 'Select supplier'}</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
                </select>
              </div>
              <div>
                <LocationPicker required label={t('defaultBranch') || 'Default branch'} value={form} onChange={loc => setForm(f => ({ ...f, ...loc }))} />
              </div>
              <div>
                <FormLabel>{t('orderDate') || 'Order date'}</FormLabel>
                <input type="date" className="input" value={form.order_date} onChange={e => setForm(f => ({ ...f, order_date: e.target.value }))} />
              </div>
              <div>
                <FormLabel>{t('expectedDate') || 'Expected date'}</FormLabel>
                <input type="date" className="input" value={form.expected_date} onChange={e => setForm(f => ({ ...f, expected_date: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FormLabel>{t('discount')}</FormLabel>
                  <input type="number" min="0" step="0.01" className="input" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} />
                </div>
                <div>
                  <FormLabel>{t('tax')}</FormLabel>
                  <input type="number" min="0" step="0.01" className="input" value={form.tax} onChange={e => setForm(f => ({ ...f, tax: e.target.value }))} />
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <FormLabel>{t('lineItems') || 'Line items'}</FormLabel>
                <button type="button" className="text-xs text-brand-400" onClick={addLine}>+ {t('addLine') || 'Add line'}</button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {form.items.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end p-2 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                    <div className="col-span-5">
                      <select className="input text-sm" value={line.product_id} onChange={e => updateLine(idx, 'product_id', e.target.value)}>
                        <option value="">{t('product')}</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <input type="number" min="0" step="0.001" className="input text-sm" placeholder={t('qty')} value={line.quantity_ordered} onChange={e => updateLine(idx, 'quantity_ordered', e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <input type="number" min="0" step="0.01" className="input text-sm" placeholder={t('unitCost') || 'Cost'} value={line.unit_cost} onChange={e => updateLine(idx, 'unit_cost', e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <button type="button" className="icon-btn text-red-400 w-full" onClick={() => removeLine(idx)} disabled={form.items.length === 1}><Trash2 className="w-4 h-4 mx-auto" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <FormLabel>{t('notes')}</FormLabel>
              <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            <div className="flex gap-2 flex-wrap">
              <button type="button" className="btn-secondary flex-1" onClick={() => setModal(null)}>{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? '...' : (t('saveDraft') || 'Save draft')}</button>
              {modal === 'create' && (
                <button type="button" disabled={saving} className="btn-primary flex-1" onClick={e => handleSave(e, true)}>
                  {t('saveAndSend') || 'Save & send'}
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}

      {modal === 'detail' && detail && (
        <Modal title={detail.po_number} onClose={() => setModal(null)} wide>
          <div className="space-y-4">
            <div className="flex justify-end">
              <button type="button" className="btn-secondary flex items-center gap-2 text-sm" onClick={() => openPrint(detail.id)}>
                <Printer className="w-4 h-4" />{t('printPO') || 'Print PO'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span style={{ color: 'var(--text-muted)' }}>{t('supplier')}:</span> {detail.Supplier?.company_name}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>{t('status')}:</span> {statusLabel(detail.status)}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>{t('total')}:</span> {formatPKR(detail.total, lang)}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>{t('expectedDate')}:</span> {detail.expected_date || '—'}</div>
            </div>
            <table className="w-full text-sm">
              <thead><tr style={{ color: 'var(--text-muted)' }}><th className="text-start p-2">{t('product')}</th><th className="text-end p-2">{t('ordered') || 'Ordered'}</th><th className="text-end p-2">{t('received') || 'Received'}</th><th className="text-end p-2">{t('unitCost')}</th></tr></thead>
              <tbody>
                {(detail.PurchaseOrderItems || []).map(i => (
                  <tr key={i.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="p-2">{i.Product?.name}</td>
                    <td className="p-2 text-end">{formatQty(i.quantity_ordered)}</td>
                    <td className="p-2 text-end">{formatQty(i.quantity_received)}</td>
                    <td className="p-2 text-end">{formatPKR(i.unit_cost, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}
