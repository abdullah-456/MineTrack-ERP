import { useState, useEffect, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import api from '../../api/axios';

// Dropdown of real expense-type Chart-of-Accounts rows — replaces a free-text
// category field so every expense actually posts against a real account
// instead of one shared bucket. Includes an inline "add new category" flow
// so creating a category and using it stays a single step.
export default function ExpenseCategorySelect({ value, onChange, required, className = 'input' }) {
  const { t } = useTheme();
  const { error } = useToast();
  const { shopParams } = useShopApi();
  const [accounts, setAccounts] = useState([]);
  const [expenseParentId, setExpenseParentId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      const { data } = await api.get('/accounting/chart-of-accounts', { params: shopParams() });
      const all = data.accounts || [];
      setAccounts(all.filter(a => a.account_type === 'expense' && a.is_active !== false));
      setExpenseParentId(all.find(a => a.account_code === '07-EXPENSE')?.id || null);
    } catch {
      setAccounts([]);
    }
  }, [shopParams]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const createCategory = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.post('/accounting/chart-of-accounts', {
        ...shopParams(),
        account_name: newName.trim(),
        account_type: 'expense',
        parent_account_id: expenseParentId || undefined,
      });
      await fetchAccounts();
      onChange({ expense_account_id: data.account.id, category: data.account.account_name });
      setAdding(false);
      setNewName('');
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
          className={className}
          autoFocus
          placeholder={t('newCategoryName') || 'New category name'}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createCategory(); } }}
        />
        <button type="button" disabled={saving} onClick={createCategory} className="btn-primary px-3">
          {t('add') || 'Add'}
        </button>
        <button type="button" onClick={() => { setAdding(false); setNewName(''); }} className="icon-btn"><X className="w-4 h-4" /></button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <select
        className={className}
        required={required}
        value={value || ''}
        onChange={e => {
          const acc = accounts.find(a => a.id === parseInt(e.target.value, 10));
          if (acc) onChange({ expense_account_id: acc.id, category: acc.account_name });
        }}
      >
        <option value="" disabled>{t('selectCategory') || 'Select a category'}</option>
        {accounts.map(a => (
          <option key={a.id} value={a.id}>{a.account_name}</option>
        ))}
      </select>
      <button type="button" onClick={() => setAdding(true)} className="icon-btn flex-shrink-0" title={t('newCategory') || 'New Category'}>
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
