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
  const salaryPayable = Math.max(0, round2(currentPayable));
  const salaryReceivable = Math.max(0, round2(-currentPayable));

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
