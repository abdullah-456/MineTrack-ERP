import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, UserCheck, Wallet, CreditCard, Loader2, Printer, Download, Plus, HandCoins, PiggyBank, FileCheck, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import PaymentAccountSelect from '../../components/ui/PaymentAccountSelect';
import EmployeeAttachments from '../../components/employees/EmployeeAttachments';
import { useAuthedImage } from '../../hooks/useAuthedImage';
import api from '../../api/axios';
import { downloadEmployeeSlip } from '../../utils/employeeSlipPdf';
import TerminateEmployeeModal from '../../components/employees/TerminateEmployeeModal';
import { openClearancePrint } from '../../utils/employeeClearancePdf';

// Transaction types that represent an actual physical hand-off of money —
// these get a printable/downloadable slip. Accounting-only legs (salary_due
// accrual, deduction, adjustment, opening_balance) have no counterpart slip.
const SLIP_TYPES = new Set(['advance_given', 'loan_given', 'loan_repayment', 'payment_made']);

export default function EmployeeLedger() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopName, can } = useAuth();
  const { shopParams } = useShopApi();
  const isRTL = lang === 'ur';
  const [downloadingId, setDownloadingId] = useState(null);

  const handleDownloadSlip = async (txnId) => {
    setDownloadingId(txnId);
    try {
      await downloadEmployeeSlip(id, txnId, shopName);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setDownloadingId(null);
    }
  };

  const TXN_LABELS = {
    salary_due: t('salaryDue') || 'Salary Due',
    advance_given: t('advanceGiven') || 'Advance Given',
    loan_given: t('loanGivenLabel') || 'Loan Given',
    payment_made: t('salaryPaid') || 'Salary Paid',
    loan_repayment: t('loanPaymentReceived') || 'Loan Payment Received',
    deduction: t('deduction') || 'Deduction',
    opening_balance: t('openingBalance') || 'Opening Balance',
    adjustment: t('adjustment') || 'Adjustment',
    receivable_collected: t('receivableCollected') || 'Receivable Collected',
  };

  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('history');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // advance | loan | receivable
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const [advanceForm, setAdvanceForm] = useState({ amount: '', method: 'cash', bank_account_id: null, for_month: currentMonth, date: '', notes: '' });
  const [loanForm, setLoanForm] = useState({ amount: '', method: 'cash', bank_account_id: null, date: '', notes: '' });
  const [receivableForm, setReceivableForm] = useState({ amount: '', method: 'cash', bank_account_id: null, date: '', notes: '' });

  // Open a printable voucher in a new tab for a single transaction
  const openVoucher = (txn, employeeName) => {
    const params = new URLSearchParams({
      module:     'employee',
      txnType:    txn.type,
      entityName: employeeName || '',
      amount:     txn.amount,
      date:       txn.date,
      method:     txn.method || '',
      notes:      txn.notes  || '',
      voucherNo:  txn.id,
      shopName:   '',
    });
    window.open(`/ledger-voucher?${params.toString()}`, '_blank');
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/employees/${id}/ledger`, { params: shopParams() });
      setLedger(data);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [id, shopParams, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const runAction = async (fn, successMsg) => {
    setSaving(true);
    try {
      await fn();
      success(successMsg);
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const submitAdvance = (e) => {
    e.preventDefault();
    runAction(() => api.post(`/employees/${id}/advances`, { ...advanceForm, amount: parseFloat(advanceForm.amount), ...shopParams() }), t('advanceRecorded') || 'Advance recorded');
  };

  const submitLoan = (e) => {
    e.preventDefault();
    runAction(() => api.post(`/employees/${id}/loans`, { ...loanForm, amount: parseFloat(loanForm.amount), ...shopParams() }), t('loanRecorded') || 'Loan recorded');
  };

  const submitReceivable = (e) => {
    e.preventDefault();
    runAction(() => api.post(`/employees/${id}/receive-loan-payment`, { ...receivableForm, amount: parseFloat(receivableForm.amount), ...shopParams() }), t('loanPaymentReceivedMsg') || 'Loan payment received');
  };

  const changeStatus = async (status) => {
    if (status === 'terminated') {
      setTerminateOpen(true);
      return;
    }
    if (ledger?.employee?.status === status) return;
    setSaving(true);
    try {
      await api.patch(`/employees/${id}/status`, { status, ...shopParams() });
      success(t('employeeUpdated') || 'Employee updated');
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const photoQs = (() => { const p = new URLSearchParams(shopParams()); return p.toString() ? `?${p.toString()}` : ''; })();
  const { src: photoSrc } = useAuthedImage(ledger?.employee?.photo_path ? `/employees/${id}/photo${photoQs}` : null);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>;
  if (!ledger) return null;

  const { employee, summary, payroll_history, transaction_history } = ledger;

  const payableToEmployee = Math.max(0, summary.current_payable);
  const loanReceivable = summary.loan_receivable || 0;

  const slips = (transaction_history || []).filter(txn => SLIP_TYPES.has(txn.type));

  const pills = [
    { label: t('loanGivenLabel') || 'Loan Given', value: summary.loan_given || 0, icon: HandCoins, tone: 'amber' },
    { label: t('receivable') || 'Receivable', value: loanReceivable, icon: CreditCard, tone: loanReceivable > 0 ? 'red' : 'emerald' },
    { label: t('payable') || 'Payable', value: payableToEmployee, icon: Wallet, tone: payableToEmployee > 0 ? 'red' : 'emerald' },
  ];
  const PILL_COLORS = {
    emerald: { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)', fg: 'rgb(16,185,129)' },
    red:     { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.25)',  fg: 'rgb(239,68,68)' },
    amber:   { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', fg: 'rgb(245,158,11)' },
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={UserCheck}
        avatarSrc={photoSrc}
        accent="cyan"
        title={employee.name}
        subtitle={employee.designation}
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/employees')} className="btn-secondary flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
            </button>
            <button type="button" onClick={() => window.open(`/employees/${id}/statement`, '_blank', 'noopener,noreferrer')} className="btn-secondary flex items-center gap-2">
              <Printer className="w-4 h-4" />{t('printStatement') || 'Print Statement'}
            </button>
            {employee.status === 'terminated' && (
              <button type="button" onClick={() => openClearancePrint(id)} className="btn-secondary flex items-center gap-2 text-emerald-400">
                <FileCheck className="w-4 h-4" />{t('clearanceCertificate') || 'Clearance Certificate'}
              </button>
            )}
            <button
              type="button"
              onClick={() => { setAdvanceForm({ amount: '', method: 'cash', for_month: currentMonth, date: '', notes: '' }); setModal('advance'); }}
              className="btn-secondary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />{t('giveAdvance') || 'Advance'}
            </button>
            <button
              type="button"
              onClick={() => { setLoanForm({ amount: '', method: 'cash', date: '', notes: '' }); setModal('loan'); }}
              className="btn-secondary flex items-center gap-2"
            >
              <HandCoins className="w-4 h-4" />{t('giveLoan') || 'Loan'}
            </button>
            {loanReceivable > 0 && (
              <button
                type="button"
                onClick={() => { setReceivableForm({ amount: '', method: 'cash', date: '', notes: '' }); setModal('receivable'); }}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                <PiggyBank className="w-4 h-4" />{t('receiveLoanPayment') || 'Receive Loan Payment'}
              </button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        {can('employees', 'update') && employee.status !== 'terminated' ? (
          <select
            className="input text-sm py-1.5 px-3 w-auto"
            value={employee.status === 'suspended' ? 'suspended' : 'active'}
            disabled={saving}
            onChange={e => changeStatus(e.target.value)}
          >
            <option value="active">{t('active') || 'Active'}</option>
            <option value="suspended">{t('suspended') || 'Suspended'}</option>
            <option value="terminated">{t('terminate') || 'Terminate'}</option>
          </select>
        ) : (
          <StatusBadge status={employee.status} />
        )}
      </div>

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
          {t('totalSalaryAccrued') || 'Total Salary Accrued'}: {formatPKR(summary.total_salary_accrued, lang)} · {t('totalPaid') || 'Total Paid'}: {formatPKR(summary.total_paid, lang)}
          {summary.advance_pending > 0 && <> · {t('pendingAdvance') || 'Pending Advance'}: {formatPKR(summary.advance_pending, lang)}</>}
        </span>
      </div>

      <div className="flex gap-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        {[
          ['history', t('auditLog') || 'Audit Log'],
          ['payroll', t('payrollHistory') || 'Payroll History'],
          ['slips', t('slips') || 'Slips'],
          ['attachments', t('attachments') || 'Attachments'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`pb-3 font-semibold text-sm transition-all border-b-2 px-1 ${tab === key ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
          >
            {label}
          </button>
        ))}
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
          <table className="w-full text-sm min-w-[850px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('date') || 'Date'}</th>
                <th className="text-start p-4">{t('type') || 'Type'}</th>
                <th className="text-end p-4">{t('amount') || 'Amount'}</th>
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
                    if (['payroll_accrual', 'salary_payment', 'payroll'].includes(txn.type) || txn.payroll_id) {
                      navigate(`/payroll?highlight=${txn.payroll_id || txn.id}`);
                    } else {
                      navigate(`/employees?highlight=${employee.id}`);
                    }
                  }}
                >
                  <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(txn.date).toLocaleDateString('en-PK')}</td>
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {TXN_LABELS[txn.type] || txn.type}
                    {txn.type === 'advance_given' && txn.for_month && (
                      <span className={`badge ms-1.5 text-[10px] ${txn.cleared ? 'badge-green' : 'badge-yellow'}`}>
                        {txn.for_month}{txn.cleared ? ` · ${t('cleared') || 'Cleared'}` : ` · ${t('pending') || 'Pending'}`}
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-end font-semibold" style={{ color: 'var(--text-primary)' }}>{formatPKR(txn.amount, lang)}</td>
                  <td className="p-4 text-xs uppercase" style={{ color: 'var(--text-muted)' }}>{txn.method || '—'}</td>
                  <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>{txn.notes || '—'}</td>
                  <td className="p-4 text-end font-bold" style={{ color: 'var(--text-primary)' }}>{formatPKR(txn.running_balance, lang)}</td>
                  <td className="p-4 text-center">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openVoucher(txn, employee.name); }}
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
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noTransactions') || 'No transactions yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {tab === 'payroll' && (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('month') || 'Month'}</th>
                <th className="text-end p-4">{t('basicSalary')}</th>
                <th className="text-end p-4">{t('bonus') || 'Bonus'}</th>
                <th className="text-end p-4">{t('deductions') || 'Deductions'}</th>
                <th className="text-end p-4">{t('netPay') || 'Net Pay'}</th>
                <th className="text-start p-4">{t('status') || 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {payroll_history.map(p => (
                <tr
                  key={p.id}
                  id={`row-${p.id}`}
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  className="hover:bg-white/10 cursor-pointer transition-colors"
                  title={t('clickToViewDetail') || 'Click to view payroll details'}
                  onClick={(e) => {
                    if (e.target.closest('button')) return;
                    navigate(`/payroll?highlight=${p.id}`);
                  }}
                >
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{p.month}</td>
                  <td className="p-4 text-end">{formatPKR(p.basic_salary, lang)}</td>
                  <td className="p-4 text-end text-emerald-400">{formatPKR(p.bonus, lang)}</td>
                  <td className="p-4 text-end text-red-400">{formatPKR(p.deductions, lang)}</td>
                  <td className="p-4 text-end font-bold" style={{ color: 'var(--text-primary)' }}>{formatPKR(p.net_pay, lang)}</td>
                  <td className="p-4"><span className={`badge ${p.status === 'paid' ? 'badge-green' : 'badge-yellow'}`}>{p.status}</span></td>
                </tr>
              ))}
              {payroll_history.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noPayrollRuns') || 'No payroll runs yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'slips' && (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('date') || 'Date'}</th>
                <th className="text-start p-4">{t('type') || 'Type'}</th>
                <th className="text-end p-4">{t('amount') || 'Amount'}</th>
                <th className="text-start p-4">{t('method') || 'Method'}</th>
                <th className="text-end p-4">{t('actions') || 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {slips.map(txn => (
                <tr key={txn.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(txn.date).toLocaleDateString('en-PK')}</td>
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{TXN_LABELS[txn.type] || txn.type}</td>
                  <td className="p-4 text-end font-semibold" style={{ color: 'var(--text-primary)' }}>{formatPKR(txn.amount, lang)}</td>
                  <td className="p-4 text-xs uppercase" style={{ color: 'var(--text-muted)' }}>{txn.method || '—'}</td>
                  <td className="p-4 text-end">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        title={t('printStatement') || 'Print'}
                        onClick={() => window.open(`/employees/${id}/slip/${txn.id}?auto_print=1`, '_blank', 'noopener,noreferrer')}
                        className="icon-btn"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title={t('download') || 'Download'}
                        disabled={downloadingId === txn.id}
                        onClick={() => handleDownloadSlip(txn.id)}
                        className="icon-btn"
                      >
                        {downloadingId === txn.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {slips.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noSlipsYet') || 'No slips yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'attachments' && (
        <EmployeeAttachments employeeId={id} canEdit={can('employees', 'update')} />
      )}

      {modal === 'advance' && (
        <Modal title={t('giveAdvance') || 'Give Advance'} onClose={() => setModal(null)}>
          <form onSubmit={submitAdvance} className="space-y-3">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('advanceMonthHint')}
            </p>
            <div>
              <FormLabel required>{t('amount') || 'Amount'}</FormLabel>
              <input className="input" type="number" step="0.01" min="0.01" required value={advanceForm.amount} onChange={e => setAdvanceForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <FormLabel required>{t('forMonth') || 'For Salary Month'}</FormLabel>
              <input className="input" type="month" required value={advanceForm.for_month} onChange={e => setAdvanceForm(f => ({ ...f, for_month: e.target.value }))} />
            </div>
            <div>
              <FormLabel>{t('date') || 'Date & Time (Optional)'}</FormLabel>
              <input className="input" type="datetime-local" value={advanceForm.date || ''} onChange={e => setAdvanceForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <FormLabel required>{t('method') || 'Method'}</FormLabel>
              <PaymentAccountSelect
                includeBod={false}
                method={advanceForm.method}
                bankAccountId={advanceForm.bank_account_id}
                onChange={({ method, bank_account_id }) => setAdvanceForm(f => ({ ...f, method, bank_account_id }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('description') || 'Description'}</label>
              <textarea className="input min-h-[60px]" value={advanceForm.notes} onChange={e => setAdvanceForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('save')}</button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'loan' && (
        <Modal title={t('giveLoan') || 'Give Loan'} onClose={() => setModal(null)}>
          <form onSubmit={submitLoan} className="space-y-3">
            <div>
              <FormLabel required>{t('amount') || 'Amount'}</FormLabel>
              <input className="input" type="number" step="0.01" min="0.01" required value={loanForm.amount} onChange={e => setLoanForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <FormLabel>{t('date') || 'Date & Time (Optional)'}</FormLabel>
              <input className="input" type="datetime-local" value={loanForm.date || ''} onChange={e => setLoanForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <FormLabel required>{t('method') || 'Method'}</FormLabel>
              <PaymentAccountSelect
                includeBod={false}
                method={loanForm.method}
                bankAccountId={loanForm.bank_account_id}
                onChange={({ method, bank_account_id }) => setLoanForm(f => ({ ...f, method, bank_account_id }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('description') || 'Description'}</label>
              <textarea className="input min-h-[60px]" value={loanForm.notes} onChange={e => setLoanForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('save')}</button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'receivable' && (
        <Modal title={t('receiveLoanPayment') || 'Receive Loan Payment'} onClose={() => setModal(null)}>
          <form onSubmit={submitReceivable} className="space-y-3">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('receiveLoanPaymentHint') || 'Record cash/bank actually received from the employee against their outstanding loan(s).'}
            </p>
            <p className="font-bold" style={{ color: 'var(--text-primary)' }}>
              {t('receivable') || 'Receivable'}: {formatPKR(loanReceivable, lang)}
            </p>
            <div>
              <FormLabel required>{t('amount') || 'Amount'}</FormLabel>
              <input
                className="input" type="number" step="0.01" min="0.01" max={loanReceivable} required
                value={receivableForm.amount}
                onChange={e => setReceivableForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div>
              <FormLabel>{t('date') || 'Date & Time (Optional)'}</FormLabel>
              <input className="input" type="datetime-local" value={receivableForm.date || ''} onChange={e => setReceivableForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <FormLabel required>{t('method') || 'Method'}</FormLabel>
              <PaymentAccountSelect
                includeBod={false}
                method={receivableForm.method}
                bankAccountId={receivableForm.bank_account_id}
                onChange={({ method, bank_account_id }) => setReceivableForm(f => ({ ...f, method, bank_account_id }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('description') || 'Description'}</label>
              <textarea className="input min-h-[60px]" value={receivableForm.notes} onChange={e => setReceivableForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('save')}</button>
            </div>
          </form>
        </Modal>
      )}

      {terminateOpen && employee && (
        <TerminateEmployeeModal
          employee={employee}
          onClose={() => setTerminateOpen(false)}
          onDone={fetchData}
        />
      )}
    </div>
  );
}
