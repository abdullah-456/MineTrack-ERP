import { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, Search, Edit, Loader2, Link2, Phone, Mail } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import api from '../../api/axios';

const EMPTY = {
  company_name: '', contact_person: '', phone: '', email: '', address: '',
  tax_number: '', payment_terms: '', credit_limit: '', status: 'active', cnic: '',
};

export default function Suppliers() {
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams } = useShopApi();
  const isRTL = lang === 'ur';

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/suppliers', { params: { ...shopParams(), search } });
      setSuppliers(data.suppliers || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, search, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => { setForm(EMPTY); setSelected(null); setModal('create'); };
  const openEdit = (s) => {
    setSelected(s);
    setForm({
      company_name: s.company_name || '', contact_person: s.contact_person || '',
      phone: s.phone || '', email: s.email || '', address: s.address || '',
      tax_number: s.tax_number || '', payment_terms: s.payment_terms || '',
      credit_limit: s.credit_limit || '', status: s.status || 'active',
      cnic: s.cnic || '',
    });
    setModal('edit');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, credit_limit: parseFloat(form.credit_limit) || 0, ...shopParams() };
      if (modal === 'create') {
        await api.post('/suppliers', payload);
        success(t('supplierCreated'));
      } else {
        await api.put(`/suppliers/${selected.id}`, payload);
        success(t('supplierUpdated'));
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

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Building2}
        accent="amber"
        title={t('suppliers')}
        subtitle={t('suppliersSub')}
        action={
          <button type="button" onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />{t('addSupplier')}
          </button>
        }
      />

      <div className="glass-card p-4">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" style={{ [isRTL ? 'right' : 'left']: '12px' }} />
          <input
            className="input"
            style={{ paddingInlineStart: '2.5rem' }}
            placeholder={t('searchSuppliers')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-amber-400" /></div>
      ) : suppliers.length === 0 ? (
        <div className="glass-card p-12 text-center" style={{ color: 'var(--text-muted)' }}>{t('noSuppliers')}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {suppliers.map(s => (
            <div key={s.id} className="glass-card p-5 hover:border-amber-500/30 transition-colors border border-transparent">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <span className="text-xs font-mono text-amber-400">{s.supplier_code}</span>
                  <h3 className="font-bold text-lg mt-0.5" style={{ color: 'var(--text-primary)' }}>{s.company_name}</h3>
                  {s.contact_person && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{s.contact_person}</p>}
                </div>
                <StatusBadge status={s.status} />
              </div>
              <div className="space-y-1.5 text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                {s.phone && <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" />{s.phone}</p>}
                {s.email && <p className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" />{s.email}</p>}
                {s.cnic && <p><span className="font-semibold">{t('cnic')}:</span> {s.cnic}</p>}
                {s.payment_terms && <p>{t('paymentTerms')}: {s.payment_terms}</p>}
                <p>{t('creditLimit')}: {formatPKR(s.credit_limit, lang)}</p>
                <p className="flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5" />
                  {s.ProductSuppliers?.length || 0} {t('linkedProducts')}
                </p>
              </div>
              <button type="button" onClick={() => openEdit(s)} className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
                <Edit className="w-3.5 h-3.5" />{t('edit')}
              </button>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={modal === 'create' ? t('addSupplier') : t('editSupplier')} onClose={() => setModal(null)} wide>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('companyName')} *</label>
                <input className="input" required value={form.company_name} onChange={setF('company_name')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('contactPerson')}</label>
                <input className="input" value={form.contact_person} onChange={setF('contact_person')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('phone')}</label>
                <input className="input" value={form.phone} onChange={setF('phone')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('email')}</label>
                <input className="input" type="email" value={form.email} onChange={setF('email')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('taxNumber')}</label>
                <input className="input" value={form.tax_number} onChange={setF('tax_number')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('cnic')}</label>
                <input className="input" value={form.cnic} onChange={setF('cnic')} placeholder="e.g. 37405-1234567-1" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('paymentTerms')}</label>
                <input className="input" placeholder="Net 30 / COD" value={form.payment_terms} onChange={setF('payment_terms')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('creditLimit')}</label>
                <input className="input" type="number" min="0" value={form.credit_limit} onChange={setF('credit_limit')} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('address')}</label>
                <textarea className="input min-h-[80px]" value={form.address} onChange={setF('address')} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('save')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
