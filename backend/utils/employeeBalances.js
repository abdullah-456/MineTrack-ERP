'use strict';

function round2(n) {
  return Math.round(parseFloat(n || 0) * 100) / 100;
}

function computeEmployeeBalances(employee, txns) {
  const totalSalaryAccrued = txns.filter(t => t.type === 'salary_due').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  const totalPaid = txns.filter(t => t.type === 'payment_made').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  const loanGiven = txns.filter(t => t.type === 'loan_given').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  const loanRepaid = txns.filter(t => t.type === 'loan_repayment').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  const loanReceivable = Math.max(0, round2(loanGiven - loanRepaid));
  const advanceGiven = txns.filter(t => t.type === 'advance_given').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  const advancePending = txns
    .filter(t => t.type === 'advance_given' && !t.cleared)
    .reduce((s, t) => s + parseFloat(t.amount || 0), 0);

  const currentPayable = parseFloat(employee.current_payable || 0);

  // current_payable is a single running figure that recordAdvance and recordLoan
  // also push negative — so an outstanding loan or advance shows up inside it as
  // well as in loan_receivable / advance_pending above, which are derived
  // independently from the transaction rows.
  //
  // Reading salary payable/receivable straight off current_payable therefore
  // reported the SAME debt twice under two different labels, and the termination
  // screen renders each as its own settlement box: one ₨1,000 loan appeared as
  // both "salary overpayment receivable" and "loan receivable", letting ₨2,000
  // be collected against a ₨1,000 debt.
  //
  // Adding the separately-tracked components back isolates the part of
  // current_payable that is genuinely about salary timing.
  const netSalaryPosition = round2(currentPayable + loanReceivable + advancePending);
  const salaryPayable = Math.max(0, netSalaryPosition);
  const salaryReceivable = Math.max(0, round2(-netSalaryPosition));

  return {
    total_salary_accrued: round2(totalSalaryAccrued),
    total_paid: round2(totalPaid),
    current_payable: currentPayable,
    loan_given: round2(loanGiven),
    loan_receivable: loanReceivable,
    advance_given: round2(advanceGiven),
    advance_pending: round2(advancePending),
    salary_payable: salaryPayable,
    salary_receivable: salaryReceivable,
    has_outstanding: salaryPayable > 0.01 || salaryReceivable > 0.01 || loanReceivable > 0.01 || advancePending > 0.01,
  };
}

module.exports = { computeEmployeeBalances, round2 };
