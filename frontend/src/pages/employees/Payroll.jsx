import { useState, useEffect, useCallback } from 'react';
import { Landmark, Loader2, Search, Printer, Download } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import StatusBadge from '../../components/ui/StatusBadge';
import PaymentAccountSelect from '../../components/ui/PaymentAccountSelect';
import api from '../../api/axios';
import { downloadEmployeeSlip } from '../../utils/employeeSlipPdf';
import { useHighlightRow } from '../../hooks/useHighlightRow';
import { getCompany } from '../../utils/reportExport';
import { SALARY_DAYS_PER_MONTH } from '../../utils/attendanceStatus';

export default function Payroll() {
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopName } = useAuth();
  const { shopParams } = useShopApi();
  const isRTL = lang === 'ur';
  const { isHighlighted } = useHighlightRow();
  const currentMonth = new Date().toISOString().slice(0, 7);

  // The shop's own wording for the absence deduction, if they've set one
  // (Company Profile settings) — falls back to the translated default.
  // Controls both the Give Salary checkbox and the breakdown line below.
  const [absenceDeductionLabel, setAbsenceDeductionLabel] = useState(t('deductForAbsences') || 'Deduct for absences');
  useEffect(() => {
    getCompany().then(c => {
      if (c.attendance_deduction_label) setAbsenceDeductionLabel(c.attendance_deduction_label);
    });
  }, []);

  const [employees, setEmployees] = useState([]);
  const [latestPayslips, setLatestPayslips] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const [modalEmp, setModalEmp] = useState(null); // employee row the modal is for
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [advanceForSelectedMonth, setAdvanceForSelectedMonth] = useState(0);
  const [salaryForm, setSalaryForm] = useState({
    month: currentMonth, bonus: '', temp_allowance: '', temp_allowance_label: '', tax_deduction_percent: '', method: 'cash', bank_account_id: null, date: '',
    deduct_for_absence: false, count_leave_as_absence: false, add_overtime: false,
    // 'none' | 'pay' | 'defer' — see the commission panel below for what each means.
    commission_action: 'none',
  });
  const [attendanceSummary, setAttendanceSummary] = useState(null);
  // Truck-loading commission available for this employee/month, from the same
  // backend function the actual payroll run uses — the checkbox below only
  // appears when there is something to add.
  const [commission, setCommission] = useState(null);
  const [paidMonths, setPaidMonths] = useState(new Set()); // months already given for modalEmp
  const [monthError, setMonthError] = useState(''); // only set right after an invalid pick attempt

  // Salary is always given month-by-month in order, so the month right after
  // the most recently paid one is both the native <input type="month">'s
  // `min` bound (greys out already-given months in the picker) and the
  // default selection — this mirrors EmployeeLedger's minAdvanceMonth pattern.
  const nextMonthStr = (m) => {
    const [y, mo] = m.split('-').map(Number);
    return new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
  };
  const formatMonthLabel = (m) => {
    const [y, mo] = m.split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK', { month: 'long', year: 'numeric' });
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, slipsRes] = await Promise.all([
        api.get('/employees', { params: { ...shopParams(), search } }),
        api.get('/employees/latest-payslips', { params: shopParams() }),
      ]);
      setEmployees((empRes.data.employees || []).filter(e => e.status === 'active'));
      setLatestPayslips(slipsRes.data.latest || {});
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, search, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchAttendanceSummary = useCallback(async (employeeId, month) => {
    try {
      const { data } = await api.get('/attendance/summary', { params: { ...shopParams(), employee_id: employeeId, month } });
      setAttendanceSummary(data);
    } catch {
      setAttendanceSummary(null);
    }
  }, [shopParams]);

  // A user without truck_loading:read gets a 403 here — treated as "no
  // commission to offer" rather than an error, so the modal still works for
  // roles that don't touch that module.
  const fetchCommission = useCallback(async (employeeId, month) => {
    try {
      const { data } = await api.get('/truck-loading/commission', { params: { ...shopParams(), employee_id: employeeId, month } });
      setCommission(data);
    } catch {
      setCommission(null);
    }
  }, [shopParams]);

  const openGiveSalary = async (emp) => {
    setModalEmp(emp);
    setCommission(null);
    setSalaryForm({
      month: currentMonth, bonus: '', temp_allowance: '', temp_allowance_label: '', tax_deduction_percent: '', method: 'cash', bank_account_id: null, date: '',
      deduct_for_absence: false, count_leave_as_absence: false, add_overtime: false,
    // 'none' | 'pay' | 'defer' — see the commission panel below for what each means.
    commission_action: 'none',
    });
    setPaidMonths(new Set());
    setMonthError('');
    setLedgerLoading(true);
    try {
      const { data } = await api.get(`/employees/${emp.id}/ledger`, { params: shopParams() });
      const paid = new Set((data.payroll_history || []).map(p => p.month));
      const latestPaid = data.payroll_history?.[0]?.month;
      const nextMonth = latestPaid ? nextMonthStr(latestPaid) : currentMonth;
      setPaidMonths(paid);
      setSalaryForm(f => ({ ...f, month: nextMonth }));
      const pending = (data.transaction_history || [])
        .filter(t2 => t2.type === 'advance_given' && !t2.cleared && t2.for_month === nextMonth)
        .reduce((s, t2) => s + parseFloat(t2.amount || 0), 0);
      setAdvanceForSelectedMonth(pending);
      fetchAttendanceSummary(emp.id, nextMonth);
      fetchCommission(emp.id, nextMonth);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
      setAdvanceForSelectedMonth(0);
    } finally {
      setLedgerLoading(false);
    }
  };

  const refreshAdvanceForMonth = useCallback(async (month) => {
    if (!modalEmp) return;
    setLedgerLoading(true);
    try {
      const { data } = await api.get(`/employees/${modalEmp.id}/ledger`, { params: shopParams() });
      const pending = (data.transaction_history || [])
        .filter(t2 => t2.type === 'advance_given' && !t2.cleared && t2.for_month === month)
        .reduce((s, t2) => s + parseFloat(t2.amount || 0), 0);
      setAdvanceForSelectedMonth(pending);
      fetchAttendanceSummary(modalEmp.id, month);
      fetchCommission(modalEmp.id, month);
    } catch {
      setAdvanceForSelectedMonth(0);
    } finally {
      setLedgerLoading(false);
    }
  }, [modalEmp, shopParams, fetchAttendanceSummary, fetchCommission]);

  // Blocks re-selecting a month whose salary was already given — the native
  // `min` bound on the input already greys these out for the common
  // sequential case, this is the explicit safety net + user-facing message.
  // The message only appears right after a blocked attempt (not persistently).
  const handleMonthChange = (value) => {
    if (paidMonths.has(value)) {
      setMonthError(`${t('salaryAlreadyGivenFor') || 'Salary for'} ${formatMonthLabel(value)} ${t('salaryAlreadyGivenSuffix') || 'is already given'}`);
      return;
    }
    setMonthError('');
    setSalaryForm(f => ({ ...f, month: value }));
    refreshAdvanceForMonth(value);
  };

  const handleDownloadSlip = async (employeeId, txnId) => {
    setDownloadingId(txnId);
    try {
      await downloadEmployeeSlip(employeeId, txnId, shopName, shopParams());
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setDownloadingId(null);
    }
  };

  // Base pay mirrors runGiveSalary: a daily-wage employee's is
  // rate × paid days from the attendance summary, a salaried employee's is
  // their fixed basic salary.
  const isDailyWage = modalEmp?.employment_type === 'daily_wage';
  const dailyWageRate = parseFloat(modalEmp?.daily_wage || 0);
  const wageDaysPaid = attendanceSummary?.paid_days || 0;
  const basicSalary = isDailyWage
    ? Math.round(wageDaysPaid * dailyWageRate * 100) / 100
    : parseFloat(modalEmp?.basic_salary || 0);
  const allowancesTotal = (modalEmp?.allowances || []).reduce((s, a) => s + (parseFloat(a?.amount) || 0), 0);
  const bonusVal = parseFloat(salaryForm.bonus) || 0;
  const tempAllowanceVal = parseFloat(salaryForm.temp_allowance) || 0;
  // Total is CURRENT month's fresh commission plus anything postponed from an
  // earlier month and still unpaid — see utils/commissionHelpers.js on the
  // backend. Only actually added to gross pay when the user picks "pay now";
  // "defer" and "none" both leave commissionVal at 0 for this run.
  const commissionAvailable = parseFloat(commission?.total_amount || 0);
  const commissionVal = salaryForm.commission_action === 'pay' ? commissionAvailable : 0;
  // Mirrors deduct_for_absence exactly, but adds instead of subtracts — see
  // runGiveSalary's add_overtime flag.
  const overtimeHoursVal = attendanceSummary?.overtime_hours || 0;
  const overtimeRateVal = parseFloat(modalEmp?.overtime_rate || 0);
  const overtimeAmountVal = salaryForm.add_overtime
    ? Math.round(overtimeHoursVal * overtimeRateVal * 100) / 100
    : 0;
  const grossSalary = basicSalary + allowancesTotal + tempAllowanceVal + bonusVal + overtimeAmountVal + commissionVal;
  const taxPercentVal = Math.min(100, Math.max(0, parseFloat(salaryForm.tax_deduction_percent) || 0));
  const taxDeductionVal = Math.round((grossSalary * taxPercentVal / 100) * 100) / 100;

  // Mirrors employeeLedgerController.runGiveSalary exactly — a FIXED 26-day
  // divisor (SALARY_DAYS_PER_MONTH), not the real length of the selected month
  // — so this preview never disagrees with what actually gets saved. Skipped
  // for daily-wage employees there too: their base pay already excludes
  // unworked days, so deducting again would penalize the same day twice.
  const absentDaysVal = attendanceSummary?.absent_days || 0;
  const leaveDaysVal = attendanceSummary?.leave_days || 0;
  const deductDaysVal = absentDaysVal + (salaryForm.count_leave_as_absence ? leaveDaysVal : 0);
  const attendanceDeductionVal = salaryForm.deduct_for_absence && !isDailyWage
    ? Math.round((basicSalary / SALARY_DAYS_PER_MONTH) * deductDaysVal * 100) / 100
    : 0;

  const netPayPreview = Math.round((grossSalary - taxDeductionVal - advanceForSelectedMonth - attendanceDeductionVal) * 100) / 100;

  const submitSalary = async (e) => {
    e.preventDefault();
    if (paidMonths.has(salaryForm.month)) {
      error(`${t('salaryAlreadyGivenFor') || 'Salary for'} ${formatMonthLabel(salaryForm.month)} ${t('salaryAlreadyGivenSuffix') || 'is already given'}`);
      return;
    }
    setSaving(true);
    // Open the tab synchronously (still inside the click gesture) so the
    // payslip can auto-print — opening it after the await gets silently
    // blocked as a non-user-initiated popup. Must NOT pass noopener/noreferrer
    // here: both make window.open() return null, which would silently break
    // this open-now-navigate-later pattern (nothing would ever print).
    const slipTab = window.open('', '_blank');
    try {
      const { data } = await api.post(`/employees/${modalEmp.id}/give-salary`, {
        month: salaryForm.month,
        bonus: bonusVal,
        temp_allowance: tempAllowanceVal,
        temp_allowance_label: salaryForm.temp_allowance_label,
        tax_deduction_percent: taxPercentVal,
        method: salaryForm.method,
        bank_account_id: salaryForm.bank_account_id,
        date: salaryForm.date || undefined,
        deduct_for_absence: salaryForm.deduct_for_absence,
        count_leave_as_absence: salaryForm.count_leave_as_absence,
        add_overtime: salaryForm.add_overtime,
        commission_action: salaryForm.commission_action,
        ...shopParams(),
      });
      success(t('salaryGiven') || 'Salary given successfully');
      if (data.transaction_id && slipTab) {
        slipTab.location.href = `/employees/${modalEmp.id}/slip/${data.transaction_id}?auto_print=1`;
      } else if (slipTab) {
        slipTab.close();
      }
      setModalEmp(null);
      fetchData();
    } catch (err) {
      if (slipTab) slipTab.close();
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Landmark}
        accent="cyan"
        title={t('payroll') || 'Payroll'}
        subtitle={t('payrollSub') || 'Give each employee their salary for the month'}
        action={
          <ReportActions
            title={t('payroll') || 'Payroll'}
            columns={[
              { header: t('name') || 'Name', key: 'name', width: 1.6 },
              { header: t('designation') || 'Designation', render: e => e.designation || '', width: 1.3 },
              { header: t('payType') || 'Pay Type', render: e => (e.employment_type === 'daily_wage' ? (t('dailyWage') || 'Daily Wage') : (t('salary') || 'Salary')), width: 1 },
              {
                header: t('salaryOrWage') || 'Salary / Wage',
                key: 'pay_amount',
                money: true,
                width: 1.2,
                render: e => (e.employment_type === 'daily_wage' ? e.daily_wage : e.basic_salary),
              },
              { header: t('currentPayable') || 'Current Payable', key: 'current_payable', money: true, width: 1.3 },
              { header: t('status') || 'Status', key: 'status', width: 0.9 },
            ]}
            rows={employees}
            totals={{
              __label: t('total') || 'Total',
              pay_amount: employees.reduce((s, e) => s + parseFloat(
                (e.employment_type === 'daily_wage' ? e.daily_wage : e.basic_salary) || 0,
              ), 0),
              current_payable: employees.reduce((s, e) => s + parseFloat(e.current_payable || 0), 0),
            }}
            filename="payroll-report.pdf"
          />
        }
      />

      <div className="glass-card p-4">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingInlineStart: '2.5rem' }} placeholder={t('searchEmployees')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('name')}</th>
                <th className="text-start p-4">{t('designation')}</th>
                <th className="text-start p-4">{t('salaryOrWage') || 'Salary / Wage'}</th>
                <th className="text-start p-4">{t('currentPayable') || 'Current Payable'}</th>
                <th className="text-start p-4">{t('status')}</th>
                <th className="text-end p-4">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {employees
                .filter(emp => !search.trim() || [
                  emp.name, emp.designation, emp.phone, emp.status,
                  String(emp.basic_salary), String(emp.current_payable)
                ].some(v => (v || '').toLowerCase().includes(search.trim().toLowerCase())))
                .map(emp => (
                <tr
                  key={emp.id}
                  id={`row-${emp.id}`}
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  className={`${isHighlighted(emp.id) || isHighlighted(latestPayslips[emp.id]?.id) ? 'highlight-row' : 'hover:bg-white/5'} cursor-pointer transition-colors`}
                  onClick={(e) => {
                    if (e.target.closest('button')) return;
                    if (latestPayslips[emp.id]) {
                      window.open(`/employees/${emp.id}/slip/${latestPayslips[emp.id].transaction_id}?auto_print=1`, '_blank');
                    } else {
                      openGiveSalary(emp);
                    }
                  }}
                >
                  <td className="p-4">
                    <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{emp.name}</div>
                    {emp.phone && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{emp.phone}</div>}
                  </td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{emp.designation || '—'}</td>
                  <td className="p-4 font-semibold text-cyan-400">
                    {emp.employment_type === 'daily_wage' ? (
                      <>
                        {formatPKR(emp.daily_wage, lang)}
                        <div className="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>{t('perDay') || 'per day'}</div>
                      </>
                    ) : formatPKR(emp.basic_salary, lang)}
                  </td>
                  <td className="p-4 font-semibold" style={{ color: parseFloat(emp.current_payable) < 0 ? '#f87171' : 'var(--text-secondary)' }}>
                    {formatPKR(emp.current_payable, lang)}
                  </td>
                  <td className="p-4"><StatusBadge status={emp.status} /></td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-1.5">
                      {latestPayslips[emp.id] && (
                        <>
                          <button
                            type="button"
                            title={t('printStatement') || 'Print'}
                            onClick={() => window.open(`/employees/${emp.id}/slip/${latestPayslips[emp.id].transaction_id}?auto_print=1`, '_blank')}
                            className="icon-btn"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            title={t('download') || 'Download'}
                            disabled={downloadingId === latestPayslips[emp.id].transaction_id}
                            onClick={() => handleDownloadSlip(emp.id, latestPayslips[emp.id].transaction_id)}
                            className="icon-btn"
                          >
                            {downloadingId === latestPayslips[emp.id].transaction_id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Download className="w-4 h-4" />}
                          </button>
                        </>
                      )}
                      <button type="button" onClick={() => openGiveSalary(emp)} className="btn-primary flex items-center gap-2 text-sm">
                        <Landmark className="w-3.5 h-3.5" />{t('giveSalary') || 'Give Salary'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noEmployees')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalEmp && (
        <Modal title={`${t('giveSalary') || 'Give Salary'} — ${modalEmp.name}`} onClose={() => setModalEmp(null)}>
          <form onSubmit={submitSalary} className="space-y-3">
            <div>
              <FormLabel required>{t('month') || 'Month'}</FormLabel>
              <input
                className="input" type="month" required value={salaryForm.month}
                onChange={e => handleMonthChange(e.target.value)}
              />
              {monthError && (
                <p className="text-xs text-amber-400 mt-1">{monthError}</p>
              )}
            </div>
            <div>
              <FormLabel>{t('paymentDateTime') || 'Payment Date & Time (Optional)'}</FormLabel>
              <input
                className="input" type="datetime-local" value={salaryForm.date || ''}
                onChange={e => setSalaryForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FormLabel>{t('bonus') || 'Bonus'}</FormLabel>
                <input className="input" type="number" step="0.01" min="0" value={salaryForm.bonus} onChange={e => setSalaryForm(f => ({ ...f, bonus: e.target.value }))} />
              </div>
              <div>
                <FormLabel>{t('tempAllowance') || 'Temporary Allowance'}</FormLabel>
                <input className="input" type="number" step="0.01" min="0" value={salaryForm.temp_allowance} onChange={e => setSalaryForm(f => ({ ...f, temp_allowance: e.target.value }))} />
              </div>
            </div>
            {/* Optional name for THIS run's temp allowance. Only offered once
                there's an amount to name — the fixed "Temporary Allowance"
                heading stays everywhere, this just appears beside it. */}
            {tempAllowanceVal > 0 && (
              <div>
                <FormLabel>{t('tempAllowanceLabel') || 'Temporary Allowance Label (Optional)'}</FormLabel>
                <input
                  className="input" type="text" maxLength={60}
                  placeholder={t('tempAllowanceLabelHint') || 'e.g. Eid Bonus, Travel Reimbursement'}
                  value={salaryForm.temp_allowance_label}
                  onChange={e => setSalaryForm(f => ({ ...f, temp_allowance_label: e.target.value }))}
                />
              </div>
            )}
            <div>
              <FormLabel>{t('taxDeductionPercent') || 'Tax Deduction %'}</FormLabel>
              <div className="relative">
                <input
                  className="input pr-8" type="number" step="0.01" min="0" max="100"
                  value={salaryForm.tax_deduction_percent}
                  onChange={e => setSalaryForm(f => ({ ...f, tax_deduction_percent: e.target.value }))}
                />
                <span className="absolute top-1/2 -translate-y-1/2 text-sm" style={{ [isRTL ? 'left' : 'right']: '12px', color: 'var(--text-muted)' }}>%</span>
              </div>
            </div>
            <div>
              <FormLabel required>{t('method') || 'Method'}</FormLabel>
              <PaymentAccountSelect
                includeBod={false}
                required
                method={salaryForm.method}
                bankAccountId={salaryForm.bank_account_id}
                onChange={({ method, bank_account_id }) => setSalaryForm(f => ({ ...f, method, bank_account_id }))}
              />
            </div>

            {attendanceSummary && (attendanceSummary.marked_days > 0) && (
              <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {attendanceSummary.present_days} {t('present') || 'present'} · {attendanceSummary.absent_days} {t('absent') || 'absent'} · {attendanceSummary.leave_days} {t('leave') || 'leave'}
                  {' · '}{attendanceSummary.half_day_days || 0} {t('halfDay') || 'half day'} · {attendanceSummary.short_leave_days || 0} {t('shortLeave') || 'short leave'}
                  {' '}({formatMonthLabel(salaryForm.month)})
                </p>
                {/* The absence deduction doesn't apply to daily-wage employees:
                    their base pay above is already only the days they worked. */}
                {isDailyWage ? (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t('wageNoAbsenceDeduction') || 'Wage pay already excludes unworked days — no absence deduction applies.'}
                  </p>
                ) : (
                  <>
                    <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                      <input
                        type="checkbox"
                        checked={salaryForm.deduct_for_absence}
                        onChange={e => setSalaryForm(f => ({ ...f, deduct_for_absence: e.target.checked }))}
                      />
                      {absenceDeductionLabel}
                    </label>
                    {salaryForm.deduct_for_absence && (
                      <label className="flex items-center gap-2 text-sm ps-6 cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                        <input
                          type="checkbox"
                          checked={salaryForm.count_leave_as_absence}
                          onChange={e => setSalaryForm(f => ({ ...f, count_leave_as_absence: e.target.checked }))}
                        />
                        {t('countLeaveAsAbsence') || 'Also deduct for leave days'}
                      </label>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Only shown when there is actually something to add this month. */}
            {commissionAvailable > 0 && (
              <div className="rounded-lg p-3 space-y-2.5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                {/* This month's fresh figure and anything postponed from an
                    earlier month are itemized separately here, then offered
                    as ONE combined total — the whole point of postponing is
                    that it isn't forgotten, so both must be visible together
                    the moment there's a decision to make about either. */}
                <div className="space-y-1 text-sm">
                  {commission?.current?.amount > 0 && (
                    <div className="flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                      <span>{t('commissionThisMonth') || 'This month'}</span>
                      <span>{formatPKR(commission.current.amount, lang)}</span>
                    </div>
                  )}
                  {(commission?.carried || []).map(c => (
                    <div key={c.month} className="flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                      <span>{(t('commissionCarried') || 'Carried from {month}').replace('{month}', formatMonthLabel(c.month))}</span>
                      <span>{formatPKR(c.amount, lang)}</span>
                    </div>
                  ))}
                  {/* Only worth a separate "Total" line when there's more than
                      one figure being combined — with nothing carried, "This
                      month" already IS the total. */}
                  {commission?.carried?.length > 0 && (
                    <div className="flex justify-between font-semibold pt-1" style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
                      <span>{t('commissionTotalAvailable') || 'Total commission available'}</span>
                      <span>{formatPKR(commissionAvailable, lang)}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                    <input
                      type="radio"
                      name="commission_action"
                      checked={salaryForm.commission_action === 'pay'}
                      onChange={() => setSalaryForm(f => ({ ...f, commission_action: 'pay' }))}
                    />
                    {t('payCommissionNow') || 'Pay commission now'} — {formatPKR(commissionAvailable, lang)}
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                    <input
                      type="radio"
                      name="commission_action"
                      checked={salaryForm.commission_action === 'defer'}
                      onChange={() => setSalaryForm(f => ({ ...f, commission_action: 'defer' }))}
                    />
                    {t('deferCommission') || 'Postpone to next payroll'}
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                    <input
                      type="radio"
                      name="commission_action"
                      checked={salaryForm.commission_action === 'none'}
                      onChange={() => setSalaryForm(f => ({ ...f, commission_action: 'none' }))}
                    />
                    {t('dontIncludeCommission') || "Don't include this run"}
                  </label>
                </div>

                {salaryForm.commission_action === 'defer' && (
                  <p className="text-xs ps-6" style={{ color: 'var(--text-muted)' }}>
                    {t('commissionDeferredHint') || 'Not paid this run — carried forward and combined with next month\'s commission, whenever it\'s paid.'}
                  </p>
                )}
                {salaryForm.commission_action === 'pay' && commission?.current?.note && (
                  <p className="text-xs ps-6" style={{ color: 'var(--text-muted)' }}>{commission.current.note}</p>
                )}
              </div>
            )}

            {overtimeHoursVal > 0 && (
              <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {overtimeHoursVal} {t('overtimeHours') || 'overtime hours'} ({formatMonthLabel(salaryForm.month)})
                  {!overtimeRateVal && (
                    <span className="text-amber-400"> — {t('noOvertimeRate') || 'no overtime rate set for this employee'}</span>
                  )}
                </p>
                <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                  <input
                    type="checkbox"
                    disabled={!overtimeRateVal}
                    checked={salaryForm.add_overtime}
                    onChange={e => setSalaryForm(f => ({ ...f, add_overtime: e.target.checked }))}
                  />
                  {t('addOvertimePay') || 'Add overtime pay'}
                </label>
              </div>
            )}

            <div className="rounded-lg p-3 space-y-1 text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              {ledgerLoading ? (
                <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-cyan-400" /></div>
              ) : (
                <>
                  <div className="flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                    <span>
                      {isDailyWage
                        ? `${t('wagePay') || 'Wage Pay'} (${wageDaysPaid} ${t('daysShort') || 'd'} × ${formatPKR(dailyWageRate, lang)})`
                        : (t('basicSalary') || 'Basic Salary')}
                    </span>
                    <span>{formatPKR(basicSalary, lang)}</span>
                  </div>
                  {allowancesTotal > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>+ {t('allowances') || 'Allowances'}</span><span>+{formatPKR(allowancesTotal, lang)}</span>
                    </div>
                  )}
                  {tempAllowanceVal > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>
                        + {t('tempAllowance') || 'Temporary Allowance'}
                        {salaryForm.temp_allowance_label.trim() && ` (${salaryForm.temp_allowance_label.trim()})`}
                      </span>
                      <span>+{formatPKR(tempAllowanceVal, lang)}</span>
                    </div>
                  )}
                  {bonusVal > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>+ {t('bonus') || 'Bonus'}</span><span>+{formatPKR(bonusVal, lang)}</span>
                    </div>
                  )}
                  {overtimeAmountVal > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>+ {t('overtimeRate') || 'Overtime'} ({overtimeHoursVal}h)</span><span>+{formatPKR(overtimeAmountVal, lang)}</span>
                    </div>
                  )}
                  {commissionVal > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>+ {t('commission') || 'Commission'}</span><span>+{formatPKR(commissionVal, lang)}</span>
                    </div>
                  )}
                  {taxDeductionVal > 0 && (
                    <div className="flex justify-between text-red-400">
                      <span>- {t('taxDeductions') || 'Tax Deductions'} ({taxPercentVal}%)</span><span>-{formatPKR(taxDeductionVal, lang)}</span>
                    </div>
                  )}
                  {advanceForSelectedMonth > 0 && (
                    <div className="flex justify-between text-red-400">
                      <span>- {t('advanceDeduction') || 'Advance Deduction'}</span><span>-{formatPKR(advanceForSelectedMonth, lang)}</span>
                    </div>
                  )}
                  {attendanceDeductionVal > 0 && (
                    <div className="flex justify-between text-red-400">
                      <span>- {absenceDeductionLabel} ({deductDaysVal}d)</span><span>-{formatPKR(attendanceDeductionVal, lang)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold pt-1" style={{ borderTop: '1px solid var(--border-subtle)', color: netPayPreview < 0 ? 'rgb(239,68,68)' : 'var(--text-primary)' }}>
                    <span>{t('netPay') || 'Net Pay'}</span><span>{formatPKR(netPayPreview, lang)}</span>
                  </div>
                  {netPayPreview < 0 && (
                    <p className="text-xs text-red-400">{t('salaryExceededHint') || "Deductions and advances exceed this month's salary."}</p>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalEmp(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving || ledgerLoading || netPayPreview < 0} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('save')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
