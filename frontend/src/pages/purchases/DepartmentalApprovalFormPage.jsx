import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, ShieldCheck, Paperclip, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import FormLabel from '../../components/ui/FormLabel';
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

export default function DepartmentalApprovalFormPage() {
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams, shopId, shopReady } = useShopApi();
  const isRTL = lang === 'ur';
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    purchase_requisition_id: '',
    approval_date: new Date().toISOString().slice(0, 10),
    decision: 'approved',
    remarks: '',
  });
  const [attachment, setAttachment] = useState(null);
  const [attachmentDescription, setAttachmentDescription] = useState('');
  const [requisitions, setRequisitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const load = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const { data } = await api.get('/departmental-approvals/eligible-requisitions', { params: shopParams() });
      setRequisitions(data.purchase_requisitions || []);
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, shopReady, error, t]);

  useEffect(() => { load(); }, [load]);

  const selectedPR = requisitions.find(r => String(r.id) === String(form.purchase_requisition_id));

  const openPrint = (id, autoPrint = false) => {
    const qs = new URLSearchParams();
    if (shopId) qs.set('shop_id', shopId);
    if (autoPrint) qs.set('auto_print', '1');
    const q = qs.toString();
    window.open(`/departmental-approval/${id}${q ? `?${q}` : ''}`, '_blank', 'noopener,noreferrer');
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!form.purchase_requisition_id) {
      error(t('selectPRRequired') || 'Select a purchase requisition');
      return;
    }
    if (!form.decision) {
      error(t('decisionRequired') || 'Select approved or rejected');
      return;
    }

    setSaving(true);
    try {
      const payload = new FormData();
      Object.entries({ ...form, ...shopParams() }).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') payload.append(k, v);
      });
      if (attachment) payload.append('attachment', attachment);
      if (attachmentDescription.trim()) payload.append('attachment_description', attachmentDescription.trim());

      const { data } = await api.post('/departmental-approvals', payload);
      const da = data.departmental_approval;
      success(t('daCreated') || 'Departmental approval saved');
      navigate(`/purchase-workflow/approvals/${da.id}`);
      openPrint(da.id, true);
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
    <div className="space-y-6 max-w-3xl mx-auto" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={ShieldCheck}
        accent="violet"
        title={t('createDA') || 'New Departmental Approval'}
        subtitle={t('departmentalApprovalFormSub') || 'Select a submitted requisition and record the approval decision'}
        action={
          <button type="button" onClick={() => navigate('/purchase-workflow/approvals')} className="btn-secondary flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
          </button>
        }
      />

      {requisitions.length === 0 && (
        <div className="glass-card p-5 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('noEligiblePRs') || 'No submitted purchase requisitions are pending approval. Submit a requisition first.'}
        </div>
      )}

      <form onSubmit={submit} className="space-y-5">
        <FormSection title={t('daBasicInfo') || 'Approval Details'}>
          <div>
            <FormLabel required>{t('selectPR') || 'Purchase Requisition'}</FormLabel>
            <select className="input" value={form.purchase_requisition_id} onChange={setF('purchase_requisition_id')} required>
              <option value="">{t('selectPRPlaceholder') || 'Select a submitted requisition…'}</option>
              {requisitions.map(r => (
                <option key={r.id} value={r.id}>
                  {r.pr_number} — {r.Branch?.name || t('mine') || 'Mine'} — {formatPKR(r.total)} — {r.Requester?.name || ''}
                </option>
              ))}
            </select>
          </div>

          {selectedPR && (
            <div className="p-3 rounded-lg border text-sm space-y-1" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
              <div><strong style={{ color: 'var(--text-primary)' }}>{selectedPR.pr_number}</strong></div>
              <div>{t('requisitionDate') || 'Date'}: {selectedPR.requisition_date || '—'}</div>
              <div>{t('requiredDate') || 'Required By'}: {selectedPR.required_date || '—'}</div>
              <div>{t('department') || 'Department'}: {selectedPR.department || '—'}</div>
              <div>{t('total') || 'Total'}: {formatPKR(selectedPR.total)}</div>
            </div>
          )}

          <div>
            <FormLabel required>{t('approvalDate') || 'Approval Date'}</FormLabel>
            <input type="date" className="input" value={form.approval_date} onChange={setF('approval_date')} required />
          </div>

          <div>
            <FormLabel required>{t('decision') || 'Decision'}</FormLabel>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="decision" value="approved" checked={form.decision === 'approved'} onChange={setF('decision')} />
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{t('daApproved') || 'Approved'}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="decision" value="rejected" checked={form.decision === 'rejected'} onChange={setF('decision')} />
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{t('daRejected') || 'Rejected'}</span>
              </label>
            </div>
          </div>

          <div>
            <FormLabel>{t('remarks') || 'Remarks'}</FormLabel>
            <textarea
              className="input min-h-[100px]"
              value={form.remarks}
              onChange={setF('remarks')}
              placeholder={t('daRemarksPlaceholder') || 'Enter approval remarks or comments…'}
            />
          </div>

          <div>
            <FormLabel>{t('supportingDocument') || 'Supporting Document'} ({t('optional') || 'optional'})</FormLabel>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx"
              onChange={(e) => setAttachment(e.target.files?.[0] || null)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary flex items-center gap-2">
                <Paperclip className="w-4 h-4" />{t('chooseFile') || 'Choose file'}
              </button>
              {attachment && (
                <span className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  {attachment.name}
                  <button type="button" onClick={() => { setAttachment(null); if (fileRef.current) fileRef.current.value = ''; }} className="text-red-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {t('daAttachmentHint') || 'PDF, images, or Word documents up to 10 MB'}
            </p>
            <div className="mt-2">
              <FormLabel>{t('documentDescription') || 'Document Description'}</FormLabel>
              <textarea
                className="input min-h-[70px]"
                value={attachmentDescription}
                onChange={(e) => setAttachmentDescription(e.target.value)}
                placeholder={t('documentDescriptionPlaceholder') || 'Briefly describe this document for future reference…'}
              />
            </div>
          </div>
        </FormSection>

        <div className="flex flex-wrap gap-3 justify-end">
          <button type="button" onClick={() => navigate('/purchase-workflow/approvals')} className="btn-secondary">{t('cancel') || 'Cancel'}</button>
          <button type="submit" disabled={saving || requisitions.length === 0} className="btn-primary">
            {saving ? (t('saving') || 'Saving…') : (t('saveApproval') || 'Save Approval')}
          </button>
        </div>
      </form>
    </div>
  );
}
