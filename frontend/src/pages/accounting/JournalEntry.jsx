import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileBarChart2, Plus, Trash2, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import FormLabel from '../../components/ui/FormLabel';
import api from '../../api/axios';

const EMPTY_LINE = { account_id: '', debit: '', credit: '' };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function JournalEntry() {
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams } = useShopApi();

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/accounting/chart-of-accounts', { params: shopParams() });
      setAccounts((data.accounts || []).filter(a => a.is_active !== false));
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, error, t]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const setLine = (idx, field, value) => {
    setLines(ls => ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };
  const addLine = () => setLines(ls => [...ls, { ...EMPTY_LINE }]);
  const removeLine = (idx) => setLines(ls => ls.length > 2 ? ls.filter((_, i) => i !== idx) : ls);

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const diff = Math.round((totalDebit - totalCredit) * 100) / 100;
  const balanced = Math.abs(diff) < 0.01 && totalDebit > 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!balanced) return;
    setSaving(true);
    try {
      await api.post('/accounting/journal-entries', {
        ...shopParams(),
        date,
        narration: narration.trim() || undefined,
        lines: lines
          .filter(l => l.account_id && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
          .map(l => ({ account_id: parseInt(l.account_id, 10), debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 })),
      });
      success(t('journalEntryPosted') || 'Journal entry posted');
      navigate('/accounting/general-ledger');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileBarChart2}
        accent="brand"
        title={t('voucherEntry') || 'Manual Journal Entry'}
        subtitle={t('journalEntrySub') || 'Post directly against any account — for anything sales, expenses, and payments don’t cover automatically'}
      />

      <form onSubmit={submit} className="glass-card p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <FormLabel required>{t('date') || 'Date'}</FormLabel>
            <input className="input" type="date" required value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <FormLabel>{t('description') || 'Narration'}</FormLabel>
            <input className="input" value={narration} onChange={e => setNarration(e.target.value)} placeholder={t('journalNarrationPlaceholder') || 'What is this entry for?'} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('journalLines') || 'Lines'}</span>
            <button type="button" onClick={addLine} className="text-xs text-brand-400 hover:underline">+ {t('addLine')}</button>
          </div>

          <div className="glass-card overflow-x-auto" style={{ background: 'var(--bg-elevated)' }}>
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                  <th className="text-start p-3">{t('accountName') || 'Account'}</th>
                  <th className="text-end p-3 w-36">{t('debit') || 'Debit'}</th>
                  <th className="text-end p-3 w-36">{t('credit') || 'Credit'}</th>
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td className="p-2">
                      <select
                        className="input"
                        required
                        value={line.account_id}
                        onChange={e => setLine(idx, 'account_id', e.target.value)}
                      >
                        <option value="" disabled>{t('selectAccount') || 'Select an account'}</option>
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        className="input text-end"
                        type="number" step="0.01" min="0"
                        value={line.debit}
                        onChange={e => setLine(idx, 'debit', e.target.value)}
                        onFocus={() => { if (line.credit) setLine(idx, 'credit', ''); }}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        className="input text-end"
                        type="number" step="0.01" min="0"
                        value={line.credit}
                        onChange={e => setLine(idx, 'credit', e.target.value)}
                        onFocus={() => { if (line.debit) setLine(idx, 'debit', ''); }}
                      />
                    </td>
                    <td className="p-2 text-center">
                      {lines.length > 2 && (
                        <button type="button" onClick={() => removeLine(idx)} className="icon-btn text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td className="p-3 text-end font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('total') || 'Total'}</td>
                  <td className="p-3 text-end font-bold" style={{ color: 'var(--text-primary)' }}>{formatPKR(totalDebit, lang)}</td>
                  <td className="p-3 text-end font-bold" style={{ color: 'var(--text-primary)' }}>{formatPKR(totalCredit, lang)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {!balanced && (totalDebit > 0 || totalCredit > 0) && (
            <p className="text-xs text-amber-400">
              {t('journalNotBalanced') || 'Not balanced yet'} — {t('difference') || 'difference'}: {formatPKR(Math.abs(diff), lang)}
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate('/accounting/general-ledger')} className="btn-secondary flex-1">{t('cancel')}</button>
          <button type="submit" disabled={saving || !balanced} className="btn-primary flex-1">{t('postEntry') || 'Post Entry'}</button>
        </div>
      </form>
    </div>
  );
}
