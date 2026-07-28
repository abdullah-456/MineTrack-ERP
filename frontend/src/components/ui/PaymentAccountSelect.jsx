import { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import api from '../../api/axios';

// Encodes payment destination as one string:
//   'cash' | 'cash:<id>' | 'bank:<id>' | 'bod_cash:<id>' | 'bod_bank:<id>'
export function encodePaymentAccount(method, bankAccountId, boardMemberId) {
  if (method === 'bod_cash' && boardMemberId) return `bod_cash:${boardMemberId}`;
  if (method === 'bod_bank' && boardMemberId) return `bod_bank:${boardMemberId}`;
  if (method === 'bank' && bankAccountId) return `bank:${bankAccountId}`;
  if (method === 'cash' && bankAccountId) return `cash:${bankAccountId}`;
  return 'cash';
}

export function decodePaymentAccount(value) {
  if (value?.startsWith('bod_cash:')) {
    return { method: 'bod_cash', bank_account_id: null, board_member_id: parseInt(value.slice(9), 10) };
  }
  if (value?.startsWith('bod_bank:')) {
    return { method: 'bod_bank', bank_account_id: null, board_member_id: parseInt(value.slice(9), 10) };
  }
  if (value?.startsWith('bank:')) {
    return { method: 'bank', bank_account_id: parseInt(value.slice(5), 10), board_member_id: null };
  }
  if (value?.startsWith('cash:')) {
    return { method: 'cash', bank_account_id: parseInt(value.slice(5), 10), board_member_id: null };
  }
  return { method: 'cash', bank_account_id: null, board_member_id: null };
}

function useFundAccounts() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    api.get('/bank-accounts').then(({ data }) => setAccounts((data.accounts || []).filter(a => a.is_active))).catch(() => setAccounts([]));
  }, []);
  return accounts;
}

function useBodPaymentSources() {
  const [sources, setSources] = useState([]);
  useEffect(() => {
    api.get('/board-members/payment-sources')
      .then(({ data }) => setSources(data.sources || []))
      .catch(() => setSources([]));
  }, []);
  return sources;
}

export default function PaymentAccountSelect({
  method, bankAccountId, boardMemberId, onChange, required, className = 'input', includeBod = true,
}) {
  const { t } = useTheme();
  const accounts = useFundAccounts();
  const bodSources = useBodPaymentSources();
  const cashAccounts = accounts.filter(a => a.kind === 'cash');
  const bankAccounts = accounts.filter(a => a.kind !== 'cash');
  const bodCash = includeBod ? bodSources.filter(s => s.method === 'bod_cash') : [];
  const bodBank = includeBod ? bodSources.filter(s => s.method === 'bod_bank') : [];

  return (
    <select
      className={className}
      required={required}
      value={encodePaymentAccount(method, bankAccountId, boardMemberId)}
      onChange={e => onChange(decodePaymentAccount(e.target.value))}
    >
      <option value="cash">{t('cashInHand') || 'Cash in Hand'}</option>
      {cashAccounts.length > 0 && (
        <optgroup label={t('cashAccounts') || 'Cash Accounts'}>
          {cashAccounts.map(a => <option key={a.id} value={`cash:${a.id}`}>{a.account_name}</option>)}
        </optgroup>
      )}
      {bodCash.length > 0 && (
        <optgroup label={t('bodCurrentCash') || 'BOD Current Cash'}>
          {bodCash.map(s => (
            <option key={s.value} value={s.value}>
              {s.label}{s.balance != null ? ` (${Number(s.balance).toLocaleString()})` : ''}
            </option>
          ))}
        </optgroup>
      )}
      {bankAccounts.length > 0 && (
        <optgroup label={t('bankAccounts') || 'Bank Accounts'}>
          {bankAccounts.map(a => <option key={a.id} value={`bank:${a.id}`}>{a.account_name}</option>)}
        </optgroup>
      )}
      {bodBank.length > 0 && (
        <optgroup label={t('bodCurrentBank') || 'BOD Current Bank'}>
          {bodBank.map(s => (
            <option key={s.value} value={s.value}>
              {s.label}{s.balance != null ? ` (${Number(s.balance).toLocaleString()})` : ''}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

function FundAccountPicker({
  kind,
  value,
  onChange,
  required,
  className = 'input',
  style,
  allowCashInHand = false,
  includeBod = true,
  boardMemberId,
  onBodChange,
}) {
  const { t } = useTheme();
  const accounts = useFundAccounts();
  const bodSources = useBodPaymentSources();
  const filtered = accounts.filter(a => a.kind === kind);
  const bodOpts = includeBod
    ? bodSources.filter(s => (kind === 'bank' ? s.method === 'bod_bank' : s.method === 'bod_cash'))
    : [];

  useEffect(() => {
    if (allowCashInHand && kind === 'cash') return;
    if (!value && !boardMemberId && filtered.length > 0) onChange(filtered[0].id);
  }, [filtered, value, onChange, allowCashInHand, kind, boardMemberId]);

  const selectValue = boardMemberId
    ? `${kind === 'bank' ? 'bod_bank' : 'bod_cash'}:${boardMemberId}`
    : (value ?? '');

  return (
    <select
      className={className}
      style={style}
      required={required && (!allowCashInHand || filtered.length > 0 || bodOpts.length > 0)}
      value={selectValue}
      onChange={e => {
        const v = e.target.value;
        if (v.startsWith('bod_')) {
          const id = parseInt(v.split(':')[1], 10);
          onChange(null);
          onBodChange?.(id);
        } else {
          onBodChange?.(null);
          onChange(v ? parseInt(v, 10) : null);
        }
      }}
    >
      {allowCashInHand && kind === 'cash' && (
        <option value="">{t('cashInHand') || 'Cash in Hand'}</option>
      )}
      {filtered.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
      {bodOpts.length > 0 && (
        <optgroup label={kind === 'bank' ? (t('bodCurrentBank') || 'BOD Current Bank') : (t('bodCurrentCash') || 'BOD Current Cash')}>
          {bodOpts.map(s => (
            <option key={s.value} value={s.value}>
              {s.label}{s.balance != null ? ` (${Number(s.balance).toLocaleString()})` : ''}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

export function BankAccountPicker(props) {
  return <FundAccountPicker kind="bank" {...props} />;
}

export function CashAccountPicker(props) {
  return <FundAccountPicker kind="cash" allowCashInHand {...props} />;
}
