import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Crown, Wallet, Loader2,
  Printer, Search, ArrowLeftRight, PiggyBank,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import FundAccountSelect from '../../components/ui/FundAccountSelect';
import api from '../../api/axios';

const TXN_LABELS = {
  opening_balance: 'Opening Investment',
  contribution: 'Investment Received',
  withdrawal: 'Investment Withdrawal',
  adjustment: 'Adjustment',
  personal_deposit: 'Personal Deposit',
  transfer_to_capital: 'Transfer → Capital',
  transfer_from_capital: 'Transfer ← Capital',
  current_payment: 'Paid from Current',
  current_receipt: 'Received to Current',
};

const EMPTY_FORM = {
  amount: '', method: 'cash', bank_account_id: null, date: '', notes: '',
  current_method: 'cash', capital_method: 'cash', capital_bank_account_id: null,
  direction: 'to_capital',
};

export default function BoardMemberLedger() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams } = useShopApi();

  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all'); // all | investment | current
  const [modal, setModal] = useState(null); // deposit | transfer
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/board-members/${id}/ledger`, {
        params: { ...shopParams(), bucket: tab === 'all' ? undefined : tab },
      });
      setLedger(data);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [id, shopParams, error, t, tab]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openVoucher = (txn) => {
    const params = new URLSearchParams({
      module: 'board_member',
      txnType: txn.type,
      entityName: ledger?.member?.name || '',
      amount: txn.amount,
      date: txn.date,
      method: txn.method || '',
      notes: txn.notes || '',
      voucherNo: txn.voucher_id || txn.id,
      shopName: '',
    });
    window.open(`/ledger-voucher?${params.toString()}`, '_blank');
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let endpoint;
      let body;
      if (modal === 'deposit') {
        endpoint = 'personal-deposit';
        body = {
          amount: parseFloat(form.amount),
          method: form.method,
          date: form.date || undefined,
          notes: form.notes || undefined,
        };
      } else if (modal === 'transfer') {
        endpoint = 'transfer';
        body = {
          direction: form.direction,
          amount: parseFloat(form.amount),
          current_method: form.current_method,
          capital_method: form.capital_method,
          capital_bank_account_id: form.capital_bank_account_id,
          date: form.date || undefined,
          notes: form.notes || undefined,
        };
      } else {
        return;
      }
      const { data } = await api.post(`/board-members/${id}/${endpoint}`, { ...body, ...shopParams() });
      success(t('saved') || 'Saved');
      setModal(null);
      setForm(EMPTY_FORM);
      fetchData();
      if (data?.transaction) openVoucher(data.transaction);
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !ledger) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>;
  }
  if (!ledger) return null;

  const { member, summary, transaction_history } = ledger;
  const invBal = parseFloat(summary.investment_balance || 0);
  const curCash = parseFloat(summary.current_cash_balance || 0);
  const curBank = parseFloat(summary.current_bank_balance || 0);
  const dueFrom = parseFloat(summary.due_from_balance || 0);

  const modalTitle = {
    deposit: t('personalDeposit') || 'Personal Deposit to Current',
    transfer: t('transferCapital') || 'Transfer with Capital',
  }[modal];

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
            <button type="button" onClick={() => { setForm(EMPTY_FORM); setModal('deposit'); }} className="btn-primary flex items-center gap-2">
              <PiggyBank className="w-4 h-4" />{t('deposit') || 'Deposit'}
            </button>
            <button type="button" onClick={() => { setForm({ ...EMPTY_FORM, direction: 'to_capital' }); setModal('transfer'); }} className="btn-secondary flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4" />{t('transfer') || 'Transfer'}
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.25)', color: 'rgb(99,102,241)' }}>
          <Wallet className="w-3.5 h-3.5" />
          {t('investmentBalance') || 'Investment'}: {formatPKR(invBal, lang)}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.25)', color: 'rgb(16,185,129)' }}>
          <Wallet className="w-3.5 h-3.5" />
          {t('currentCash') || 'Current Cash'}: {formatPKR(curCash, lang)}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.25)', color: 'rgb(59,130,246)' }}>
          <Wallet className="w-3.5 h-3.5" />
          {t('currentBank') || 'Current Bank'}: {formatPKR(curBank, lang)}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)', color: 'rgb(245,158,11)' }}>
          <Wallet className="w-3.5 h-3.5" />
          {t('dueFromBod') || 'Due from BOD'}: {formatPKR(dueFrom, lang)}
        </div>
      </div>

      <div className="flex gap-2">
        {['all', 'investment', 'current'].map(k => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${tab === k ? 'bg-brand-500/20 border-brand-500/50 text-brand-300' : 'hover:bg-[var(--bg-hover)]'}`}
            style={tab !== k ? { color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' } : {}}
          >
            {k === 'all' ? (t('all') || 'All') : k === 'investment' ? (t('investment') || 'Investment') : (t('currentAccount') || 'Current')}
          </button>
        ))}
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
              <th className="text-end p-4">{t('amount') || 'Amount'}</th>
              <th className="text-start p-4">{t('method') || 'Method'}</th>
              <th className="text-start p-4">{t('description') || 'Description'}</th>
              <th className="text-end p-4">{t('runningBalance') || 'Running'}</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {transaction_history
              .filter(txn => !search.trim() || [
                TXN_LABELS[txn.type] || txn.type, txn.method, txn.notes, txn.bank_account_name,
                String(txn.amount),
                new Date(txn.date).toLocaleDateString('en-PK'),
              ].some(v => (v || '').toLowerCase().includes(search.trim().toLowerCase())))
              .map(txn => (
                <tr
                  key={txn.id}
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  className="hover:bg-white/10 cursor-pointer transition-colors"
                  onClick={(e) => {
                    if (e.target.closest('button')) return;
                    navigate(`/accounting/general-ledger?highlight=${txn.voucher_id || txn.id}`);
                  }}
                >
                  <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(txn.date).toLocaleDateString('en-PK')}</td>
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{TXN_LABELS[txn.type] || txn.type}</td>
                  <td className="p-4 text-end font-semibold" style={{ color: 'var(--text-primary)' }}>{formatPKR(txn.amount, lang)}</td>
                  <td className="p-4 text-xs uppercase" style={{ color: 'var(--text-muted)' }}>
                    {txn.bank_account_name || txn.method || '—'}
                  </td>
                  <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>{txn.notes || '—'}</td>
                  <td className="p-4 text-end font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                    {tab === 'current'
                      ? `C ${formatPKR(txn.running_current_cash, lang)} / B ${formatPKR(txn.running_current_bank, lang)}`
                      : formatPKR(txn.running_investment ?? txn.running_balance, lang)}
                  </td>
                  <td className="p-4 text-center">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openVoucher(txn); }}
                      className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            {transaction_history.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noTransactions') || 'No transactions yet'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modalTitle} onClose={() => setModal(null)}>
          <form onSubmit={submit} className="space-y-3">
            {modal === 'transfer' && (
              <div>
                <FormLabel required>{t('direction') || 'Direction'}</FormLabel>
                <select
                  className="input"
                  value={form.direction}
                  onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}
                >
                  <option value="to_capital">{t('currentToCapital') || 'Current → Capital (Cash/Bank)'}</option>
                  <option value="from_capital">{t('capitalToCurrent') || 'Capital → Current'}</option>
                </select>
              </div>
            )}
            <div>
              <FormLabel required>{t('amount') || 'Amount'}</FormLabel>
              <input className="input" type="number" step="0.01" min="0.01" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <FormLabel>{t('paymentDateTime') || 'Transaction Date & Time (Optional)'}</FormLabel>
              <input className="input" type="datetime-local" value={form.date || ''} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>

            {modal === 'deposit' && (
              <div>
                <FormLabel required>{t('currentWallet') || 'Current wallet'}</FormLabel>
                <select
                  className="input"
                  value={form.method}
                  onChange={e => setForm(f => ({ ...f, method: e.target.value, bank_account_id: null }))}
                >
                  <option value="cash">{t('cash') || 'Cash'}</option>
                  <option value="bank">{t('bank') || 'Bank'}</option>
                </select>
              </div>
            )}

            {modal === 'transfer' && (
              <>
                <div>
                  <FormLabel required>{t('currentWallet') || 'BOD Current wallet'}</FormLabel>
                  <select
                    className="input"
                    value={form.current_method}
                    onChange={e => setForm(f => ({ ...f, current_method: e.target.value }))}
                  >
                    <option value="cash">{t('cashInHand') || 'Cash'} ({formatPKR(curCash, lang)})</option>
                    <option value="bank">{t('bank') || 'Bank'} ({formatPKR(curBank, lang)})</option>
                  </select>
                </div>
                <div>
                  <FormLabel required>{t('capitalAccount') || 'Capital Cash / Bank'}</FormLabel>
                  <select
                    className="input"
                    value={form.capital_method}
                    onChange={e => setForm(f => ({ ...f, capital_method: e.target.value, capital_bank_account_id: null }))}
                  >
                    <option value="cash">{t('cashInHand') || 'Cash in Hand'}</option>
                    <option value="bank">{t('bank') || 'Bank'}</option>
                  </select>
                </div>
                {form.capital_method === 'cash' && (
                  <div>
                    <FormLabel>{t('whichCashAccount') || 'Which cash account?'}</FormLabel>
                    <FundAccountSelect
                      kind="cash"
                      allowCashInHand
                      value={form.capital_bank_account_id}
                      onChange={capital_bank_account_id => setForm(f => ({ ...f, capital_bank_account_id }))}
                    />
                  </div>
                )}
                {form.capital_method === 'bank' && (
                  <div>
                    <FormLabel required>{t('whichBankAccount') || 'Which bank account?'}</FormLabel>
                    <FundAccountSelect
                      kind="bank"
                      required
                      value={form.capital_bank_account_id}
                      onChange={capital_bank_account_id => setForm(f => ({ ...f, capital_bank_account_id }))}
                    />
                  </div>
                )}
              </>
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
