import { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import api from '../../api/axios';

// Single dropdown for "which account did this flow through": the shared Cash
// in Hand bucket, or any of the shop's own named fund accounts — cash-kind
// (e.g. "Petty Cash") or bank-kind (e.g. "Office 2 Account"), grouped clearly
// so it's obvious which is which. Encodes the choice as a single string value
// — 'cash' or 'bank:<id>' — so callers can drive it with one piece of state.
// (Named accounts of either kind are mechanically identical — a plain running
// balance with its own ledger line — so both use the 'bank:<id>' shape; only
// the literal shared Cash in Hand bucket is the special 'cash' value.)
export function encodePaymentAccount(method, bankAccountId) {
  if (method === 'bank' && bankAccountId) return `bank:${bankAccountId}`;
  if (method === 'cash' && bankAccountId) return `cash:${bankAccountId}`;
  return 'cash';
}

export function decodePaymentAccount(value) {
  if (value?.startsWith('bank:')) {
    return { method: 'bank', bank_account_id: parseInt(value.slice(5), 10) };
  }
  if (value?.startsWith('cash:')) {
    return { method: 'cash', bank_account_id: parseInt(value.slice(5), 10) };
  }
  return { method: 'cash', bank_account_id: null };
}

function useFundAccounts() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    api.get('/bank-accounts').then(({ data }) => setAccounts((data.accounts || []).filter(a => a.is_active))).catch(() => setAccounts([]));
  }, []);
  return accounts;
}

// `method`/`bankAccountId` are the parent's current values; `onChange` receives
// the decoded { method, bank_account_id } pair so the parent never has to
// parse the encoded string itself.
export default function PaymentAccountSelect({ method, bankAccountId, onChange, required, className = 'input' }) {
  const { t } = useTheme();
  const accounts = useFundAccounts();
  const cashAccounts = accounts.filter(a => a.kind === 'cash');
  const bankAccounts = accounts.filter(a => a.kind !== 'cash');

  return (
    <select
      className={className}
      required={required}
      value={encodePaymentAccount(method, bankAccountId)}
      onChange={e => onChange(decodePaymentAccount(e.target.value))}
    >
      <option value="cash">{t('cashInHand') || 'Cash in Hand'}</option>
      {cashAccounts.length > 0 && (
        <optgroup label={t('cashAccounts') || 'Cash Accounts'}>
          {cashAccounts.map(a => <option key={a.id} value={`cash:${a.id}`}>{a.account_name}</option>)}
        </optgroup>
      )}
      {bankAccounts.length > 0 && (
        <optgroup label={t('bankAccounts') || 'Bank Accounts'}>
          {bankAccounts.map(a => <option key={a.id} value={`bank:${a.id}`}>{a.account_name}</option>)}
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
}) {
  const { t } = useTheme();
  const accounts = useFundAccounts();
  const filtered = accounts.filter(a => a.kind === kind);

  useEffect(() => {
    if (allowCashInHand && kind === 'cash') return;
    if (!value && filtered.length > 0) onChange(filtered[0].id);
  }, [filtered, value, onChange, allowCashInHand, kind]);

  const selectValue = value ?? '';

  return (
    <select
      className={className}
      style={style}
      required={required && (!allowCashInHand || filtered.length > 0)}
      value={selectValue}
      onChange={e => onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
    >
      {allowCashInHand && kind === 'cash' && (
        <option value="">{t('cashInHand') || 'Cash in Hand'}</option>
      )}
      {filtered.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
    </select>
  );
}

// Bank-only picker — used after the user picks "Bank Transfer".
export function BankAccountPicker(props) {
  return <FundAccountPicker kind="bank" {...props} />;
}

// Cash fund picker — used after the user picks "Cash". Defaults to Cash in Hand
// (no sub-account) with optional named cash funds below it.
export function CashAccountPicker(props) {
  return <FundAccountPicker kind="cash" allowCashInHand {...props} />;
}
