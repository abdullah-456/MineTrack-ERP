// Builds the step-by-step salary / settlement / loans / advances breakdown for
// the Employee Clearance Certificate.
//
// Computed ONCE here and consumed by both the on-screen/print page
// (EmployeeClearancePrint.jsx) and the downloaded PDF (employeeClearancePdf.js)
// — never re-derived independently in either, or the two could show different
// numbers for what's supposed to be the same certificate.
//
// The whole point: a reader should never have to do their own subtraction to
// understand where a total came from. "Total Salary Accrued" and "Total Salary
// Paid" differ — the gap is deductions, itemized here rather than left for the
// reader to infer (that gap was reported unexplained, and it isn't only
// deductions in general: it's specifically tax + attendance + advance
// deductions, each shown on its own line so a reader can see exactly which
// "cutting" produced the gap and how much of it).
export function buildClearanceWalkthrough(data) {
  const { summary = {}, payroll_history: rows = [] } = data || {};
  const sum = (pick) => Math.round(rows.reduce((s, r) => s + (parseFloat(pick(r)) || 0), 0) * 100) / 100;

  // ── Salary: itemized inputs on top, itemized deductions below, connected by
  // a net-via-payroll subtotal. Each figure here is summed straight off the
  // Payroll table's own per-run breakdown (never re-derived from a different
  // source), so this section's own arithmetic is guaranteed to close exactly:
  // gross - deductions = net, every time, because that is literally how each
  // month's payslip was computed in the first place.
  const basic = sum(r => r.basic_salary);
  const allowances = sum(r => r.allowances_total);
  const tempAllowance = sum(r => r.temp_allowance);
  const bonus = sum(r => r.bonus);
  const commission = sum(r => r.commission);
  const overtime = sum(r => r.overtime_amount);

  const taxDeduction = sum(r => r.tax_deduction);
  const attendanceDeduction = sum(r => r.attendance_deduction);
  const advanceDeduction = sum(r => r.advance_deduction);
  const totalDeductions = Math.round((taxDeduction + attendanceDeduction + advanceDeduction) * 100) / 100;

  const netPaidViaPayroll = sum(r => r.net_pay);

  // ── Settlement: whatever moved OUTSIDE the regular monthly payroll runs —
  // the one-off payout/collection at termination itself (see
  // employeeTermination.js). 'payment_made' is used for both a normal
  // month's payout AND the final settlement payment, and only their combined
  // sum is exposed (summary.total_paid) — so the settlement's own share is
  // the residual after subtracting what payroll already accounts for. Floored
  // at 0 so a rounding hair on an exact match never prints a stray negative.
  const settlementPayment = Math.max(0, Math.round(((summary.total_paid || 0) - netPaidViaPayroll) * 100) / 100);
  const recoveredFromEmployee = Math.round((summary.receivable_collected || 0) * 100) / 100;
  const totalPaidAllIn = Math.round((netPaidViaPayroll + settlementPayment) * 100) / 100;

  // ── Loans and advances: each its own closed Given → Recovered → Outstanding
  // loop, kept separate from salary because it's money OWED, not money EARNED.
  const loanGiven = Math.round((summary.loan_given || 0) * 100) / 100;
  const loanRepaid = Math.round((summary.loan_repaid || 0) * 100) / 100;
  const loanOutstanding = Math.round((summary.loan_receivable || 0) * 100) / 100;

  const advanceGiven = Math.round((summary.advance_given || 0) * 100) / 100;
  const advancePending = Math.round((summary.advance_pending || 0) * 100) / 100;
  // Not its own transaction type — "cleared" is simply what's no longer
  // pending, and advance_deduction above is the salary-deduction PORTION of
  // this same figure (an advance can also be cleared directly at settlement,
  // via applyCollectAdvance, which is why the two aren't always equal).
  const advanceCleared = Math.max(0, Math.round((advanceGiven - advancePending) * 100) / 100);

  return {
    salary: {
      basic, allowances, tempAllowance, bonus, commission, overtime,
      grossAccrued: Math.round((summary.total_salary_accrued || 0) * 100) / 100,
      taxDeduction, attendanceDeduction, advanceDeduction, totalDeductions,
      netPaidViaPayroll,
    },
    settlement: {
      hasActivity: settlementPayment > 0.005 || recoveredFromEmployee > 0.005,
      paymentToEmployee: settlementPayment,
      recoveredFromEmployee,
    },
    totalPaidAllIn,
    loans: { given: loanGiven, repaid: loanRepaid, outstanding: loanOutstanding },
    advances: { given: advanceGiven, cleared: advanceCleared, outstanding: advancePending },
  };
}
