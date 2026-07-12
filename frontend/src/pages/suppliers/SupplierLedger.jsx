import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Wallet, CreditCard, Loader2, Printer, Plus, History } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import api from '../../api/axios';

const TXN_LABELS = {
  stock_received: 'Stock Received',
  payment_made: 'Payment Made',
  opening_balance: 'Opening Balance',
  adjustment: 'Adjustment',
};

export default function SupplierLedger() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams } = useShopApi();
  const isRTL = lang === 'ur';

  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('history');
  const [modal, setModal] = useState(null); // 'payment' | 'opening'
  const [saving, setSaving] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'cash', notes: '' });
  const [openingForm, setOpeningForm] = useState({ amount: '', date: new Date().toISOString().slice(0, 10) });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/suppliers/${id}/ledger`, { params: shopParams() });
      setLedger(data);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [id, shopParams, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const submitPayment = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/suppliers/${id}/payments`, {
        amount: parseFloat(paymentForm.amount),
        method: paymentForm.method,
        notes: paymentForm.notes || undefined,
        ...shopParams(),
      });
      success(t('paymentRecorded') || 'Payment recorded');
      setModal(null);
      setPaymentForm({ amount: '', method: 'cash', notes: '' });
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const submitOpening = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/suppliers/${id}/opening-balance`, {
        amount: parseFloat(openingForm.amount),
        date: openingForm.date,
        ...shopParams(),
      });
      success(t('openingBalanceSaved') || 'Opening balance recorded');
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-amber-400" /></div>;
  if (!ledger) return null;

  const { supplier, summary, products_received, products_linked, transaction_history, aging } = ledger;
  const agingTotal = aging.bucket_0_30 + aging.bucket_31_60 + aging.bucket_60_plus;

  const pills = [
    { label: t('totalPaid') || 'Paid', value: summary.total_paid, icon: Wallet, tone: 'emerald' },
    { label: t('currentPayable') || 'Payable', value: summary.current_payable, icon: CreditCard, tone: summary.current_payable > 0 ? 'red' : 'emerald' },
    { label: t('creditBalance') || 'Credit', value: summary.credit_balance, icon: Wallet, tone: 'amber' },
  ];
  const PILL_COLORS = {
    emerald: { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)', fg: 'rgb(16,185,129)' },
    red:     { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.25)',  fg: 'rgb(239,68,68)' },
    amber:   { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', fg: 'rgb(245,158,11)' },
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Building2}
        accent="amber"
        title={supplier.company_name}
        subtitle={supplier.supplier_code}
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/suppliers')} className="btn-secondary flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
            </button>
            <button
              type="button"
              onClick={() => window.open(`/suppliers/${id}/statement`, '_blank', 'noopener,noreferrer')}
              className="btn-secondary flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />{t('printStatement') || 'Print Statement'}
            </button>
            <button type="button" onClick={() => setModal('opening')} className="btn-secondary flex items-center gap-2">
              <History className="w-4 h-4" />{t('openingBalance') || 'Opening Balance'}
            </button>
            <button type="button" onClick={() => setModal('payment')} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('recordPayment') || 'Record Payment'}
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {pills.map(({ label, value, icon: Icon, tone }) => {
          const c = PILL_COLORS[tone];
          return (
            <div
              key={label}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.fg }}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}: {formatPKR(value, lang)}
            </div>
          );
        })}
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('totalStockValue') || 'Total Stock Value'}: {formatPKR(summary.total_stock_value, lang)} · {summary.product_count} {t('productCount') || 'Products'}
        </span>
      </div>

      {/* Aging buckets */}
      <div className="glass-card p-5">
        <h2 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{t('agingAnalysis') || 'Aging Analysis (Outstanding Invoices)'}</h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { key: 'bucket_0_30', label: '0-30 ' + (t('days') || 'days'), color: 'bg-emerald-500' },
            { key: 'bucket_31_60', label: '31-60 ' + (t('days') || 'days'), color: 'bg-amber-500' },
            { key: 'bucket_60_plus', label: '60+ ' + (t('days') || 'days'), color: 'bg-red-500' },
          ].map(b => (
            <div key={b.key}>
              <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                <span>{b.label}</span>
                <span>{agingTotal > 0 ? Math.round((aging[b.key] / agingTotal) * 100) : 0}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-1">
                <div className={`h-full ${b.color}`} style={{ width: `${agingTotal > 0 ? (aging[b.key] / agingTotal) * 100 : 0}%` }} />
              </div>
              <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{formatPKR(aging[b.key], lang)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 gap-4">
        <button
          onClick={() => setTab('history')}
          className={`pb-3 font-semibold text-sm transition-all border-b-2 px-1 ${tab === 'history' ? 'border-amber-500 text-amber-400' : 'border-transparent text-white/50 hover:text-white'}`}
        >
          {t('auditLog') || 'Audit Log'}
        </button>
        <button
          onClick={() => setTab('products')}
          className={`pb-3 font-semibold text-sm transition-all border-b-2 px-1 ${tab === 'products' ? 'border-amber-500 text-amber-400' : 'border-transparent text-white/50 hover:text-white'}`}
        >
          {t('productsReceived') || 'Products Received'}
        </button>
        <button
          onClick={() => setTab('linked')}
          className={`pb-3 font-semibold text-sm transition-all border-b-2 px-1 ${tab === 'linked' ? 'border-amber-500 text-amber-400' : 'border-transparent text-white/50 hover:text-white'}`}
        >
          {t('productsLinked') || 'Products Linked'}
        </button>
      </div>

      {tab === 'history' && (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('date') || 'Date'}</th>
                <th className="text-start p-4">{t('type') || 'Type'}</th>
                <th className="text-end p-4">{t('total') || 'Total'}</th>
                <th className="text-end p-4">{t('paid') || 'Paid'}</th>
                <th className="text-end p-4">{t('remaining') || 'Remaining'}</th>
                <th className="text-start p-4">{t('method') || 'Method'}</th>
                <th className="text-end p-4">{t('runningBalance') || 'Running Balance'}</th>
              </tr>
            </thead>
            <tbody>
              {transaction_history.map(txn => (
                <tr key={txn.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(txn.date).toLocaleDateString('en-PK')}</td>
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{TXN_LABELS[txn.type] || txn.type}</td>
                  <td className="p-4 text-end" style={{ color: 'var(--text-secondary)' }}>{formatPKR(txn.total_amount, lang)}</td>
                  <td className="p-4 text-end text-emerald-400 font-semibold">{formatPKR(txn.paid_amount, lang)}</td>
                  <td className="p-4 text-end text-red-400 font-semibold">{formatPKR(txn.remaining_amount, lang)}</td>
                  <td className="p-4 text-xs uppercase" style={{ color: 'var(--text-muted)' }}>{txn.method || '—'}</td>
                  <td className="p-4 text-end font-bold" style={{ color: 'var(--text-primary)' }}>{formatPKR(txn.running_balance, lang)}</td>
                </tr>
              ))}
              {transaction_history.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noTransactions') || 'No transactions yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'products' && (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('date') || 'Date'}</th>
                <th className="text-start p-4">{t('product')}</th>
                <th className="text-start p-4">{t('sku') || 'SKU'}</th>
                <th className="text-start p-4">{t('userBranch')}</th>
                <th className="text-end p-4">{t('quantity')}</th>
              </tr>
            </thead>
            <tbody>
              {products_received.map((p, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>{p.date ? new Date(p.date).toLocaleDateString('en-PK') : '—'}</td>
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{p.product_name}</td>
                  <td className="p-4 text-xs font-mono text-amber-400">{p.sku}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{p.branch}</td>
                  <td className="p-4 text-end font-bold text-emerald-400">+{p.quantity}</td>
                </tr>
              ))}
              {products_received.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noInventory')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'linked' && (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('product')}</th>
                <th className="text-start p-4">{t('sku') || 'SKU'}</th>
                <th className="text-end p-4">{t('purchasePrice') || 'Purchase Price'}</th>
                <th className="text-start p-4">{t('status') || 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {(products_linked || []).map((p, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {p.product_name}
                    {p.preferred_supplier && <span className="badge badge-green ms-2 text-[10px]">{t('preferred') || 'Preferred'}</span>}
                  </td>
                  <td className="p-4 text-xs font-mono text-amber-400">{p.sku}</td>
                  <td className="p-4 text-end" style={{ color: 'var(--text-secondary)' }}>{formatPKR(p.purchase_price, lang)}</td>
                  <td className="p-4 text-xs uppercase" style={{ color: 'var(--text-muted)' }}>{p.status}</td>
                </tr>
              ))}
              {(!products_linked || products_linked.length === 0) && (
                <tr><td colSpan={4} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noLinkedProducts') || 'No products linked to this supplier'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal === 'payment' && (
        <Modal title={t('recordPayment') || 'Record Payment'} onClose={() => setModal(null)}>
          <form onSubmit={submitPayment} className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('amount') || 'Amount'} *</label>
              <input className="input" type="number" step="0.01" min="0.01" required value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('method') || 'Method'} *</label>
              <select className="input" required value={paymentForm.method} onChange={e => setPaymentForm(f => ({ ...f, method: e.target.value }))}>
                <option value="cash">{t('cash') || 'Cash'}</option>
                <option value="bank">{t('bank') || 'Bank'}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('notes') || 'Notes'}</label>
              <textarea className="input min-h-[60px]" value={paymentForm.notes} onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))} />
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

      {modal === 'opening' && (
        <Modal title={t('openingBalance') || 'Opening Balance'} onClose={() => setModal(null)}>
          <form onSubmit={submitOpening} className="space-y-3">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('openingBalanceHint') || 'One-time entry for migrating an existing payable balance. This can only be recorded once per supplier.'}</p>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('amount') || 'Amount'} *</label>
              <input className="input" type="number" step="0.01" min="0" required value={openingForm.amount} onChange={e => setOpeningForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('date') || 'Date'}</label>
              <input className="input" type="date" value={openingForm.date} onChange={e => setOpeningForm(f => ({ ...f, date: e.target.value }))} />
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
