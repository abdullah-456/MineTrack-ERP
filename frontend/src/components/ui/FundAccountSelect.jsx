import { useState, useEffect, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import api from '../../api/axios';

// Pick an existing cash or bank fund account, or create one inline under
// 05-CASH / 05-BANK (same as Chart of Accounts → Add Account). The new
// account is linked to Cash in Hand / Bank totals and usable everywhere
// a payment fund is chosen.
export default function FundAccountSelect({
  kind,
  value,
  onChange,
  required,
  allowCashInHand = false,
  className = 'input',
}) {
  const { t } = useTheme();
  const { error, success } = useToast();
  const { shopParams } = useShopApi();
  const [accounts, setAccounts] = useState([]);
  const [parentId, setParentId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const parentCode = kind === 'cash' ? '05-CASH' : '05-BANK';

  const fetchAccounts = useCallback(async () => {
    try {
      const [coaRes, fundRes] = await Promise.all([
        api.get('/accounting/chart-of-accounts', { params: shopParams() }),
        api.get('/bank-accounts', { params: shopParams() }),
      ]);
      const parent = (coaRes.data.accounts || []).find(a => a.account_code === parentCode);
      setParentId(parent?.id || null);
      setAccounts((fundRes.data.accounts || []).filter(a => a.is_active && a.kind === kind));
    } catch {
      setAccounts([]);
    }
  }, [shopParams, parentCode, kind]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const createAccount = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const { data } = await api.post('/accounting/chart-of-accounts', {
        ...shopParams(),
        account_name: name,
        account_type: 'asset',
        parent_account_id: parentId,
      });

      let createdId = data.fund_account?.id || null;
      if (!createdId) {
        const { data: fundData } = await api.get('/bank-accounts', { params: shopParams() });
        const match = (fundData.accounts || []).find(
          a => a.chart_of_account_id === data.account.id || a.account_name === name,
        );
        createdId = match?.id || null;
      }

      await fetchAccounts();
      setAdding(false);
      setNewName('');
      if (createdId) onChange(createdId);
      success(t('accountCreated') || 'Account created');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  if (adding) {
    return (
      <div className="flex gap-2">
        <input
          className={`${className} flex-1 min-w-0`}
          autoFocus
          placeholder={kind === 'cash' ? (t('newCashAccountName') || 'e.g. Petty Cash') : (t('newBankAccountName') || 'e.g. HBL Main')}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createAccount(); } }}
        />
        <button type="button" disabled={saving} onClick={createAccount} className="btn-primary px-3 whitespace-nowrap">
          {t('add') || 'Add'}
        </button>
        <button type="button" onClick={() => { setAdding(false); setNewName(''); }} className="icon-btn flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <select
        className={`${className} flex-1 min-w-0`}
        required={required && (!allowCashInHand || accounts.length > 0)}
        value={value ?? ''}
        onChange={e => onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
      >
        {allowCashInHand && kind === 'cash' && (
          <option value="">{t('cashInHand') || 'Cash in Hand'}</option>
        )}
        {kind === 'bank' && required && !value && (
          <option value="" disabled hidden>{t('selectBankAccount') || 'Select bank account…'}</option>
        )}
        {accounts.map(a => (
          <option key={a.id} value={a.id}>{a.account_name}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="icon-btn flex-shrink-0"
        title={kind === 'cash' ? (t('newCashAccount') || 'New cash account') : (t('newBankAccount') || 'New bank account')}
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
