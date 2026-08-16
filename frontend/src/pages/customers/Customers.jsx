import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Search, Edit, Loader2, CreditCard, UserCheck, ShoppingBag, BookOpen, Trash2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import { useHighlightRow } from '../../hooks/useHighlightRow';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import StatusBadge, { statusText } from '../../components/ui/StatusBadge';
import ReportActions from '../../components/ui/ReportActions';
import ReportFilters, { activeFilterList } from '../../components/ui/ReportFilters';
import { money } from '../../utils/reportExport';
import api from '../../api/axios';

const EMPTY = {
  name: '', cnic: '', phone: '', address: '',
  status: 'active', customer_type: 'registered',
};

export default function Customers() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams } = useShopApi();
  const navigate = useNavigate();
  const isRTL = lang === 'ur';
  const { isHighlighted } = useHighlightRow();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reportFilters, setReportFilters] = useState({ customer_type: '', status: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams(), search };
      const { data } = await api.get('/customers', { params });
      setCustomers(data.customers || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, search, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (c) => {
    const ok = await confirm({ title: t('delete'), message: t('confirmDeleteCustomer'), confirmLabel: t('delete'), cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      const res = await api.delete(`/customers/${c.id}`, { params: shopParams() });
      success(res.status === 202 ? t('deletionRequestSubmitted') : t('customerDeleted'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, ...shopParams() };
      if (modal === 'create') {
        await api.post('/customers', payload);
        success(t('customerCreated'));
      } else {
        await api.put(`/customers/${selected.id}`, payload);
        success(t('customerUpdated'));
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

  const typeConfig = {
    registered: { icon: UserCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/25', label: t('registered') },
    walkin:     { icon: ShoppingBag, color: 'text-yellow-400', bg: 'bg-yellow-500/15 border-yellow-500/25', label: t('walkin') },
  };

  // ── Report model ────────────────────────────────────────────────────────────
  const reportSelects = [
    { key: 'customer_type', label: t('type') || 'Type', options: [{ value: 'registered', label: t('registered') || 'Registered' }, { value: 'walkin', label: t('walkin') || 'Walk-in' }] },
    { key: 'status', label: t('status') || 'Status', options: [{ value: 'active', label: t('active') || 'Active' }, { value: 'disabled', label: t('disabled') || 'Disabled' }] },
  ];
  let reportRows = customers;
  if (reportFilters.customer_type) reportRows = reportRows.filter(c => (c.customer_type || 'registered') === reportFilters.customer_type);
  if (reportFilters.status) reportRows = reportRows.filter(c => c.status === reportFilters.status);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    reportRows = reportRows.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.cnic || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.customer_type || '').toLowerCase().includes(q) ||
      (c.status || '').toLowerCase().includes(q) ||
      (c.address || '').toLowerCase().includes(q) ||
      (String(c.current_balance) || '').toLowerCase().includes(q)
    );
  }
  const reportColumns = [
    { header: t('name') || 'Name', key: 'name', width: 1.8 },
    { header: t('cnic') || 'CNIC', render: c => c.cnic || '', width: 1.4 },
    { header: t('phone') || 'Phone', render: c => c.phone || '', width: 1.2 },
    { header: t('balance') || 'Balance', render: c => (parseFloat(c.current_balance) < 0 ? `${money(Math.abs(c.current_balance))} (Adv)` : money(c.current_balance)), align: 'right', width: 1.3 },
    { header: t('status') || 'Status', render: c => statusText(t, c.status), width: 0.9 },
  ];
  const reportTotals = { __label: t('total') || 'Total' };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Users}
        accent="brand"
        title={t('customers')}
        subtitle={t('customersSub')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={t('customers') || 'Customers Report'}
              columns={reportColumns}
              rows={reportRows}
              totals={reportTotals}
              filters={activeFilterList(reportFilters, reportSelects)}
              filename="customers-report.pdf"
            />
            <button type="button" onClick={() => { setForm(EMPTY); setModal('create'); }} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('addCustomer')}
            </button>
          </div>
        }
      />

      {/* Search Bar */}
      <div className="glass-card p-4 space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingInlineStart: '2.5rem' }} placeholder={t('searchCustomers')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <ReportFilters
          value={reportFilters}
          onChange={(k, v) => setReportFilters(f => ({ ...f, [k]: v }))}
          onClear={() => setReportFilters({ customer_type: '', status: '' })}
          selects={reportSelects}
          showDates={false}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {reportRows.map(c => {
            const tc = typeConfig[c.customer_type || 'registered'];
            const TypeIcon = tc?.icon || UserCheck;
            return (
              <div
                key={c.id}
                id={`row-${c.id}`}
                className={`glass-card p-5 border transition-colors ${isHighlighted(c.id) ? 'highlight-row' : 'border-transparent hover:border-brand-500/30'}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-lg truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</h3>
                    </div>
                    {c.cnic && <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{c.cnic}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 ms-2">
                    <StatusBadge status={c.status} />
                    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${tc?.bg} ${tc?.color}`}>
                      <TypeIcon className="w-3 h-3" />
                      {tc?.label}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                  {c.phone && <p>📞 {c.phone}</p>}
                  {c.address && <p className="line-clamp-2">📍 {c.address}</p>}
                  <p className="flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" />
                    {parseFloat(c.current_balance) < 0 ? (
                      <span className="text-emerald-400">{t('advanceCredit') || 'Advance'}: {formatPKR(Math.abs(c.current_balance), lang)}</span>
                    ) : (
                      <span className={parseFloat(c.current_balance) > 0 ? 'text-red-400 font-semibold' : ''}>
                        {t('currentBalance') || 'Balance'}: {formatPKR(c.current_balance, lang)}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(c);
                      setForm({
                        name: c.name, cnic: c.cnic || '', phone: c.phone || '',
                        address: c.address || '', status: c.status,
                        customer_type: c.customer_type || 'registered',
                      });
                      setModal('edit');
                    }}
                    className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm"
                  >
                    <Edit className="w-3.5 h-3.5" />{t('edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/customers/${c.id}`)}
                    className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm"
                  >
                    <BookOpen className="w-3.5 h-3.5" />{t('ledger')}
                  </button>
                  <button type="button" onClick={() => handleDelete(c)} className="icon-btn text-red-400" title={t('delete')}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
          {reportRows.length === 0 && (
            <div className="col-span-full glass-card p-12 text-center" style={{ color: 'var(--text-muted)' }}>{t('noCustomers')}</div>
          )}
        </div>
      )}

      {modal && (
        <Modal title={modal === 'create' ? t('addCustomer') : t('editCustomer')} onClose={() => setModal(null)} wide>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <FormLabel required>{t('name')}</FormLabel>
                <input className="input" required value={form.name} onChange={setF('name')} />
              </div>
              <div>
                <FormLabel>{t('cnic')}</FormLabel>
                <input className="input" placeholder="35202-1234567-1" value={form.cnic} onChange={setF('cnic')} />
              </div>
              <div>
                <FormLabel>{t('phone')}</FormLabel>
                <input className="input" value={form.phone} onChange={setF('phone')} />
              </div>
              <div className="sm:col-span-2">
                <FormLabel>{t('address')}</FormLabel>
                <textarea className="input min-h-[80px]" value={form.address} onChange={setF('address')} />
              </div>
            </div>
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
