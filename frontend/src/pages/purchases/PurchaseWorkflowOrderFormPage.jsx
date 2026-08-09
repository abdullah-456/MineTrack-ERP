import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, ClipboardList, Paperclip, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import FormLabel from '../../components/ui/FormLabel';
import LocationPicker from '../../components/ui/LocationPicker';
import { BankAccountPicker, CashAccountPicker } from '../../components/ui/PaymentAccountSelect';
import { defaultLocation } from '../../utils/locationUtils';
import api from '../../api/axios';

function FormSection({ title, children }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-3.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</span>
      </div>
      <div className="px-5 py-5 space-y-3">{children}</div>
    </div>
  );
}

function FilePicker({ label, file, onChange, hint, inputRef, description, onDescriptionChange, descriptionLabel, descriptionPlaceholder }) {
  return (
    <div className="space-y-2">
      <FormLabel>{label}</FormLabel>
      <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx" onChange={(e) => onChange(e.target.files?.[0] || null)} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => inputRef.current?.click()} className="btn-secondary flex items-center gap-2 text-sm">
          <Paperclip className="w-4 h-4" />{file ? file.name : (hint || 'Choose file')}
        </button>
        {file && (
          <button type="button" onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = ''; }} className="text-red-400">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div>
        <FormLabel>{descriptionLabel || 'Document Description'}</FormLabel>
        <textarea
          className="input min-h-[70px] text-sm"
          value={description || ''}
          onChange={(e) => onDescriptionChange?.(e.target.value)}
          placeholder={descriptionPlaceholder || 'Briefly describe this document…'}
        />
      </div>
    </div>
  );
}

export default function PurchaseWorkflowOrderFormPage() {
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams, shopId, shopReady, branches } = useShopApi();
  const isRTL = lang === 'ur';
  const grnFileRef = useRef(null);
  const invoiceFileRef = useRef(null);

  const [requisitions, setRequisitions] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [grnFile, setGrnFile] = useState(null);
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [grnDocumentDescription, setGrnDocumentDescription] = useState('');
  const [invoiceDocumentDescription, setInvoiceDocumentDescription] = useState('');

  const [form, setForm] = useState({
    purchase_requisition_id: '',
    supplier_id: '',
    ...defaultLocation([]),
    order_date: new Date().toISOString().slice(0, 10),
    expected_date: '',
    discount: '0',
    tax: '0',
    notes: '',
    items: [],
    receipt_date: new Date().toISOString().slice(0, 10),
    supplier_invoice_number: '',
    grn_notes: '',
    payment_status: 'unpaid',
    paid_amount: '',
    payment_method: 'cash',
    bank_account_id: null,
  });

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const load = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const [prRes, supRes] = await Promise.all([
        api.get('/purchase-workflow/eligible-requisitions', { params: shopParams() }),
        api.get('/suppliers', { params: shopParams() }),
      ]);
      setRequisitions(prRes.data.purchase_requisitions || []);
      setSuppliers(supRes.data.suppliers || []);
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, shopReady, error, t]);

  useEffect(() => { load(); }, [load]);

  const prefillFromPR = (prId) => {
    const pr = requisitions.find(r => String(r.id) === String(prId));
    if (!pr) return;
    const itemsWithoutProduct = (pr.PurchaseRequisitionItems || []).filter(i => !i.product_id);
    if (itemsWithoutProduct.length) {
      error(t('prProductsRequired') || 'All requisition lines must have a linked product before creating a PO');
    }
    setForm(f => ({
      ...f,
      purchase_requisition_id: prId,
      branch_id: pr.branch_id ? String(pr.branch_id) : f.branch_id,
      location_type: 'branch',
      godown_id: null,
      expected_date: pr.required_date || '',
      notes: pr.purpose || pr.notes || '',
      items: (pr.PurchaseRequisitionItems || []).filter(i => i.product_id).map(i => ({
        product_id: String(i.product_id),
        product_name: i.description || i.Product?.name || '',
        quantity_ordered: i.quantity,
        unit_cost: String(i.estimated_unit_cost || i.Product?.cost_price || ''),
      })),
    }));
  };

  const selectedPR = requisitions.find(r => String(r.id) === String(form.purchase_requisition_id));
  const lineTotal = form.items.reduce((s, l) => s + (parseFloat(l.quantity_ordered) || 0) * (parseFloat(l.unit_cost) || 0), 0);
  const grandTotal = lineTotal - (parseFloat(form.discount) || 0) + (parseFloat(form.tax) || 0);

  const submit = async (ev) => {
    ev.preventDefault();
    if (!form.purchase_requisition_id || !form.supplier_id || !form.items.length) {
      error(t('fillRequiredFields') || 'Fill all required fields');
      return;
    }
    if (!form.branch_id) {
      error(t('selectBranch') || 'Select mine / branch');
      return;
    }
    setSaving(true);
    try {
      const payload = new FormData();
      const data = {
        ...form,
        ...shopParams(),
        branch_id: form.branch_id,
        items: JSON.stringify(form.items.map(i => ({
          product_id: i.product_id,
          quantity_ordered: parseFloat(i.quantity_ordered) || 0,
          unit_cost: parseFloat(i.unit_cost) || 0,
        }))),
        discount: parseFloat(form.discount) || 0,
        tax: parseFloat(form.tax) || 0,
      };
      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') payload.append(k, v);
      });
      if (grnFile) payload.append('grn_document', grnFile);
      if (invoiceFile) payload.append('invoice_document', invoiceFile);
      if (grnDocumentDescription.trim()) payload.append('grn_document_description', grnDocumentDescription.trim());
      if (invoiceDocumentDescription.trim()) payload.append('invoice_document_description', invoiceDocumentDescription.trim());

      const { data: res } = await api.post('/purchase-workflow/orders', payload);
      success(res.message || t('workflowPOCreated') || 'Purchase order completed');
      const orderId = res.purchase_order?.id;
      if (orderId) {
        navigate(`/purchase-workflow/orders/${orderId}`);
        const qs = new URLSearchParams();
        if (shopId) qs.set('shop_id', shopId);
        qs.set('auto_print', '1');
        window.open(`/purchase-workflow-order/${orderId}?${qs.toString()}`, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={ClipboardList}
        accent="amber"
        title={t('createWorkflowPO') || 'New Purchase Order'}
        subtitle={t('workflowPOFormSub') || 'Select an approved requisition, confirm PO details, receive stock, and record payment'}
        action={
          <button type="button" onClick={() => navigate('/purchase-workflow/orders')} className="btn-secondary flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
          </button>
        }
      />

      {requisitions.length === 0 && (
        <div className="glass-card p-5 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('noApprovedPRs') || 'No approved requisitions awaiting purchase orders.'}
        </div>
      )}

      <form onSubmit={submit} className="space-y-5">
        <FormSection title={t('selectPR') || 'Purchase Requisition'}>
          <div>
            <FormLabel required>{t('selectPR') || 'Purchase Requisition'}</FormLabel>
            <select
              className="input"
              value={form.purchase_requisition_id}
              onChange={(e) => prefillFromPR(e.target.value)}
              required
            >
              <option value="">{t('selectPRPlaceholder') || 'Select approved requisition…'}</option>
              {requisitions.map(r => (
                <option key={r.id} value={r.id}>
                  {r.pr_number} — {r.Branch?.name || ''} — {formatPKR(r.total)}
                </option>
              ))}
            </select>
          </div>
          {selectedPR && (
            <div className="p-3 rounded-lg border text-sm space-y-1" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
              <div>{t('requestedBy') || 'Requested By'}: <strong>{selectedPR.Requester?.name || '—'}</strong></div>
              <div>{t('department') || 'Department'}: {selectedPR.department || '—'}</div>
              {selectedPR.DepartmentalApproval && (
                <div>{t('daNumber') || 'Approval'}: {selectedPR.DepartmentalApproval.da_number} ({selectedPR.DepartmentalApproval.decision})</div>
              )}
            </div>
          )}
        </FormSection>

        <FormSection title={t('purchaseOrderDetails') || 'Purchase Order Details'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FormLabel required>{t('supplier') || 'Supplier'}</FormLabel>
              <select className="input" value={form.supplier_id} onChange={setF('supplier_id')} required>
                <option value="">{t('selectSupplier') || 'Select supplier…'}</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
              </select>
            </div>
            <div>
              <FormLabel required>{t('orderDate') || 'Order Date'}</FormLabel>
              <input type="date" className="input" value={form.order_date} onChange={setF('order_date')} required />
            </div>
            <div>
              <FormLabel>{t('expectedDate') || 'Expected Date'}</FormLabel>
              <input type="date" className="input" value={form.expected_date} onChange={setF('expected_date')} />
            </div>
          </div>
          <div>
            <FormLabel required>{t('mine') || 'Mine / Branch'}</FormLabel>
            <LocationPicker
              value={{ location_type: form.location_type || 'branch', branch_id: form.branch_id, godown_id: form.godown_id }}
              onChange={(loc) => setForm(f => ({ ...f, ...loc }))}
            />
          </div>
          <div className="space-y-2">
            {form.items.map((line, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-4 gap-2 p-2 rounded border" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="sm:col-span-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{line.product_name || `Product #${line.product_id}`}</div>
                <div>
                  <FormLabel>{t('quantity') || 'Qty'}</FormLabel>
                  <input type="number" min="0" step="any" className="input" value={line.quantity_ordered} onChange={(e) => {
                    const items = [...form.items];
                    items[idx] = { ...items[idx], quantity_ordered: e.target.value };
                    setForm(f => ({ ...f, items }));
                  }} />
                </div>
                <div>
                  <FormLabel>{t('unitCost') || 'Unit Cost'}</FormLabel>
                  <input type="number" min="0" step="any" className="input" value={line.unit_cost} onChange={(e) => {
                    const items = [...form.items];
                    items[idx] = { ...items[idx], unit_cost: e.target.value };
                    setForm(f => ({ ...f, items }));
                  }} />
                </div>
              </div>
            ))}
          </div>
          <div className="text-end font-semibold">{t('total') || 'Total'}: {formatPKR(grandTotal)}</div>
          <textarea className="input min-h-[60px]" value={form.notes} onChange={setF('notes')} placeholder={t('notes') || 'Notes'} />
        </FormSection>

        <FormSection title={t('goodsReceiptAndPayment') || 'Goods Receipt & Payment'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FormLabel>{t('receiptDate') || 'Receipt Date'}</FormLabel>
              <input type="date" className="input" value={form.receipt_date} onChange={setF('receipt_date')} />
            </div>
            <div>
              <FormLabel>{t('supplierInvoiceNo') || 'Supplier Invoice #'}</FormLabel>
              <input className="input" value={form.supplier_invoice_number} onChange={setF('supplier_invoice_number')} />
            </div>
          </div>
          <div>
            <FormLabel required>{t('paymentStatus') || 'Payment Status'}</FormLabel>
            <div className="flex flex-wrap gap-2">
              {['unpaid', 'paid', 'partial'].map(opt => (
                <button key={opt} type="button" onClick={() => setForm(f => ({ ...f, payment_status: opt }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${form.payment_status === opt ? 'bg-emerald-500 text-white' : 'btn-secondary'}`}>
                  {opt === 'unpaid' ? (t('unpaid') || 'Unpaid') : opt === 'paid' ? (t('paid') || 'Paid') : (t('partial') || 'Partial')}
                </button>
              ))}
            </div>
          </div>
          {form.payment_status !== 'unpaid' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {form.payment_status === 'partial' && (
                <div>
                  <FormLabel>{t('paidAmount') || 'Paid Amount'}</FormLabel>
                  <input type="number" min="0" className="input" value={form.paid_amount} onChange={setF('paid_amount')} />
                </div>
              )}
              <div>
                <FormLabel>{t('paymentMethod') || 'Payment Method'}</FormLabel>
                <select className="input" value={form.payment_method} onChange={setF('payment_method')}>
                  <option value="cash">{t('cash') || 'Cash'}</option>
                  <option value="bank">{t('bank') || 'Bank'}</option>
                  <option value="supplier_credit">{t('supplierCredit') || 'Supplier Credit'}</option>
                </select>
              </div>
              {['cash', 'bank'].includes(form.payment_method) && (
                <div className="sm:col-span-2">
                  {form.payment_method === 'cash' ? (
                    <CashAccountPicker value={form.bank_account_id} onChange={(id) => setForm(f => ({ ...f, bank_account_id: id }))} />
                  ) : (
                    <BankAccountPicker value={form.bank_account_id} onChange={(id) => setForm(f => ({ ...f, bank_account_id: id }))} />
                  )}
                </div>
              )}
            </div>
          )}
        </FormSection>

        <FormSection title={t('supportingDocuments') || 'Supporting Documents'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FilePicker
              label={`${t('grnDocument') || 'GRN Document'} (${t('optional') || 'optional'})`}
              file={grnFile}
              onChange={setGrnFile}
              inputRef={grnFileRef}
              hint={t('chooseFile') || 'Choose file'}
              description={grnDocumentDescription}
              onDescriptionChange={setGrnDocumentDescription}
              descriptionLabel={t('documentDescription') || 'Document Description'}
              descriptionPlaceholder={t('grnDocumentDescriptionPlaceholder') || 'Describe the GRN document (e.g. signed receipt copy)…'}
            />
            <FilePicker
              label={`${t('invoiceDocument') || 'Invoice Document'} (${t('optional') || 'optional'})`}
              file={invoiceFile}
              onChange={setInvoiceFile}
              inputRef={invoiceFileRef}
              hint={t('chooseFile') || 'Choose file'}
              description={invoiceDocumentDescription}
              onDescriptionChange={setInvoiceDocumentDescription}
              descriptionLabel={t('documentDescription') || 'Document Description'}
              descriptionPlaceholder={t('invoiceDocumentDescriptionPlaceholder') || 'Describe the supplier invoice (e.g. invoice #, date)…'}
            />
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('daAttachmentHint') || 'PDF, images, or Word documents up to 10 MB'}</p>
        </FormSection>

        <div className="flex flex-wrap gap-3 justify-end">
          <button type="button" onClick={() => navigate('/purchase-workflow/orders')} className="btn-secondary">{t('cancel') || 'Cancel'}</button>
          <button type="submit" disabled={saving || requisitions.length === 0} className="btn-primary">
            {saving ? (t('saving') || 'Saving…') : (t('saveAndProceedPayment') || 'Save & Proceed to Payment')}
          </button>
        </div>
      </form>
    </div>
  );
}
