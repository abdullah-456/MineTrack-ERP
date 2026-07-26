import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  PackageCheck, Plus, Search, Loader2, Eye, Trash2, CheckCircle2, RefreshCw, Printer,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR, formatQty } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import LocationPicker from '../../components/ui/LocationPicker';
import { BankAccountPicker, CashAccountPicker } from '../../components/ui/PaymentAccountSelect';
import { defaultLocation } from '../../utils/locationUtils';
import api from '../../api/axios';

const EMPTY_LINE = { product_id: '', quantity_received: 1, unit_cost: '' };

export default function GoodsReceipts() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams, branches } = useShopApi();
  const location = useLocation();
  const isRTL = lang === 'ur';

  const [receipts, setReceipts] = useState([]);
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
    receipt_date: new Date().toISOString().slice(0, 16),
    supplier_invoice_number: '',
    notes: '',
    items: [{ ...EMPTY_LINE }],
  });

  const [postForm, setPostForm] = useState({
    payment_status: 'unpaid',
    paid_amount: '',
    payment_method: 'cash',
    bank_account_id: null,
    notes: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams(), search, status: statusFilter !== 'all' ? statusFilter : undefined };
      const [grnRes, supRes, prodRes] = await Promise.all([
        api.get('/goods-receipts', { params }),
        api.get('/suppliers', { params: shopParams() }),
        api.get('/products', { params: shopParams() }),
      ]);
      setReceipts(grnRes.data.goods_receipts || []);
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
    const openId = location.state?.openPostId;
    if (openId) {
      openPost(openId);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const openPost = async (id) => {
    try {
      const { data } = await api.get(`/goods-receipts/${id}`);
      setDetail(data.goods_receipt);
      setPostForm({ payment_status: 'unpaid', paid_amount: '', payment_method: 'cash', bank_account_id: null, notes: '' });
      setModal('post');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
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

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/goods-receipts', {
        supplier_id: form.supplier_id,
        branch_id: form.branch_id,
        receipt_date: form.receipt_date,
        supplier_invoice_number: form.supplier_invoice_number,
        notes: form.notes,
        items: form.items.filter(i => i.product_id).map(i => ({
          product_id: i.product_id,
          branch_id: form.branch_id,
          quantity_received: parseFloat(i.quantity_received) || 0,
          unit_cost: parseFloat(i.unit_cost) || 0,
        })),
      });
      success(t('grnDraftCreated') || 'Goods receipt draft created');
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handlePost = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        payment_status: postForm.payment_status,
        paid_amount: postForm.paid_amount,
        payment_method: postForm.payment_method,
        bank_account_id: postForm.bank_account_id,
        notes: postForm.notes,
      };
      await api.post(`/goods-receipts/${detail.id}/post`, payload);
      success(t('grnPosted') || 'Goods receipt posted — stock updated');
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (grn) => {
    const ok = await confirm({ title: t('deleteGRN') || 'Delete GRN', message: t('confirmDeleteGRN') || 'Delete this draft receipt?' });
    if (!ok) return;
    try {
      await api.delete(`/goods-receipts/${grn.id}`);
      success(t('grnDeleted') || 'Draft deleted');
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const viewDetail = async (grn) => {
    try {
      const { data } = await api.get(`/goods-receipts/${grn.id}`);
      setDetail(data.goods_receipt);
      setModal('detail');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={PackageCheck}
        accent="emerald"
        title={t('goodsReceipts') || 'Goods Receipts'}
        subtitle={t('goodsReceiptsSub') || 'Receive stock from suppliers with full payment & ledger posting'}
        action={
          <div className="flex gap-2">
            <button type="button" onClick={fetchData} className="icon-btn"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
            <button type="button" onClick={() => { setForm({ supplier_id: '', ...defaultLocation(branches), receipt_date: new Date().toISOString().slice(0, 16), supplier_invoice_number: '', notes: '', items: [{ ...EMPTY_LINE }] }); setModal('create'); }} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('newGRN') || 'New receipt'}
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
          <option value="draft">{t('draft') || 'Draft'}</option>
          <option value="posted">{t('posted') || 'Posted'}</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-emerald-400" /></div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('grnNumber') || 'GRN #'}</th>
                <th className="text-start p-4">{t('date')}</th>
                <th className="text-start p-4">{t('supplier')}</th>
                <th className="text-start p-4">{t('poNumber') || 'PO #'}</th>
                <th className="text-start p-4">{t('total')}</th>
                <th className="text-start p-4">{t('status')}</th>
                <th className="text-end p-4">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map(g => (
                <tr key={g.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-mono text-emerald-400 text-xs">{g.grn_number}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{new Date(g.receipt_date).toLocaleDateString()}</td>
                  <td className="p-4">{g.Supplier?.company_name}</td>
                  <td className="p-4 font-mono text-xs">{g.PurchaseOrder?.po_number || '—'}</td>
                  <td className="p-4 font-semibold">{formatPKR(g.total, lang)}</td>
                  <td className="p-4"><span className={`badge ${g.status === 'posted' ? 'badge-green' : 'badge-yellow'}`}>{g.status === 'posted' ? (t('posted') || 'Posted') : (t('draft') || 'Draft')}</span></td>
                  <td className="p-4 text-end space-x-1 whitespace-nowrap">
                    <button type="button" className="icon-btn" onClick={() => viewDetail(g)}><Eye className="w-4 h-4" /></button>
                    {g.status === 'draft' && (
                      <>
                        <button type="button" className="icon-btn text-emerald-400" title={t('postGRN') || 'Post'} onClick={() => openPost(g.id)}><CheckCircle2 className="w-4 h-4" /></button>
                        <button type="button" className="icon-btn text-red-400" onClick={() => handleDelete(g)}><Trash2 className="w-4 h-4" /></button>
                      </>
                    )}
                    {g.status === 'posted' && g.PurchaseInvoice && (
                      <button type="button" className="icon-btn" title={t('printInvoice')} onClick={() => window.open(`/invoice/purchase-${g.PurchaseInvoice.id}?auto_print=1`, '_blank')}><Printer className="w-4 h-4" /></button>
                    )}
                  </td>
                </tr>
              ))}
              {!receipts.length && (
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noGRNs') || 'No goods receipts yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal === 'create' && (
        <Modal title={t('newGRN') || 'New goods receipt'} onClose={() => setModal(null)} wide>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel required>{t('supplier')}</FormLabel>
                <select className="input" required value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
                  <option value="">{t('selectSupplier') || 'Select supplier'}</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
                </select>
              </div>
              <LocationPicker required value={form} onChange={loc => setForm(f => ({ ...f, ...loc }))} />
              <div>
                <FormLabel>{t('supplierInvoiceNo') || 'Supplier invoice #'}</FormLabel>
                <input className="input" value={form.supplier_invoice_number} onChange={e => setForm(f => ({ ...f, supplier_invoice_number: e.target.value }))} />
              </div>
              <div>
                <FormLabel>{t('receiptDate') || 'Receipt date'}</FormLabel>
                <input type="datetime-local" className="input" value={form.receipt_date} onChange={e => setForm(f => ({ ...f, receipt_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              {form.items.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 p-2 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="col-span-5">
                    <select className="input text-sm" value={line.product_id} onChange={e => updateLine(idx, 'product_id', e.target.value)}>
                      <option value="">{t('product')}</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3"><input type="number" min="0" step="0.001" className="input text-sm" placeholder={t('qty')} value={line.quantity_received} onChange={e => updateLine(idx, 'quantity_received', e.target.value)} /></div>
                  <div className="col-span-3"><input type="number" min="0" step="0.01" className="input text-sm" placeholder={t('unitCost')} value={line.unit_cost} onChange={e => updateLine(idx, 'unit_cost', e.target.value)} /></div>
                  <div className="col-span-1"><button type="button" className="icon-btn text-red-400" onClick={() => removeLine(idx)} disabled={form.items.length === 1}><Trash2 className="w-4 h-4" /></button></div>
                </div>
              ))}
              <button type="button" className="text-xs text-brand-400" onClick={addLine}>+ {t('addLine')}</button>
            </div>
            <textarea className="input resize-none" rows={2} placeholder={t('notes')} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            <div className="flex gap-2">
              <button type="button" className="btn-secondary flex-1" onClick={() => setModal(null)}>{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">{t('saveDraft') || 'Save draft'}</button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'post' && detail && (
        <Modal title={`${t('postGRN') || 'Post receipt'} — ${detail.grn_number}`} onClose={() => setModal(null)} wide>
          <form onSubmit={handlePost} className="space-y-4">
            <div className="rounded-lg p-3 text-sm space-y-1" style={{ background: 'var(--bg-elevated)' }}>
              <p><strong>{t('supplier')}:</strong> {detail.Supplier?.company_name}</p>
              <p><strong>{t('total')}:</strong> {formatPKR(detail.total, lang)}</p>
              {(detail.GoodsReceiptNoteItems || []).map(i => (
                <p key={i.id} style={{ color: 'var(--text-secondary)' }}>{i.Product?.name}: {formatQty(i.quantity_received)} × {formatPKR(i.unit_cost, lang)}</p>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <FormLabel>{t('paymentStatus') || 'Payment status'}</FormLabel>
                <select className="input" value={postForm.payment_status} onChange={e => setPostForm(f => ({ ...f, payment_status: e.target.value }))}>
                  <option value="unpaid">{t('unpaid') || 'Unpaid'}</option>
                  <option value="paid">{t('paid') || 'Paid'}</option>
                  <option value="partial">{t('partial') || 'Partial'}</option>
                </select>
              </div>
              {postForm.payment_status === 'partial' && (
                <div>
                  <FormLabel>{t('paidAmount') || 'Paid amount'}</FormLabel>
                  <input type="number" min="0" step="0.01" className="input" value={postForm.paid_amount} onChange={e => setPostForm(f => ({ ...f, paid_amount: e.target.value }))} />
                </div>
              )}
              {postForm.payment_status !== 'unpaid' && (
                <>
                  <div>
                    <FormLabel>{t('method')}</FormLabel>
                    <select className="input" value={postForm.payment_method} onChange={e => setPostForm(f => ({ ...f, payment_method: e.target.value, bank_account_id: null }))}>
                      <option value="cash">{t('cash')}</option>
                      <option value="bank">{t('bank')}</option>
                      <option value="supplier_credit">{t('supplierCredit') || 'Supplier credit'}</option>
                    </select>
                  </div>
                  {postForm.payment_method === 'cash' && (
                    <div><FormLabel>{t('cashAccount')}</FormLabel><CashAccountPicker value={postForm.bank_account_id} onChange={id => setPostForm(f => ({ ...f, bank_account_id: id }))} /></div>
                  )}
                  {postForm.payment_method === 'bank' && (
                    <div><FormLabel>{t('bankAccount')}</FormLabel><BankAccountPicker value={postForm.bank_account_id} onChange={id => setPostForm(f => ({ ...f, bank_account_id: id }))} /></div>
                  )}
                </>
              )}
            </div>
            <textarea className="input resize-none" rows={2} placeholder={t('notes')} value={postForm.notes} onChange={e => setPostForm(f => ({ ...f, notes: e.target.value }))} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('grnPostHint') || 'Posting updates inventory, supplier payable, purchase invoice, and general ledger.'}</p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary flex-1" onClick={() => setModal(null)}>{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" />{t('postGRN') || 'Post receipt'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'detail' && detail && (
        <Modal title={detail.grn_number} onClose={() => setModal(null)} wide>
          <div className="space-y-3 text-sm">
            <p>{t('supplier')}: {detail.Supplier?.company_name}</p>
            <p>{t('status')}: {detail.status}</p>
            <p>{t('total')}: {formatPKR(detail.total, lang)}</p>
            <table className="w-full">
              <thead><tr style={{ color: 'var(--text-muted)' }}><th className="text-start p-2">{t('product')}</th><th className="text-end p-2">{t('qty')}</th><th className="text-end p-2">{t('unitCost')}</th></tr></thead>
              <tbody>
                {(detail.GoodsReceiptNoteItems || []).map(i => (
                  <tr key={i.id}><td className="p-2">{i.Product?.name}</td><td className="p-2 text-end">{formatQty(i.quantity_received)}</td><td className="p-2 text-end">{formatPKR(i.unit_cost, lang)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}
