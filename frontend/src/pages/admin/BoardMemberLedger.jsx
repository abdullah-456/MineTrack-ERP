import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Crown, Wallet, Loader2, ArrowDownCircle, ArrowUpCircle, Printer, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import FundAccountSelect from '../../components/ui/FundAccountSelect';
import api from '../../api/axios';

const TXN_LABELS = {
  opening_balance: 'Opening Balance',
  contribution: 'Contribution Received',
  withdrawal: 'Withdrawal Paid',
  adjustment: 'Adjustment',
};

const EMPTY_FORM = { amount: '', method: 'cash', bank_account_id: null, date: '', notes: '' };

export default function BoardMemberLedger() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams } = useShopApi();

  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // 'receive' | 'send'
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/board-members/${id}/ledger`, { params: shopParams() });
      setLedger(data);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [id, shopParams, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openVoucher = (txn) => {
    const params = new URLSearchParams({
      module:     'board_member',
      txnType:    txn.type,
      entityName: member?.name || '',
      amount:     txn.amount,
      date:       txn.date,
      method:     txn.method || '',
      notes:      txn.notes  || '',
      voucherNo:  txn.voucher_id || txn.id,
      shopName:   '',
    });
    window.open(`/ledger-voucher?${params.toString()}`, '_blank');
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const endpoint = modal === 'receive' ? 'receive' : 'send';
      const { data } = await api.post(`/board-members/${id}/${endpoint}`, {
        amount: parseFloat(form.amount),
        method: form.method,
        bank_account_id: form.bank_account_id,
        date: form.date || undefined,
        notes: form.notes || undefined,
        ...shopParams(),
      });
      success(modal === 'receive' ? (t('contributionRecorded') || 'Contribution recorded') : (t('withdrawalRecorded') || 'Withdrawal recorded'));
      setModal(null);
      setForm(EMPTY_FORM);
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

  const { member, summary, transaction_history } = ledger;
  const bal = parseFloat(summary.current_balance || 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Crown}
        accent="amber"
        title={member.name}
        subtitle={[member.phone, member.cnic].filter(Boolean).join(' · ')}
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/admin/board-of-directors')} className="btn-secondary flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
            </button>
            <button type="button" onClick={() => { setForm(EMPTY_FORM); setModal('receive'); }} className="btn-primary flex items-center gap-2">
              <ArrowDownCircle className="w-4 h-4" />{t('recordReceive') || 'Receive'}
            </button>
            <button type="button" onClick={() => { setForm(EMPTY_FORM); setModal('send'); }} className="btn-secondary flex items-center gap-2">
              <ArrowUpCircle className="w-4 h-4" />{t('recordSend') || 'Send'}
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.25)', color: 'rgb(16,185,129)' }}>
          <Wallet className="w-3.5 h-3.5" />
          {t('totalContributed') || 'Total Contributed'}: {formatPKR(summary.total_contributed, lang)}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: 'rgb(239,68,68)' }}>
          <Wallet className="w-3.5 h-3.5" />
          {t('totalWithdrawn') || 'Total Withdrawn'}: {formatPKR(summary.total_withdrawn, lang)}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.25)', color: 'rgb(99,102,241)' }}>
          <Wallet className="w-3.5 h-3.5" />
          {t('currentBalance') || 'Current Balance'}: {formatPKR(bal, lang)}
        </div>
      </div>

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
        <table className="w-full text-sm min-w-[760px]">
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
                TXN_LABELS[txn.type] || txn.type, txn.method, txn.notes, txn.bank_account_name,
                String(txn.amount), String(txn.running_balance),
                new Date(txn.date).toLocaleDateString('en-PK')
              ].some(v => (v || '').toLowerCase().includes(search.trim().toLowerCase())))
              .map(txn => (
              <tr
                key={txn.id}
                id={`row-${txn.id}`}
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
                className="hover:bg-white/10 cursor-pointer transition-colors"
                title="Click to view in accounting"
                onClick={(e) => {
                  if (e.target.closest('button')) return;
                  navigate(`/accounting/general-ledger?highlight=${txn.voucher_id || txn.id}`);
                }}
              >
                <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(txn.date).toLocaleDateString('en-PK')}</td>
                <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{TXN_LABELS[txn.type] || txn.type}</td>
                <td className="p-4 text-end font-semibold text-red-400">
                  {txn.type === 'withdrawal' ? formatPKR(txn.amount, lang) : '—'}
                </td>
                <td className="p-4 text-end font-semibold text-emerald-400">
                  {txn.type !== 'withdrawal' ? formatPKR(txn.amount, lang) : '—'}
                </td>
                <td className="p-4 text-xs uppercase" style={{ color: 'var(--text-muted)' }}>
                  {txn.bank_account_name
                    || (txn.method === 'cash' && !txn.bank_account_id ? (t('cashInHand') || 'Cash in Hand') : null)
                    || txn.method || '—'}
                </td>
                <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>{txn.notes || '—'}</td>
                <td className="p-4 text-end font-bold" style={{ color: 'var(--text-primary)' }}>{formatPKR(txn.running_balance, lang)}</td>
                <td className="p-4 text-center">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openVoucher(txn); }}
                    title="Print Payment Slip"
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

      {modal && (
        <Modal title={modal === 'receive' ? (t('recordReceive') || 'Receive') : (t('recordSend') || 'Send')} onClose={() => setModal(null)}>
          <form onSubmit={submit} className="space-y-3">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('currentBalance') || 'Current Balance'}: {formatPKR(bal, lang)}
            </p>
            <div>
              <FormLabel required>{t('amount') || 'Amount'}</FormLabel>
              <input className="input" type="number" step="0.01" min="0.01" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <FormLabel>{t('paymentDateTime') || 'Transaction Date & Time (Optional)'}</FormLabel>
              <input className="input" type="datetime-local" value={form.date || ''} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <FormLabel required>{t('method') || 'Method'}</FormLabel>
              <select
                className="input"
                value={form.method}
                onChange={e => setForm(f => ({ ...f, method: e.target.value, bank_account_id: null }))}
              >
                <option value="cash">{t('cash') || 'Cash'}</option>
                <option value="bank">{t('bank') || 'Bank Transfer'}</option>
              </select>
            </div>
            {form.method === 'cash' && (
              <div>
                <FormLabel>{t('whichCashAccount') || 'Which cash account?'}</FormLabel>
                <FundAccountSelect
                  kind="cash"
                  allowCashInHand
                  value={form.bank_account_id}
                  onChange={bank_account_id => setForm(f => ({ ...f, bank_account_id }))}
                />
              </div>
            )}
            {form.method === 'bank' && (
              <div>
                <FormLabel required>{t('whichBankAccount') || 'Which bank account?'}</FormLabel>
                <FundAccountSelect
                  kind="bank"
                  required
                  value={form.bank_account_id}
                  onChange={bank_account_id => setForm(f => ({ ...f, bank_account_id }))}
                />
              </div>
            )}
            <div>
              <FormLabel>{t('description') || 'Notes'}</FormLabel>
              <textarea className="input min-h-[60px]" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
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
