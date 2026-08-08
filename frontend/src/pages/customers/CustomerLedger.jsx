import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Wallet, CreditCard, Loader2, Plus, Printer, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import ReportActions from '../../components/ui/ReportActions';
import PaymentAccountSelect from '../../components/ui/PaymentAccountSelect';
import DocumentsPanel from '../../components/documents/DocumentsPanel';
import { money } from '../../utils/reportExport';
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
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'cash', bank_account_id: null, board_member_id: null, date: '', notes: '' });

  // Open a printable voucher in a new tab for a single transaction
  const openVoucher = (txn) => {
    const params = new URLSearchParams({
      module:     'customer',
      txnType:    txn.type,
      entityName: customer?.name || '',
      amount:     txn.amount,
      date:       txn.date,
      method:     txn.method || '',
      notes:      txn.notes  || '',
      voucherNo:  txn.id,
      shopName:   customer?.shop_name || '',
    });
    window.open(`/ledger-voucher?${params.toString()}`, '_blank');
  };

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
      const { data } = await api.post(`/customers/${id}/payments`, {
        amount: parseFloat(paymentForm.amount),
        method: paymentForm.method,
        bank_account_id: paymentForm.bank_account_id,
        board_member_id: paymentForm.board_member_id || undefined,
        date: paymentForm.date || undefined,
        notes: paymentForm.notes || undefined,
        ...shopParams(),
      });
      success(t('paymentRecorded') || 'Payment recorded');
      setModal(null);
      setPaymentForm({ amount: '', method: 'cash', bank_account_id: null, board_member_id: null, date: '', notes: '' });
      fetchData();
      if (data?.transaction) {
        openVoucher(data.transaction);
      }
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>;
  if (!ledger) return null;

  const { customer, summary, sales_history, transaction_history } = ledger;

  const bal = parseFloat(summary.current_balance || 0);
  const isAdvance = bal < 0;
  const pills = [
    { label: t('totalCharged') || 'Total Charged', value: summary.total_charged, icon: Wallet, tone: 'amber' },
    { label: t('totalPaid') || 'Total Paid', value: summary.total_paid, icon: Wallet, tone: 'emerald' },
    isAdvance
      ? { label: t('advanceCredit') || 'Advance / Credit', value: Math.abs(bal), icon: CreditCard, tone: 'emerald' }
      : { label: t('currentBalance') || 'Current Balance', value: bal, icon: CreditCard, tone: bal > 0 ? 'red' : 'emerald' },
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
            <ReportActions
              title={`${t('customerLedger') || 'Customer Statement'} — ${customer.name}`}
              columns={[
                { header: t('date') || 'Date', render: r => new Date(r.date).toLocaleDateString('en-PK'), width: 1.1 },
                { header: t('type') || 'Type', render: r => TXN_LABELS[r.type] || r.type, width: 1.4 },
                { header: t('debit') || 'Debit', render: r => !['payment_received', 'return_credit'].includes(r.type) ? money(r.amount) : '', align: 'right', width: 1.1 },
                { header: t('credit') || 'Credit', render: r => ['payment_received', 'return_credit'].includes(r.type) ? money(r.amount) : '', align: 'right', width: 1.1 },
                { header: t('method') || 'Method', render: r => r.method || '', width: 1 },
                { header: t('description') || 'Description', render: r => r.notes || '', width: 2 },
                { header: t('runningBalance') || 'Balance', render: r => money(r.running_balance), align: 'right', width: 1.2 },
              ]}
              rows={transaction_history}
              filters={[
                customer.phone ? { label: t('phone') || 'Phone', value: customer.phone } : null,
                customer.cnic ? { label: t('cnic') || 'CNIC', value: customer.cnic } : null,
                { label: t('currentBalance') || 'Balance', value: (parseFloat(summary.current_balance) < 0 ? `${money(Math.abs(summary.current_balance))} (Adv)` : money(summary.current_balance)) },
              ].filter(Boolean)}
              signature
              filename={`customer-statement-${customer.name}.pdf`}
            />
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
      </div>

      <DocumentsPanel ownerType="customer" ownerId={id} />

      {/* Tabs */}
      <div className="flex gap-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <button
          onClick={() => setTab('history')}
          className={`pb-3 font-semibold text-sm transition-all border-b-2 px-1 ${tab === 'history' ? 'border-brand-500 text-brand-400' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
        >
          {t('auditLog') || 'Audit Log'}
        </button>
        <button
          onClick={() => setTab('sales')}
          className={`pb-3 font-semibold text-sm transition-all border-b-2 px-1 ${tab === 'sales' ? 'border-brand-500 text-brand-400' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
        >
          {t('salesHistory') || 'Sales History'}
        </button>
      </div>

      {tab === 'history' && (
        <div className="space-y-3">
          <div className="glass-card p-3">
            <div className="relative max-w-md">
              <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ left: '10px', color: 'var(--text-muted)' }} />
              <input
                className="input"
                style={{ paddingInlineStart: '2.25rem' }}
                placeholder="Search type, notes, method, date…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('date') || 'Date'}</th>
                <th className="text-start p-4">{t('type') || 'Type'}</th>
                <th className="text-end p-4">{t('debit') || 'Debit'}</th>
                <th className="text-end p-4">{t('credit') || 'Credit'}</th>
                <th className="text-start p-4">{t('method') || 'Method'}</th>
                <th className="text-start p-4">{t('description') || 'Description'}</th>
                <th className="text-end p-4">{t('runningBalance') || 'Running Balance'}</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody>
              {transaction_history
                .filter(txn => !search.trim() || [
                  TXN_LABELS[txn.type] || txn.type, txn.method, txn.notes,
                  String(txn.amount), String(txn.running_balance),
                  new Date(txn.date).toLocaleDateString('en-PK')
                ].some(v => (v || '').toLowerCase().includes(search.trim().toLowerCase())))
                .map(txn => (
                <tr
                  key={txn.id}
                  id={`row-${txn.id}`}
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  className="hover:bg-white/10 cursor-pointer transition-colors"
                  title={t('clickToViewDetail') || 'Click to view transaction in module'}
                  onClick={(e) => {
                    if (e.target.closest('button')) return;
                    if (['sale_charge', 'installment_charge', 'sale'].includes(txn.type) || txn.sale_id) {
                      navigate(`/sales?highlight=${txn.sale_id || txn.id}`);
                    } else if (['return_credit', 'return'].includes(txn.type)) {
                      navigate(`/returns?highlight=${txn.return_id || txn.id}`);
                    } else {
                      navigate(`/accounting/general-ledger?highlight=${txn.voucher_id || txn.id}`);
                    }
                  }}
                >
                  <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(txn.date).toLocaleDateString('en-PK')}</td>
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{TXN_LABELS[txn.type] || txn.type}</td>
                  <td className="p-4 text-end font-semibold text-red-400">
                    {!['payment_received', 'return_credit'].includes(txn.type) ? formatPKR(txn.amount, lang) : '—'}
                  </td>
                  <td className="p-4 text-end font-semibold text-emerald-400">
                    {['payment_received', 'return_credit'].includes(txn.type) ? formatPKR(txn.amount, lang) : '—'}
                  </td>
                  <td className="p-4 text-xs uppercase" style={{ color: 'var(--text-muted)' }}>{txn.method || '—'}</td>
                  <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>{txn.notes || '—'}</td>
                  <td className="p-4 text-end font-bold" style={{ color: 'var(--text-primary)' }}>{formatPKR(txn.running_balance, lang)}</td>
                  <td className="p-4 text-center">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openVoucher(txn); }}
                      title="Print Voucher"
                      className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {transaction_history.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noTransactions') || 'No transactions yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
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
                <th className="text-end p-4">{t('actions') || 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {(sales_history || []).map(s => (
                <tr
                  key={s.id}
                  id={`row-${s.id}`}
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  className="hover:bg-white/10 cursor-pointer transition-colors"
                  title={t('clickToViewDetail') || 'Click to view sale details'}
                  onClick={(e) => {
                    if (e.target.closest('button')) return;
                    navigate(`/sales?highlight=${s.id}`);
                  }}
                >
                  <td className="p-4 font-mono text-brand-400 text-xs">{s.invoice_number}</td>
                  <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(s.sale_date).toLocaleDateString('en-PK')}</td>
                  <td className="p-4">
                    <span className="badge badge-blue">{t(s.sale_type) || s.sale_type}</span>
                    {parseFloat(s.tax) > 0 && <span className="badge badge-yellow ms-1">{t('tax') || 'Tax'}</span>}
                  </td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{s.Branch?.name}</td>
                  <td className="p-4 text-end font-bold text-emerald-400">{formatPKR(s.total, lang)}</td>
                  <td className="p-4 text-end">
                    <button
                      type="button"
                      title={t('printInvoice') || 'Print Invoice'}
                      onClick={(e) => { e.stopPropagation(); window.open(`/invoice/sale-${s.id}?auto_print=1`, '_blank', 'noopener,noreferrer'); }}
                      className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {(!sales_history || sales_history.length === 0) && (
                <tr><td colSpan={6} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noSalesYet') || 'No sales yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal === 'payment' && (
        <Modal title={t('recordPayment') || 'Record Payment'} onClose={() => setModal(null)}>
          <form onSubmit={submitPayment} className="space-y-3">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {isAdvance
                ? `${t('advanceCredit') || 'Advance / Credit'}: ${formatPKR(Math.abs(bal), lang)}`
                : `${t('currentBalance') || 'Current Balance'}: ${formatPKR(bal, lang)}`}
            </p>
            <div>
              <FormLabel required>{t('amount') || 'Amount'}</FormLabel>
              <input className="input" type="number" step="0.01" min="0.01" required value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} />
              {parseFloat(paymentForm.amount || 0) > Math.max(0, bal) && (
                <p className="text-xs mt-1 text-emerald-400">
                  {t('advanceHint') || 'Amount exceeds the balance — the extra will be recorded as advance credit.'}
                </p>
              )}
            </div>
            <div>
              <FormLabel>{t('paymentDateTime') || 'Payment Date & Time (Optional)'}</FormLabel>
              <input className="input" type="datetime-local" value={paymentForm.date || ''} onChange={e => setPaymentForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <FormLabel required>{t('method') || 'Method'}</FormLabel>
              <PaymentAccountSelect
                required
                method={paymentForm.method}
                bankAccountId={paymentForm.bank_account_id}
                boardMemberId={paymentForm.board_member_id}
                onChange={({ method, bank_account_id, board_member_id }) => setPaymentForm(f => ({
                  ...f, method, bank_account_id, board_member_id: board_member_id || null,
                }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('description') || 'Description'}</label>
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
