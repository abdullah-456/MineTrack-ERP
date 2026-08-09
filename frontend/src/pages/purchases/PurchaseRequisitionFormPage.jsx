import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, FileText, Plus, Trash2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import FormLabel from '../../components/ui/FormLabel';
import LocationPicker from '../../components/ui/LocationPicker';
import { defaultLocation } from '../../utils/locationUtils';
import api from '../../api/axios';

const EMPTY_LINE = { product_id: '', description: '', quantity: 1, unit: '', estimated_unit_cost: '', notes: '' };

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

export default function PurchaseRequisitionFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams, shopReady, branches, shopId } = useShopApi();
  const isRTL = lang === 'ur';

  const [form, setForm] = useState({
    ...defaultLocation([]),
    requested_by: '',
    requisition_date: new Date().toISOString().slice(0, 10),
    required_date: '',
    department: '',
    priority: 'normal',
    purpose: '',
    notes: '',
    items: [{ ...EMPTY_LINE }],
  });
  const [employees, setEmployees] = useState([]);
  const [products, setProducts] = useState([]);
  const [previewNumber, setPreviewNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const load = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const [eRes, pRes] = await Promise.all([
        api.get('/employees', { params: shopParams() }),
        api.get('/products', { params: shopParams() }),
      ]);
      setEmployees((eRes.data.employees || []).filter(e => e.status === 'active'));
      setProducts(pRes.data.products || []);

      if (isEdit) {
        const { data } = await api.get(`/purchase-requisitions/${id}`, { params: shopParams() });
        const pr = data.purchase_requisition;
        if (pr.status !== 'draft') {
          error(t('prNotEditable') || 'Only draft requisitions can be edited');
          navigate(`/purchase-workflow/requisitions/${id}`);
          return;
        }
        setForm({
          branch_id: pr.branch_id ? String(pr.branch_id) : '',
          location_type: 'branch',
          godown_id: null,
          requested_by: pr.requested_by ? String(pr.requested_by) : '',
          requisition_date: pr.requisition_date || '',
          required_date: pr.required_date || '',
          department: pr.department || '',
          priority: pr.priority || 'normal',
          purpose: pr.purpose || '',
          notes: pr.notes || '',
          items: (pr.PurchaseRequisitionItems || []).length
            ? pr.PurchaseRequisitionItems.map(i => ({
              product_id: i.product_id ? String(i.product_id) : '',
              description: i.description || '',
              quantity: i.quantity,
              unit: i.unit || i.Product?.unit || '',
              estimated_unit_cost: String(i.estimated_unit_cost || ''),
              notes: i.notes || '',
            }))
            : [{ ...EMPTY_LINE }],
        });
        setPreviewNumber(pr.pr_number || '');
      } else {
        setForm(f => ({ ...f, ...defaultLocation(branches) }));
        setPreviewNumber('');
      }
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
      if (isEdit) navigate('/purchase-workflow/requisitions');
    } finally {
      setLoading(false);
    }
  }, [isEdit, id, shopParams, shopReady, branches, error, t, navigate]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isEdit && branches.length && !form.branch_id) {
      setForm(f => ({ ...f, ...defaultLocation(branches) }));
    }
  }, [branches, form.branch_id, isEdit]);

  const addLine = () => setForm(f => ({ ...f, items: [...f.items, { ...EMPTY_LINE }] }));
  const updateLine = (idx, key, val) => setForm(f => {
    const items = [...f.items];
    items[idx] = { ...items[idx], [key]: val };
    if (key === 'product_id') {
      const prod = products.find(p => String(p.id) === String(val));
      if (prod) {
        items[idx].description = prod.name || '';
        items[idx].unit = prod.unit || '';
        if (!items[idx].estimated_unit_cost) items[idx].estimated_unit_cost = prod.cost_price || '';
      }
    }
    return { ...f, items };
  });
  const removeLine = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const lineTotal = (line) => {
    const qty = parseFloat(line.quantity) || 0;
    const cost = parseFloat(line.estimated_unit_cost) || 0;
    return qty * cost;
  };

  const grandTotal = form.items.reduce((s, l) => s + lineTotal(l), 0);

  const buildPayload = (submitAfter = false) => ({
    branch_id: form.branch_id ? parseInt(form.branch_id, 10) : null,
    requested_by: form.requested_by ? parseInt(form.requested_by, 10) : null,
    requisition_date: form.requisition_date,
    required_date: form.required_date || null,
    department: form.department,
    priority: form.priority,
    purpose: form.purpose,
    notes: form.notes,
    status: submitAfter ? 'submitted' : 'draft',
    items: form.items.filter(i => i.description?.trim() || i.product_id).map(i => ({
      product_id: i.product_id || null,
      description: i.description?.trim() || products.find(p => String(p.id) === String(i.product_id))?.name || '',
      quantity: parseFloat(i.quantity) || 0,
      unit: i.unit || null,
      estimated_unit_cost: parseFloat(i.estimated_unit_cost) || 0,
      notes: i.notes || null,
    })),
  });

  const openPrint = (prId, autoPrint = false) => {
    const qs = new URLSearchParams();
    if (shopId) qs.set('shop_id', shopId);
    if (autoPrint) qs.set('auto_print', '1');
    const q = qs.toString();
    window.open(`/purchase-requisition/${prId}${q ? `?${q}` : ''}`, '_blank', 'noopener,noreferrer');
  };

  const submit = async (ev, submitAfter = false) => {
    ev.preventDefault();
    const payload = buildPayload(submitAfter);
    if (!payload.items.length) {
      error(t('prItemsRequired') || 'Add at least one line item');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/purchase-requisitions/${id}`, payload);
        if (submitAfter) await api.post(`/purchase-requisitions/${id}/submit`);
        success(t('prUpdated') || 'Purchase requisition updated');
        navigate(`/purchase-workflow/requisitions/${id}`);
        openPrint(id, true);
      } else {
        const { data } = await api.post('/purchase-requisitions', payload);
        const pr = data.purchase_requisition;
        success(submitAfter ? (t('prSubmitted') || 'Purchase requisition submitted') : (t('prCreated') || 'Purchase requisition created'));
        navigate(`/purchase-workflow/requisitions/${pr.id}`);
        openPrint(pr.id, true);
      }
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={FileText}
        accent="indigo"
        title={isEdit ? (t('editPR') || 'Edit Purchase Requisition') : (t('createPR') || 'New Purchase Requisition')}
        subtitle={t('purchaseRequisitionFormSub') || 'Fill in the requisition details and line items'}
        action={
          <button type="button" onClick={() => navigate('/purchase-workflow/requisitions')} className="btn-secondary flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
          </button>
        }
      />

      <form onSubmit={(e) => submit(e, false)} className="space-y-5">
        <FormSection title={t('prBasicInfo') || 'Requisition Details'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {previewNumber && (
              <div>
                <FormLabel>{t('prNumber') || 'PR Number'}</FormLabel>
                <input className="input font-mono" value={previewNumber} readOnly disabled />
              </div>
            )}
            <div>
              <FormLabel required>{t('requisitionDate') || 'Requisition Date'}</FormLabel>
              <input type="date" className="input" value={form.requisition_date} onChange={setF('requisition_date')} required />
            </div>
            <div>
              <FormLabel>{t('requiredDate') || 'Required By'}</FormLabel>
              <input type="date" className="input" value={form.required_date} onChange={setF('required_date')} />
            </div>
            <div>
              <FormLabel>{t('priority') || 'Priority'}</FormLabel>
              <select className="input" value={form.priority} onChange={setF('priority')}>
                <option value="normal">{t('priorityNormal') || 'Normal'}</option>
                <option value="urgent">{t('priorityUrgent') || 'Urgent'}</option>
              </select>
            </div>
            <div>
              <FormLabel>{t('requestedBy') || 'Requested By'}</FormLabel>
              <select className="input" value={form.requested_by} onChange={setF('requested_by')}>
                <option value="">{t('selectEmployee') || 'Select employee…'}</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.name}{e.employment_id ? ` (${e.employment_id})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <FormLabel>{t('department') || 'Department'}</FormLabel>
              <input className="input" value={form.department} onChange={setF('department')} placeholder={t('departmentPlaceholder') || 'e.g. Operations, Maintenance'} />
            </div>
          </div>
          <div>
            <FormLabel>{t('mine') || 'Mine / Branch'}</FormLabel>
            <LocationPicker
              value={{
                location_type: form.location_type || 'branch',
                branch_id: form.branch_id,
                godown_id: form.godown_id,
              }}
              onChange={(loc) => setForm(f => ({ ...f, ...loc }))}
            />
          </div>
          <div>
            <FormLabel>{t('purpose') || 'Purpose / Justification'}</FormLabel>
            <textarea className="input min-h-[80px]" value={form.purpose} onChange={setF('purpose')} placeholder={t('purposePlaceholder') || 'Describe why these items are needed…'} />
          </div>
        </FormSection>

        <FormSection title={t('requestedItems') || 'Requested Items'}>
          <div className="space-y-3">
            {form.items.map((line, idx) => (
              <div key={idx} className="p-3 rounded-lg border space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  <div>
                    <FormLabel>{t('product') || 'Product'}</FormLabel>
                    <select className="input" value={line.product_id} onChange={e => updateLine(idx, 'product_id', e.target.value)}>
                      <option value="">{t('selectProduct') || 'Select product (optional)…'}</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <FormLabel required>{t('description') || 'Description'}</FormLabel>
                    <input className="input" value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} required />
                  </div>
                  <div>
                    <FormLabel required>{t('quantity') || 'Quantity'}</FormLabel>
                    <input type="number" min="0" step="any" className="input" value={line.quantity} onChange={e => updateLine(idx, 'quantity', e.target.value)} required />
                  </div>
                  <div>
                    <FormLabel>{t('unit') || 'Unit'}</FormLabel>
                    <input className="input" value={line.unit} onChange={e => updateLine(idx, 'unit', e.target.value)} placeholder="kg, pcs, etc." />
                  </div>
                  <div>
                    <FormLabel>{t('estimatedUnitCost') || 'Est. Unit Cost'}</FormLabel>
                    <input type="number" min="0" step="any" className="input" value={line.estimated_unit_cost} onChange={e => updateLine(idx, 'estimated_unit_cost', e.target.value)} />
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>{t('lineTotal') || 'Line total'}: <strong>{formatPKR(lineTotal(line))}</strong></span>
                  {form.items.length > 1 && (
                    <button type="button" onClick={() => removeLine(idx)} className="text-red-400 flex items-center gap-1 text-xs">
                      <Trash2 className="w-3.5 h-3.5" />{t('remove') || 'Remove'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addLine} className="btn-secondary flex items-center gap-2 mt-3">
            <Plus className="w-4 h-4" />{t('addLine') || 'Add line'}
          </button>
          <div className="text-end pt-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('estimatedTotal') || 'Estimated Total'}: {formatPKR(grandTotal)}
          </div>
        </FormSection>

        <FormSection title={t('notes') || 'Notes'}>
          <textarea className="input min-h-[60px]" value={form.notes} onChange={setF('notes')} placeholder={t('optionalNotes') || 'Additional notes (optional)…'} />
        </FormSection>

        <div className="flex flex-wrap gap-3 justify-end">
          <button type="button" onClick={() => navigate('/purchase-workflow/requisitions')} className="btn-secondary">{t('cancel') || 'Cancel'}</button>
          <button type="submit" disabled={saving} className="btn-secondary">
            {saving ? (t('saving') || 'Saving…') : (t('saveDraft') || 'Save as Draft')}
          </button>
          <button type="button" disabled={saving} onClick={(e) => submit(e, true)} className="btn-primary">
            {saving ? (t('saving') || 'Saving…') : (t('saveAndSubmit') || 'Save & Submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
