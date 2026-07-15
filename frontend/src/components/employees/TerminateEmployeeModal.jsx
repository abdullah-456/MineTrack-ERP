import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import Modal from '../ui/Modal';
import api from '../../api/axios';
import { openClearancePrint } from '../../utils/employeeClearancePdf';

const EMPTY_SETTLE = { amount: '', method: 'cash', notes: '' };

function SettlementSection({ title, balance, balanceLabel, form, onChange, t, lang, receive }) {
  return (
    <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</span>
        <span className="text-xs font-bold" style={{ color: receive ? '#f87171' : '#34d399' }}>
          {balanceLabel}: {formatPKR(balance, lang)}
        </span>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {t('settlementOptionalHint') || 'Optional — leave amount blank to skip this settlement'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('amount') || 'Amount'}</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min="0"
            max={balance}
            placeholder={String(balance)}
            value={form.amount}
            onChange={e => onChange({ ...form, amount: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('method') || 'Method'}</label>
          <select className="input" value={form.method} onChange={e => onChange({ ...form, method: e.target.value })}>
            <option value="cash">{t('cash') || 'Cash'}</option>
            <option value="bank">{t('bank') || 'Bank'}</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('description') || 'Notes'}</label>
        <input className="input" value={form.notes} onChange={e => onChange({ ...form, notes: e.target.value })} />
      </div>
    </div>
  );
}

function buildSettlementsPayload(balances, forms) {
  const payload = {};
  const add = (key, balance) => {
    const amt = parseFloat(forms[key].amount);
    if (!(amt > 0)) return;
    payload[key] = {
      amount: Math.min(amt, balance),
      method: forms[key].method,
      notes: forms[key].notes.trim() || null,
    };
  };
  if (balances.salary_payable > 0.01) add('pay_payable', balances.salary_payable);
  if (balances.salary_receivable > 0.01) add('collect_overpayment', balances.salary_receivable);
  if (balances.loan_receivable > 0.01) add('collect_loan', balances.loan_receivable);
  if (balances.advance_pending > 0.01) add('collect_advance', balances.advance_pending);
  return Object.keys(payload).length ? payload : null;
}

export default function TerminateEmployeeModal({ employee, onClose, onDone }) {
  const { t, lang } = useTheme();
  const { isAdmin } = useAuth();
  const { success, error } = useToast();
  const { shopParams } = useShopApi();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [balances, setBalances] = useState(null);
  const [terminationNotes, setTerminationNotes] = useState('');
  const [forms, setForms] = useState({
    pay_payable: { ...EMPTY_SETTLE },
    collect_overpayment: { ...EMPTY_SETTLE },
    collect_loan: { ...EMPTY_SETTLE },
    collect_advance: { ...EMPTY_SETTLE },
  });

  useEffect(() => {
    if (!employee?.id) return;
    setLoading(true);
    api.get(`/employees/${employee.id}/termination-preview`, { params: shopParams() })
      .then(({ data }) => setBalances(data.balances))
      .catch(e => error(e.response?.data?.message || t('toastErrorGeneric')))
      .finally(() => setLoading(false));
  }, [employee?.id, shopParams, error, t]);

  const setForm = (key) => (val) => setForms(f => ({ ...f, [key]: val }));

  const handleTerminate = async () => {
    if (!employee?.id) return;
    setSaving(true);
    try {
      const settlements = isAdmin() && balances?.has_outstanding
        ? buildSettlementsPayload(balances, forms)
        : null;

      const res = await api.post(`/employees/${employee.id}/terminate`, {
        termination_notes: terminationNotes.trim() || null,
        settlements,
      }, { params: shopParams() });

      success(res.status === 202 ? t('deletionRequestSubmitted') : t('employeeTerminated'));
      onClose();
      onDone?.();
      if (res.status === 200) {
        openClearancePrint(employee.id, true);
      }
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const canSettle = isAdmin() && balances?.has_outstanding;

  return (
    <Modal title={t('terminateEmployee') || 'Terminate Employee'} onClose={() => !saving && onClose()} wide>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>
      ) : (
        <div className="space-y-4">
          <p style={{ color: 'var(--text-secondary)' }}>
            {(t('confirmTerminateEmployee') || 'Terminate {name}? A clearance certificate will be generated after completion.').replace('{name}', employee?.name || '')}
          </p>

          {!isAdmin() && balances?.has_outstanding && (
            <p className="text-xs text-amber-400">
              {t('terminationSettlementAdminOnly') || 'Outstanding balances exist. Settlement can be recorded by an admin when approving termination, or from the employee ledger before termination.'}
            </p>
          )}

          {canSettle && (
            <>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('terminationSettlement') || 'Final Settlement (Optional)'}
              </p>
              {balances.salary_payable > 0.01 && (
                <SettlementSection
                  title={t('clearanceSalaryPayable') || 'Pay outstanding salary to employee'}
                  balance={balances.salary_payable}
                  balanceLabel={t('payable') || 'Payable'}
                  form={forms.pay_payable}
                  onChange={setForm('pay_payable')}
                  t={t}
                  lang={lang}
                />
              )}
              {balances.salary_receivable > 0.01 && (
                <SettlementSection
                  title={t('clearanceSalaryReceivable') || 'Recover salary overpayment from employee'}
                  balance={balances.salary_receivable}
                  balanceLabel={t('receivable') || 'Receivable'}
                  form={forms.collect_overpayment}
                  onChange={setForm('collect_overpayment')}
                  t={t}
                  lang={lang}
                  receive
                />
              )}
              {balances.loan_receivable > 0.01 && (
                <SettlementSection
                  title={t('clearanceLoanReceivable') || 'Collect outstanding loan'}
                  balance={balances.loan_receivable}
                  balanceLabel={t('receivable') || 'Receivable'}
                  form={forms.collect_loan}
                  onChange={setForm('collect_loan')}
                  t={t}
                  lang={lang}
                  receive
                />
              )}
              {balances.advance_pending > 0.01 && (
                <SettlementSection
                  title={t('clearanceAdvancePending') || 'Collect uncleared advances'}
                  balance={balances.advance_pending}
                  balanceLabel={t('pendingAdvance') || 'Pending'}
                  form={forms.collect_advance}
                  onChange={setForm('collect_advance')}
                  t={t}
                  lang={lang}
                  receive
                />
              )}
            </>
          )}

          {!balances?.has_outstanding && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('noOutstandingBalances') || 'No outstanding payable or receivable balances.'}
            </p>
          )}

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
              {t('terminationRemarks') || 'Termination remarks (optional)'}
            </label>
            <textarea
              className="input min-h-[80px]"
              value={terminationNotes}
              onChange={e => setTerminationNotes(e.target.value)}
              placeholder={t('terminationRemarksPlaceholder') || 'Reason for leaving, handover notes, etc.'}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" disabled={saving} onClick={onClose} className="btn-secondary flex-1">{t('cancel')}</button>
            <button type="button" disabled={saving} onClick={handleTerminate} className="btn-primary flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('terminate') || 'Terminate'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
