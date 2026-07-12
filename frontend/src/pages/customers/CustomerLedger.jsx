import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Wallet, CreditCard, Loader2, Plus, Receipt } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import api from '../../api/axios';

const TXN_LABELS = {
  sale_charge: 'Sale',
  installment_charge: 'Installment Sale',
  payment_received: 'Payment Received',
  return_credit: 'Return Credit',
  opening_balance: 'Opening Balance',
  adjustment: 'Adjustment',
};

export default function CustomerLedger() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams } = useShopApi();
  const isRTL = lang === 'ur';

  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('history');
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'cash', notes: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/customers/${id}/ledger`, { params: shopParams() });
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
      await api.post(`/customers/${id}/payments`, {
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

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>;
  if (!ledger) return null;

  const { customer, summary, sales_history, transaction_history } = ledger;

  const pills = [
    { label: t('totalCharged') || 'Total Charged', value: summary.total_charged, icon: Wallet, tone: 'amber' },
    { label: t('totalPaid') || 'Total Paid', value: summary.total_paid, icon: Wallet, tone: 'emerald' },
    { label: t('currentBalance') || 'Current Balance', value: summary.current_balance, icon: CreditCard, tone: summary.current_balance > 0 ? 'red' : 'emerald' },
  ];
  const PILL_COLORS = {
    emerald: { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)', fg: 'rgb(16,185,129)' },
    red:     { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.25)',  fg: 'rgb(239,68,68)' },
    amber:   { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', fg: 'rgb(245,158,11)' },
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Users}
        accent="brand"
        title={customer.name}
        subtitle={customer.phone || customer.cnic || ''}
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/customers')} className="btn-secondary flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
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
          {t('creditLimit') || 'Credit Limit'}: {formatPKR(summary.credit_limit, lang)}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 gap-4">
        <button
          onClick={() => setTab('history')}
          className={`pb-3 font-semibold text-sm transition-all border-b-2 px-1 ${tab === 'history' ? 'border-brand-500 text-brand-400' : 'border-transparent text-white/50 hover:text-white'}`}
        >
          {t('auditLog') || 'Audit Log'}
        </button>
        <button
          onClick={() => setTab('sales')}
          className={`pb-3 font-semibold text-sm transition-all border-b-2 px-1 ${tab === 'sales' ? 'border-brand-500 text-brand-400' : 'border-transparent text-white/50 hover:text-white'}`}
        >
          {t('salesHistory') || 'Sales History'}
        </button>
      </div>

      {tab === 'history' && (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('date') || 'Date'}</th>
                <th className="text-start p-4">{t('type') || 'Type'}</th>
                <th className="text-end p-4">{t('amount') || 'Amount'}</th>
                <th className="text-start p-4">{t('method') || 'Method'}</th>
                <th className="text-start p-4">{t('notes') || 'Notes'}</th>
                <th className="text-end p-4">{t('runningBalance') || 'Running Balance'}</th>
              </tr>
            </thead>
            <tbody>
              {transaction_history.map(txn => (
                <tr key={txn.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(txn.date).toLocaleDateString('en-PK')}</td>
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{TXN_LABELS[txn.type] || txn.type}</td>
                  <td className={`p-4 text-end font-semibold ${['payment_received', 'return_credit'].includes(txn.type) ? 'text-emerald-400' : 'text-red-400'}`}>
                    {['payment_received', 'return_credit'].includes(txn.type) ? '-' : '+'}{formatPKR(txn.amount, lang)}
                  </td>
                  <td className="p-4 text-xs uppercase" style={{ color: 'var(--text-muted)' }}>{txn.method || '—'}</td>
                  <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>{txn.notes || '—'}</td>
                  <td className="p-4 text-end font-bold" style={{ color: 'var(--text-primary)' }}>{formatPKR(txn.running_balance, lang)}</td>
                </tr>
              ))}
              {transaction_history.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noTransactions') || 'No transactions yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'sales' && (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('invoiceNo') || 'Invoice #'}</th>
                <th className="text-start p-4">{t('date') || 'Date'}</th>
                <th className="text-start p-4">{t('saleType') || 'Sale Type'}</th>
                <th className="text-start p-4">{t('userBranch')}</th>
                <th className="text-end p-4">{t('total') || 'Total'}</th>
              </tr>
            </thead>
            <tbody>
              {(sales_history || []).map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-mono text-brand-400 text-xs">{s.invoice_number}</td>
                  <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(s.sale_date).toLocaleDateString('en-PK')}</td>
                  <td className="p-4">
                    <span className="badge badge-blue">{t(s.sale_type) || s.sale_type}</span>
                    {parseFloat(s.tax) > 0 && <span className="badge badge-yellow ms-1">{t('tax') || 'Tax'}</span>}
                  </td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{s.Branch?.name}</td>
                  <td className="p-4 text-end font-bold text-emerald-400">{formatPKR(s.total, lang)}</td>
                </tr>
              ))}
              {(!sales_history || sales_history.length === 0) && (
                <tr><td colSpan={5} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noSalesYet') || 'No sales yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal === 'payment' && (
        <Modal title={t('recordPayment') || 'Record Payment'} onClose={() => setModal(null)}>
          <form onSubmit={submitPayment} className="space-y-3">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('currentBalance') || 'Current Balance'}: {formatPKR(summary.current_balance, lang)}
            </p>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('amount') || 'Amount'} *</label>
              <input className="input" type="number" step="0.01" min="0.01" max={summary.current_balance || undefined} required value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} />
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
    </div>
  );
}
