const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { assertCashAvailable, debitBankAccount, creditBankAccount, bankAccountCode } = require('../utils/cashHelpers');
const { postVoucher } = require('../utils/postVoucher');
const { resolveListDateRange, sliceHistoryToRange, openingBalanceRow } = require('../utils/fiscalYear');
const { getAttendanceSummaryForMonth, getOvertimeSummaryForMonth } = require('./attendanceController');
const { getCommissionSituation, deferCommission, resolveCommissionPaid } = require('../utils/commissionHelpers');
const { SALARY_DAYS_PER_MONTH } = require('../utils/attendanceStatus');

// Cap for the optional free-text name on a one-off temp allowance ("Eid Bonus").
// Trimmed and truncated here regardless of what the client sends — the column
// is STRING(60) and an over-long value would be a database error, not a
// validation message.
const TEMP_ALLOWANCE_LABEL_MAX = 60;
const TEMP_DEDUCTION_LABEL_MAX = 60;

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

// ── POST /employees/:id/advances ─────────────────────────────────────────────
// An advance is always against a specific FUTURE (or current) salary month —
// it auto-clears as a deduction the moment Give Salary is run for that month
// (see giveSalary below). No separate collection action needed for it.
exports.recordAdvance = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const employee = await db.Employee.findOne({
      where: { id: req.params.id, shop_id: shopId },
      transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!employee) { await transaction.rollback(); return res.status(404).json({ message: 'Employee not found' }); }
    // A new advance given here is only ever recovered automatically by
    // runGiveSalary auto-clearing it against a future month's salary — and
    // that path is itself blocked for a terminated employee (see runGiveSalary
    // above). Left open, this would create debt with no ordinary way to
    // collect it back except the one-off termination settlement screen, which
    // is where new money to/from a terminated employee belongs in the first
    // place — not a fresh advance.
    if (employee.status === 'terminated') {
      await transaction.rollback();
      return res.status(400).json({
        message: `${employee.name} was terminated and cannot be given a new advance. Use the clearance certificate for a final settlement instead.`,
      });
    }

    const { amount, method, bank_account_id, notes, for_month, date } = req.body;
    const amt = parseFloat(amount);
    if (!(amt > 0)) { await transaction.rollback(); return res.status(400).json({ message: 'amount must be greater than 0' }); }
    if (!['cash', 'bank'].includes(method)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'method must be cash or bank' });
    }
    if (!for_month || !/^\d{4}-\d{2}$/.test(for_month)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'for_month is required in YYYY-MM format' });
    }
    const alreadyPaid = await db.Payroll.findOne({ where: { employee_id: employee.id, month: for_month }, transaction });
    if (alreadyPaid) {
      await transaction.rollback();
      return res.status(400).json({ message: `Salary for ${for_month} has already been given — pick a later month` });
    }

    let bankAcc = null;
    if (method === 'cash') await assertCashAvailable(shopId, amt, transaction);
    else bankAcc = await debitBankAccount(shopId, amt, transaction, bank_account_id);

    await employee.update({
      current_payable: Math.round((parseFloat(employee.current_payable || 0) - amt) * 100) / 100,
    }, { transaction });

    const txnDate = date ? new Date(date) : new Date();

    const txn = await db.EmployeeTransaction.create({
      shop_id: shopId, employee_id: employee.id, date: txnDate, type: 'advance_given',
      amount: amt, method, for_month, cleared: false, notes: notes?.trim() || null, created_by: req.user.id,
    }, { transaction });

    await postVoucher(shopId, {
      type: 'payment',
      date: txnDate,
      narration: `Salary advance paid to employee ${employee.name} for month ${for_month}${notes?.trim() ? ' — Note: ' + notes.trim() : ''}`,
      createdBy: req.user.id,
      lines: [
        { accountCode: '05-EMPADVLOAN', debit: amt },
        { accountCode: method === 'bank' ? bankAccountCode(bankAcc) : '05-CASH', credit: amt },
      ],
    }, transaction);

    await transaction.commit();
    const fresh = await db.Employee.findByPk(employee.id);
    return res.status(201).json({ transaction: txn, transaction_id: txn.id, employee: fresh });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('recordAdvance error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── POST /employees/:id/loans ────────────────────────────────────────────────
// A plain lump-sum amount — no installment schedule. Recovered only through
// the standalone Receive Loan Payment action (see receiveLoanPayment below).
exports.recordLoan = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const employee = await db.Employee.findOne({
      where: { id: req.params.id, shop_id: shopId },
      transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!employee) { await transaction.rollback(); return res.status(404).json({ message: 'Employee not found' }); }
    // Same reasoning as recordAdvance above: issuing a brand-new loan to
    // someone who no longer works here isn't a routine ledger action. Money
    // to/from a terminated employee belongs on the termination settlement
    // screen, not a fresh grant here.
    if (employee.status === 'terminated') {
      await transaction.rollback();
      return res.status(400).json({
        message: `${employee.name} was terminated and cannot be given a new loan. Use the clearance certificate for a final settlement instead.`,
      });
    }

    const { amount, method, bank_account_id, notes, date } = req.body;
    const amt = parseFloat(amount);
    if (!(amt > 0)) { await transaction.rollback(); return res.status(400).json({ message: 'amount must be greater than 0' }); }
    if (!['cash', 'bank'].includes(method)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'method must be cash or bank' });
    }

    let bankAcc = null;
    if (method === 'cash') await assertCashAvailable(shopId, amt, transaction);
    else bankAcc = await debitBankAccount(shopId, amt, transaction, bank_account_id);

    await employee.update({
      current_payable: Math.round((parseFloat(employee.current_payable || 0) - amt) * 100) / 100,
    }, { transaction });

    const txnDate = date ? new Date(date) : new Date();

    const txn = await db.EmployeeTransaction.create({
      shop_id: shopId, employee_id: employee.id, date: txnDate, type: 'loan_given',
      amount: amt, method, notes: notes?.trim() || null, created_by: req.user.id,
    }, { transaction });

    await postVoucher(shopId, {
      type: 'payment',
      date: txnDate,
      narration: `Loan given to employee ${employee.name}${notes?.trim() ? ' — Note: ' + notes.trim() : ''}`,
      createdBy: req.user.id,
      lines: [
        { accountCode: '05-EMPADVLOAN', debit: amt },
        { accountCode: method === 'bank' ? bankAccountCode(bankAcc) : '05-CASH', credit: amt },
      ],
    }, transaction);

    await transaction.commit();
    const fresh = await db.Employee.findByPk(employee.id);
    return res.status(201).json({ transaction: txn, transaction_id: txn.id, employee: fresh });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('recordLoan error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── POST /employees/:id/receive-loan-payment ─────────────────────────────────
// Standalone collection against outstanding LOANS ONLY (advances clear
// automatically via giveSalary, never here). Amount can never exceed what's
// actually outstanding on loans given.
exports.receiveLoanPayment = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const employee = await db.Employee.findOne({
      where: { id: req.params.id, shop_id: shopId },
      transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!employee) { await transaction.rollback(); return res.status(404).json({ message: 'Employee not found' }); }

    const { amount, method, bank_account_id, notes, date } = req.body;
    const amt = parseFloat(amount);
    if (!(amt > 0)) { await transaction.rollback(); return res.status(400).json({ message: 'amount must be greater than 0' }); }
    if (!['cash', 'bank'].includes(method)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'method must be cash or bank' });
    }

    const loanTotals = await db.EmployeeTransaction.findAll({
      where: { employee_id: employee.id, type: { [Op.in]: ['loan_given', 'loan_repayment'] } },
      attributes: ['type', [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total']],
      group: ['type'],
      raw: true,
      transaction,
    });
    const givenTotal = parseFloat(loanTotals.find(r => r.type === 'loan_given')?.total || 0);
    const repaidTotal = parseFloat(loanTotals.find(r => r.type === 'loan_repayment')?.total || 0);
    const loanReceivable = Math.max(0, Math.round((givenTotal - repaidTotal) * 100) / 100);

    if (!(loanReceivable > 0)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'This employee has no outstanding loan balance to collect' });
    }
    if (amt > loanReceivable) {
      await transaction.rollback();
      return res.status(400).json({ message: `Amount cannot exceed the outstanding loan balance (${loanReceivable.toFixed(2)})` });
    }

    let bankAcc = null;
    if (method === 'bank') bankAcc = await creditBankAccount(shopId, amt, transaction, bank_account_id);
    // Cash coming in needs no floor guard.

    await employee.update({
      current_payable: Math.round((parseFloat(employee.current_payable || 0) + amt) * 100) / 100,
    }, { transaction });

    const txnDate = date ? new Date(date) : new Date();

    const txn = await db.EmployeeTransaction.create({
      shop_id: shopId, employee_id: employee.id, date: txnDate, type: 'loan_repayment',
      amount: amt, method, notes: notes?.trim() || null, created_by: req.user.id,
    }, { transaction });

    await postVoucher(shopId, {
      type: 'receipt',
      date: txnDate,
      narration: `Loan payment received from employee ${employee.name}${notes?.trim() ? ' — Note: ' + notes.trim() : ''}`,
      createdBy: req.user.id,
      lines: [
        { accountCode: method === 'bank' ? bankAccountCode(bankAcc) : '05-CASH', debit: amt },
        { accountCode: '05-EMPADVLOAN', credit: amt },
      ],
    }, transaction);

    await transaction.commit();
    const fresh = await db.Employee.findByPk(employee.id);
    return res.status(201).json({ transaction: txn, transaction_id: txn.id, employee: fresh });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('receiveLoanPayment error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── POST /employees/:id/receive-advance-payment ──────────────────────────────
// Standalone collection against outstanding UNCLEARED ADVANCES.
// Clears uncleared advance rows in FIFO order.
exports.receiveAdvancePayment = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const employee = await db.Employee.findOne({
      where: { id: req.params.id, shop_id: shopId },
      transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!employee) { await transaction.rollback(); return res.status(404).json({ message: 'Employee not found' }); }

    const { amount, method, bank_account_id, notes, date } = req.body;
    const amt = parseFloat(amount);
    if (!(amt > 0)) { await transaction.rollback(); return res.status(400).json({ message: 'amount must be greater than 0' }); }
    if (!['cash', 'bank'].includes(method)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'method must be cash or bank' });
    }

    const unclearedAdvances = await db.EmployeeTransaction.findAll({
      where: { employee_id: employee.id, type: 'advance_given', cleared: false },
      order: [['date', 'ASC'], ['id', 'ASC']],
      transaction, lock: transaction.LOCK.UPDATE,
    });
    const advancePending = Math.round(unclearedAdvances.reduce((s, a) => s + parseFloat(a.amount || 0), 0) * 100) / 100;

    if (!(advancePending > 0)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'This employee has no outstanding advance balance to collect' });
    }
    if (amt > advancePending) {
      await transaction.rollback();
      return res.status(400).json({ message: `Amount cannot exceed the pending advance balance (${advancePending.toFixed(2)})` });
    }

    let bankAcc = null;
    if (method === 'bank') bankAcc = await creditBankAccount(shopId, amt, transaction, bank_account_id);

    let remaining = amt;
    for (const adv of unclearedAdvances) {
      if (remaining <= 0) break;
      const advAmt = parseFloat(adv.amount || 0);
      if (remaining >= advAmt) {
        await adv.update({ cleared: true }, { transaction });
        remaining = Math.round((remaining - advAmt) * 100) / 100;
      } else {
        const leftover = Math.round((advAmt - remaining) * 100) / 100;
        await adv.update({ amount: remaining, cleared: true }, { transaction });
        await db.EmployeeTransaction.create({
          shop_id: shopId,
          employee_id: employee.id,
          date: adv.date,
          type: 'advance_given',
          amount: leftover,
          method: adv.method,
          for_month: adv.for_month,
          cleared: false,
          notes: adv.notes ? `${adv.notes} (remaining balance)` : `Remaining advance for ${adv.for_month || 'salary'}`,
          created_by: req.user.id,
        }, { transaction });
        remaining = 0;
      }
    }

    await employee.update({
      current_payable: Math.round((parseFloat(employee.current_payable || 0) + amt) * 100) / 100,
    }, { transaction });

    const txnDate = date ? new Date(date) : new Date();

    const txn = await db.EmployeeTransaction.create({
      shop_id: shopId, employee_id: employee.id, date: txnDate, type: 'receivable_collected',
      amount: amt, method, notes: notes?.trim() || 'Advance payment received', created_by: req.user.id,
    }, { transaction });

    await postVoucher(shopId, {
      type: 'receipt',
      date: txnDate,
      narration: `Advance payment received from employee ${employee.name}${notes?.trim() ? ' — Note: ' + notes.trim() : ''}`,
      createdBy: req.user.id,
      lines: [
        { accountCode: method === 'bank' ? bankAccountCode(bankAcc) : '05-CASH', debit: amt },
        { accountCode: '05-EMPADVLOAN', credit: amt },
      ],
    }, transaction);

    await transaction.commit();
    const fresh = await db.Employee.findByPk(employee.id);
    return res.status(201).json({ transaction: txn, transaction_id: txn.id, employee: fresh });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('receiveAdvancePayment error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── POST /employees/:id/receive-overpayment ──────────────────────────────────
// Standalone collection against outstanding SALARY OVERPAYMENT / RECEIVABLE.
exports.receiveOverpayment = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const employee = await db.Employee.findOne({
      where: { id: req.params.id, shop_id: shopId },
      transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!employee) { await transaction.rollback(); return res.status(404).json({ message: 'Employee not found' }); }

    const { amount, method, bank_account_id, notes, date } = req.body;
    const amt = parseFloat(amount);
    if (!(amt > 0)) { await transaction.rollback(); return res.status(400).json({ message: 'amount must be greater than 0' }); }
    if (!['cash', 'bank'].includes(method)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'method must be cash or bank' });
    }

    const loanTotals = await db.EmployeeTransaction.findAll({
      where: { employee_id: employee.id, type: { [Op.in]: ['loan_given', 'loan_repayment'] } },
      attributes: ['type', [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total']],
      group: ['type'],
      raw: true,
      transaction,
    });
    const givenTotal = parseFloat(loanTotals.find(r => r.type === 'loan_given')?.total || 0);
    const repaidTotal = parseFloat(loanTotals.find(r => r.type === 'loan_repayment')?.total || 0);
    const loanReceivable = Math.max(0, Math.round((givenTotal - repaidTotal) * 100) / 100);

    const unclearedAdvances = await db.EmployeeTransaction.findAll({
      where: { employee_id: employee.id, type: 'advance_given', cleared: false },
      transaction,
    });
    const advancePending = Math.round(unclearedAdvances.reduce((s, a) => s + parseFloat(a.amount || 0), 0) * 100) / 100;

    const currentPayable = parseFloat(employee.current_payable || 0);
    const netSalaryPosition = Math.round((currentPayable + loanReceivable + advancePending) * 100) / 100;
    const salaryReceivable = Math.max(0, Math.round(-netSalaryPosition * 100) / 100);

    if (!(salaryReceivable > 0)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'This employee has no outstanding salary overpayment balance to collect' });
    }
    if (amt > salaryReceivable) {
      await transaction.rollback();
      return res.status(400).json({ message: `Amount cannot exceed the receivable balance (${salaryReceivable.toFixed(2)})` });
    }

    let bankAcc = null;
    if (method === 'bank') bankAcc = await creditBankAccount(shopId, amt, transaction, bank_account_id);

    await employee.update({
      current_payable: Math.round((parseFloat(employee.current_payable || 0) + amt) * 100) / 100,
    }, { transaction });

    const txnDate = date ? new Date(date) : new Date();

    const txn = await db.EmployeeTransaction.create({
      shop_id: shopId, employee_id: employee.id, date: txnDate, type: 'receivable_collected',
      amount: amt, method, notes: notes?.trim() || 'Salary overpayment collected', created_by: req.user.id,
    }, { transaction });

    await postVoucher(shopId, {
      type: 'receipt',
      date: txnDate,
      narration: `Salary overpayment recovered from employee ${employee.name}${notes?.trim() ? ' — Note: ' + notes.trim() : ''}`,
      createdBy: req.user.id,
      lines: [
        { accountCode: method === 'bank' ? bankAccountCode(bankAcc) : '05-CASH', debit: amt },
        { accountCode: '03-SALPAY', credit: amt },
      ],
    }, transaction);

    await transaction.commit();
    const fresh = await db.Employee.findByPk(employee.id);
    return res.status(201).json({ transaction: txn, transaction_id: txn.id, employee: fresh });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('receiveOverpayment error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── POST /employees/:id/opening-balance ──────────────────────────────────────
// One-time migration entry, mirrors supplierLedgerController.recordOpeningBalance.
exports.recordOpeningBalance = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const employee = await db.Employee.findOne({
      where: { id: req.params.id, shop_id: shopId }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!employee) { await transaction.rollback(); return res.status(404).json({ message: 'Employee not found' }); }

    const existing = await db.EmployeeTransaction.findOne({
      where: { employee_id: employee.id, type: 'opening_balance' }, transaction,
    });
    if (existing) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Opening balance already recorded for this employee' });
    }

    const { amount, date } = req.body;
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt)) { await transaction.rollback(); return res.status(400).json({ message: 'amount is required' }); }

    await employee.update({
      current_payable: Math.round((parseFloat(employee.current_payable || 0) + amt) * 100) / 100,
    }, { transaction });

    const txn = await db.EmployeeTransaction.create({
      shop_id: shopId, employee_id: employee.id, date: date ? new Date(date) : new Date(),
      type: 'opening_balance', amount: amt, method: null, notes: `Opening balance recorded for employee ${employee.name}`, created_by: req.user.id,
    }, { transaction });

    if (amt !== 0) {
      const absAmt = Math.abs(amt);
      await postVoucher(shopId, {
        type: 'opening',
        date: date ? new Date(date) : new Date(),
        narration: `Opening balance recorded for employee ${employee.name}`,
        createdBy: req.user.id,
        lines: amt > 0
          ? [{ accountCode: '01-OBE', debit: absAmt }, { accountCode: '03-SALPAY', credit: absAmt }]
          : [{ accountCode: '03-SALPAY', debit: absAmt }, { accountCode: '01-OBE', credit: absAmt }],
      }, transaction);
    }

    await transaction.commit();
    return res.status(201).json({ transaction: txn, employee: await db.Employee.findByPk(employee.id) });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('recordEmployeeOpeningBalance error:', error);
    return res.status(500).json({ message: error.message || 'Internal server error' });
  }
};

// ── POST /employees/:id/give-salary ──────────────────────────────────────────
// Merges the old "Run Payroll" + "Record Payment" into one action: accrues the
// month's salary, auto-deducts any uncleared advances linked to this month
// (see recordAdvance), and pays the net amount out immediately — no separate
// draft/pay_now step.
//
// Core logic takes an explicit transaction and throws typed errors (statusCode
// set) rather than touching `res` directly, mirroring closeFiscalYear in
// services/fiscalYearClose.js — this is what lets a test drive a real payroll
// run and then roll it back, instead of the handler committing with no way to
// undo it (the trap that a plain req/res-shaped function falls into).
async function runGiveSalary(shopId, userId, employeeId, body, transaction) {
  const employee = await db.Employee.findOne({
    where: { id: employeeId, shop_id: shopId }, transaction, lock: transaction.LOCK.UPDATE,
  });
  if (!employee) {
    const e = new Error('Employee not found');
    e.statusCode = 404;
    throw e;
  }
  if (employee.status === 'terminated') {
    const e = new Error(`${employee.name} was terminated and cannot be paid a regular salary run. Use the clearance certificate for a final settlement instead.`);
    e.statusCode = 400;
    throw e;
  }

  const {
    month, bonus, temp_allowance, temp_allowance_label, tax_deduction_percent,
    temp_deduction, temp_deduction_label,
    method, bank_account_id, date,
    deduct_for_absence, count_leave_as_absence, add_overtime,
    // 'none' (default) leaves commission alone entirely — untouched, exactly
    // like this employee has no commission involvement this run. 'pay' folds
    // everything currently owed (this month's fresh figure plus anything
    // postponed from an earlier month) into gross pay. 'defer' postpones only
    // THIS month's fresh figure — whatever was already postponed before stays
    // postponed regardless, ready to combine with a future month's.
    commission_action = 'none',
  } = body;
  if (!['none', 'pay', 'defer'].includes(commission_action)) {
    const e = new Error("commission_action must be 'none', 'pay', or 'defer'");
    e.statusCode = 400;
    throw e;
  }
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    const e = new Error('month is required in YYYY-MM format');
    e.statusCode = 400;
    throw e;
  }
  if (!['cash', 'bank'].includes(method)) {
    const e = new Error('method must be cash or bank');
    e.statusCode = 400;
    throw e;
  }

  const existing = await db.Payroll.findOne({ where: { employee_id: employee.id, month }, transaction });
  if (existing) {
    const e = new Error(`Salary already given for ${month}`);
    e.statusCode = 409;
    throw e;
  }

  // Floored at 0, like tax_deduction_percent on the next line. The UI sets
  // min="0" on the input, but that is client-side only — a direct API call
  // could send a negative bonus, quietly reducing gross pay with no
  // corresponding deduction line to explain it on the payslip.
  const bonusAmt = Math.max(0, parseFloat(bonus) || 0);
  // One-off, entered fresh each run — distinct from the employee's recurring
  // Employee.allowances below, same reasoning as bonus never persisting
  // anywhere but this month's Payroll row.
  const tempAllowanceAmt = Math.max(0, parseFloat(temp_allowance) || 0);
  // Only meaningful when there's actually an amount behind it — a label with
  // no allowance would print a named line item worth nothing on the payslip.
  const tempAllowanceLabel = tempAllowanceAmt > 0
    ? (String(temp_allowance_label || '').trim().slice(0, TEMP_ALLOWANCE_LABEL_MAX) || null)
    : null;

  const tempDeductionAmt = Math.max(0, parseFloat(temp_deduction) || 0);
  const tempDeductionLabel = tempDeductionAmt > 0
    ? (String(temp_deduction_label || '').trim().slice(0, TEMP_DEDUCTION_LABEL_MAX) || null)
    : null;

  const taxPercent = Math.min(100, Math.max(0, parseFloat(tax_deduction_percent) || 0));

  // ── Base pay ───────────────────────────────────────────────────────────────
  // Two pay types. A salary-based employee's base pay is their fixed monthly
  // basic_salary (unchanged). A daily-wage employee's is daily_wage × the days
  // they were actually paid for that month, counted off marked attendance by
  // the shared countPaidDays weights.
  //
  // Either way the result lands in `basic_salary` on the Payroll row, so every
  // downstream figure — gross, tax, net, the ledger voucher — needs no
  // special-casing for pay type.
  const employmentType = employee.employment_type === 'daily_wage' ? 'daily_wage' : 'salary';
  const isDailyWage = employmentType === 'daily_wage';

  // Fetched once and shared: the daily-wage base pay needs it unconditionally,
  // and the absence deduction needs it when that checkbox is on.
  const needsAttendance = isDailyWage || !!deduct_for_absence;
  const attendance = needsAttendance
    ? await getAttendanceSummaryForMonth(shopId, employee.id, month, transaction)
    : null;

  let wageDaysPaid = 0;
  let dailyWageRate = 0;
  let basicSalary;
  if (isDailyWage) {
    dailyWageRate = parseFloat(employee.daily_wage || 0);
    wageDaysPaid = attendance.paid_days;
    basicSalary = Math.round(wageDaysPaid * dailyWageRate * 100) / 100;
  } else {
    basicSalary = parseFloat(employee.basic_salary || 0);
  }

  // Snapshotted onto the Payroll row below rather than re-read live later, so
  // a past payslip still reflects what the employee's allowances were AT THE
  // TIME even if their profile changes afterward — same precedent as basicSalary.
  const allowancesTotal = Math.round((Array.isArray(employee.allowances) ? employee.allowances : [])
    .reduce((s, a) => s + (parseFloat(a?.amount) || 0), 0) * 100) / 100;

  // Optional, per-run: truck-loading commission, computed by the one shared
  // function the Give Salary preview also calls — never re-derived here, or
  // the previewed figure and the paid figure could drift apart. Snapshotted
  // below like everything else on this row.
  //
  // 'pay' folds in EVERYTHING currently owed — this month's fresh figure plus
  // any earlier month's commission still sitting deferred — not just this
  // month's own amount, which is the whole point: postponing a month doesn't
  // lose it, it just waits here until a run that can afford to pay it off.
  let commissionAmount = 0;
  let commissionNote = null;
  let commissionRowIdsToResolve = [];
  if (commission_action === 'pay' || commission_action === 'defer') {
    const situation = await getCommissionSituation(shopId, employee.id, month, transaction);
    if (commission_action === 'pay') {
      commissionAmount = situation.total_amount;
      const noteParts = [];
      if (situation.current?.note) noteParts.push(situation.current.note);
      situation.carried.forEach(c => {
        if (c.note) noteParts.push(`[${c.month} carried] ${c.note}`);
      });
      commissionNote = noteParts.join('; ').slice(0, 255) || null;
      // Only the CARRIED rows need resolving after Payroll.create — a fresh
      // current-month figure that's paid immediately (never deferred) has no
      // row to resolve; Payroll.commission below is its only record, same as
      // it's always been for a month that was never postponed.
      commissionRowIdsToResolve = situation.carried.map(c => c.id);
    }
    // else 'defer': adds nothing to this run's gross pay. deferCommission()
    // itself runs after Payroll.create below, alongside resolveCommissionPaid,
    // so every post-payroll commission side effect lives in one place.
  }

  // Optional, per-run: mirrors deduct_for_absence exactly, but adds instead
  // of subtracts. No rate on the employee means overtime can't be paid — a
  // no-op rather than a blocking error, since the checkbox may be ticked by
  // habit on a run where it doesn't apply.
  let overtimeHours = 0;
  let overtimeAmount = 0;
  if (add_overtime) {
    const otSummary = await getOvertimeSummaryForMonth(shopId, employee.id, month, transaction);
    overtimeHours = otSummary.overtime_hours;
    const overtimeRate = parseFloat(employee.overtime_rate || 0);
    overtimeAmount = Math.round(overtimeHours * overtimeRate * 100) / 100;
  }

  const grossSalary = Math.round((basicSalary + allowancesTotal + tempAllowanceAmt + bonusAmt + overtimeAmount + commissionAmount) * 100) / 100;
  const taxDeduction = Math.round((grossSalary * taxPercent / 100) * 100) / 100;

  const uncleared = await db.EmployeeTransaction.findAll({
    where: { employee_id: employee.id, type: 'advance_given', for_month: month, cleared: false },
    transaction, lock: transaction.LOCK.UPDATE,
  });
  const advanceDeduction = Math.round(uncleared.reduce((s, a) => s + parseFloat(a.amount || 0), 0) * 100) / 100;

  // Optional, per-run: counted straight off marked Attendance rows for this
  // employee/month, so a month with nothing marked yet costs nothing — the
  // feature is a no-op until a shop actually starts using attendance.
  //
  // Daily rate divides by a FIXED 26 days (SALARY_DAYS_PER_MONTH), not by the
  // real length of this calendar month — business preference confirmed with the
  // user: the same absence should cost the same fraction of salary whether it
  // falls in February or August. The Give Salary preview uses the same constant.
  //
  // Half day and short leave never contribute here — they're informational for
  // salaried employees (also confirmed), so only absent (and optionally leave)
  // days are deducted.
  let attendanceDeduction = 0;
  let absentDays = 0;
  let leaveDays = 0;
  // Skipped entirely for daily-wage employees: their base pay above is already
  // only the days they worked, so deducting for absence on top would penalize
  // the same missing day twice.
  if (deduct_for_absence && !isDailyWage) {
    absentDays = attendance.absent_days;
    leaveDays = attendance.leave_days;
    const deductDays = absentDays + (count_leave_as_absence ? leaveDays : 0);
    const dailyRate = basicSalary / SALARY_DAYS_PER_MONTH;
    attendanceDeduction = Math.round(dailyRate * deductDays * 100) / 100;
  }

  const totalDeductions = Math.round((taxDeduction + advanceDeduction + attendanceDeduction + tempDeductionAmt) * 100) / 100;
  const netPay = Math.round((grossSalary - totalDeductions) * 100) / 100;
  if (netPay < 0) {
    const e = new Error('Deductions and advances exceed this month’s salary');
    e.statusCode = 400;
    throw e;
  }

  let bankAcc = null;
  if (method === 'cash') await assertCashAvailable(shopId, netPay, transaction);
  else bankAcc = await debitBankAccount(shopId, netPay, transaction, bank_account_id);

  const txnDate = date ? new Date(date) : new Date();

  const payroll = await db.Payroll.create({
    employee_id: employee.id,
    month,
    employment_type: employmentType,
    basic_salary: basicSalary,
    wage_days_paid: wageDaysPaid,
    daily_wage_rate: dailyWageRate,
    commission: commissionAmount,
    commission_note: commissionNote,
    deductions: totalDeductions,
    advance_deduction: advanceDeduction,
    attendance_deduction: attendanceDeduction,
    temp_deduction: tempDeductionAmt,
    temp_deduction_label: tempDeductionLabel,
    absent_days: absentDays,
    leave_days: leaveDays,
    tax_deduction_percent: taxPercent,
    tax_deduction: taxDeduction,
    bonus: bonusAmt,
    allowances_total: allowancesTotal,
    temp_allowance: tempAllowanceAmt,
    temp_allowance_label: tempAllowanceLabel,
    overtime_hours: overtimeHours,
    overtime_amount: overtimeAmount,
    net_pay: netPay,
    status: 'paid',
  }, { transaction });

  // Settle whatever this run decided about commission, now that payroll.id
  // exists to link against. Both are no-ops for the ordinary case (no
  // deferral ever involved): resolveCommissionPaid has nothing to resolve
  // when commissionRowIdsToResolve is empty, and deferCommission is simply
  // never called when the action isn't 'defer'.
  if (commissionRowIdsToResolve.length) {
    await resolveCommissionPaid(commissionRowIdsToResolve, payroll.id, month, transaction);
  }
  if (commission_action === 'defer') {
    await deferCommission(shopId, employee.id, month, userId, transaction);
  }

  for (const a of uncleared) {
    await a.update({ cleared: true }, { transaction });
  }

  await db.EmployeeTransaction.create({
    shop_id: shopId, employee_id: employee.id, date: txnDate, type: 'salary_due',
    amount: grossSalary, method: null,
    created_by: userId,
    notes: `Salary ${month}${isDailyWage ? ` (wage ${wageDaysPaid}d × ${dailyWageRate.toFixed(2)})` : ''}${overtimeAmount > 0 ? ` (incl. overtime ${overtimeHours}h = ${overtimeAmount.toFixed(2)})` : ''}${commissionAmount > 0 ? ` (incl. commission ${commissionAmount.toFixed(2)}${commissionNote ? ` — ${commissionNote}` : ''})` : ''}`,
  }, { transaction });

  if (totalDeductions > 0) {
    await db.EmployeeTransaction.create({
      shop_id: shopId, employee_id: employee.id, date: txnDate, type: 'deduction',
      amount: totalDeductions, method: null, created_by: userId,
      notes: `Salary ${month} deductions${taxDeduction > 0 ? ` (tax ${taxPercent}%)` : ''}${advanceDeduction > 0 ? ` (incl. advance ${advanceDeduction.toFixed(2)})` : ''}${attendanceDeduction > 0 ? ` (absent ${absentDays}d${count_leave_as_absence && leaveDays > 0 ? ` + leave ${leaveDays}d` : ''} = ${attendanceDeduction.toFixed(2)})` : ''}${tempDeductionAmt > 0 ? ` (temp deduction ${tempDeductionAmt.toFixed(2)}${tempDeductionLabel ? ` — ${tempDeductionLabel}` : ''})` : ''}`,
    }, { transaction });
  }

  const payoutTxn = await db.EmployeeTransaction.create({
    shop_id: shopId, employee_id: employee.id, date: txnDate, type: 'payment_made',
    amount: netPay, method, related_payroll_id: payroll.id, created_by: userId, notes: `Salary ${month} payout`,
  }, { transaction });

  // The three legs above (salary_due, deduction, payment_made) do net to 0
  // among themselves — but the advance they clear was ALREADY subtracted from
  // current_payable by recordAdvance when it was paid out, and the `deduction`
  // row carries it a second time with a negative sign. Recovering the advance
  // therefore has to be booked back explicitly, or the employee keeps looking
  // like they owe the company money forever (and that phantom balance could be
  // collected again at termination).
  //
  // Non-cash on purpose: no money moves here, so this is `advance_cleared`
  // rather than `receivable_collected`, which reports count as cash in.
  if (advanceDeduction > 0) {
    await db.EmployeeTransaction.create({
      shop_id: shopId, employee_id: employee.id, date: txnDate, type: 'advance_cleared',
      amount: advanceDeduction, method: null, related_payroll_id: payroll.id, created_by: userId,
      notes: `Advance cleared against salary ${month}`,
    }, { transaction });

    await employee.update({
      current_payable: Math.round((parseFloat(employee.current_payable || 0) + advanceDeduction) * 100) / 100,
    }, { transaction });
  }

  // Dr Salaries Expense (net of tax, attendance, and temp deductions) = Cr advance recovery + Cr Cash/Bank paid out.
  // Always a real cash/bank outflow — assertCashAvailable/debitBankAccount above
  // already took the money unconditionally, there's no "unpaid" path here — so
  // this posts as 'payment', not 'journal', or every payroll run vanished from
  // the Accounting report's "Payments out" while genuinely draining Cash/Bank.
  const netExpense = Math.max(0, Math.round((grossSalary - taxDeduction - attendanceDeduction - tempDeductionAmt) * 100) / 100);
  if (netExpense > 0) {
    await postVoucher(shopId, {
      type: 'payment',
      // Was hardcoded to new Date() — a payroll run entered with an explicit
      // backdated `date` still posted its ledger voucher as of today, so the
      // EmployeeTransaction rows above (which DO carry txnDate) and the
      // general ledger disagreed on which day the same salary run happened.
      date: txnDate,
      narration: `Salary paid to employee ${employee.name} for month ${month} (${isDailyWage ? `Wage Pay: ${basicSalary} (${wageDaysPaid}d × ${dailyWageRate})` : `Basic: ${basicSalary}`}, Allowances: ${allowancesTotal}, Temp Allowance: ${tempAllowanceAmt}${tempAllowanceLabel ? ` (${tempAllowanceLabel})` : ''}, Bonus: ${bonusAmt}${commissionAmount > 0 ? `, Commission: ${commissionAmount}` : ''}, Deductions: ${totalDeductions}${tempDeductionAmt > 0 ? `, Temp Deduction: ${tempDeductionAmt}${tempDeductionLabel ? ` (${tempDeductionLabel})` : ''}` : ''}, Net Pay: ${netPay})`,
      createdBy: userId,
      branchId: employee.branch_id,
      lines: [
        { accountCode: '07-SALARIES', debit: netExpense },
        ...(advanceDeduction > 0 ? [{ accountCode: '05-EMPADVLOAN', credit: advanceDeduction }] : []),
        { accountCode: method === 'bank' ? bankAccountCode(bankAcc) : '05-CASH', credit: netPay },
      ],
    }, transaction);
  }

  const fresh = await db.Employee.findByPk(employee.id, { transaction });
  return { payroll, transaction_id: payoutTxn.id, employee: fresh };
}

// ── POST /employees/:id/give-salary ─────────────────────────────────────────
exports.giveSalary = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const result = await runGiveSalary(shopId, req.user.id, req.params.id, req.body, transaction);
    await transaction.commit();
    return res.status(201).json(result);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('giveSalary error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

exports.runGiveSalary = runGiveSalary;

// ── GET /employees/:id/ledger ────────────────────────────────────────────────
exports.getLedger = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const employee = await db.Employee.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const payrollHistory = await db.Payroll.findAll({
      where: { employee_id: employee.id },
      order: [['month', 'DESC']],
    });

    const txns = await db.EmployeeTransaction.findAll({
      where: { employee_id: employee.id },
      include: [{ model: db.User, as: 'CreatedBy', attributes: ['id', 'name'] }],
      order: [['date', 'ASC'], ['id', 'ASC']],
    });

    const signFor = {
      salary_due: 1, loan_repayment: 1, opening_balance: 1, adjustment: 1, receivable_collected: 1,
      // advance_cleared offsets the advance_given that funded it: the combined
      // `deduction` row below already carries the advance with a negative sign,
      // so without this the advance is subtracted twice and the running balance
      // never returns to zero once the advance has been recovered.
      advance_cleared: 1,
      advance_given: -1, loan_given: -1, payment_made: -1, deduction: -1,
    };
    // Replayed in full, then narrowed to the fiscal year in view so the year
    // opens with the balance carried forward instead of from zero.
    let running = 0;
    const fullHistory = txns.map(t => {
      const delta = (signFor[t.type] || 0) * parseFloat(t.amount || 0);
      running = Math.round((running + delta) * 100) / 100;
      return {
        id: t.id,
        date: t.date,
        type: t.type,
        amount: parseFloat(t.amount || 0),
        method: t.method,
        for_month: t.for_month,
        cleared: t.cleared,
        notes: t.notes,
        created_by: t.CreatedBy?.name || null,
        running_balance: running,
      };
    });

    const range = await resolveListDateRange(req, shopId);
    const { opening, rows } = sliceHistoryToRange(fullHistory, range);
    const openingRow = openingBalanceRow(opening, range.from);
    const history = [...(openingRow ? [openingRow] : []), ...rows].reverse();

    const totalSalaryAccrued = txns.filter(t => t.type === 'salary_due').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const totalPaid = txns.filter(t => t.type === 'payment_made').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const loanGiven = txns.filter(t => t.type === 'loan_given').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const loanRepaid = txns.filter(t => t.type === 'loan_repayment').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const loanReceivable = Math.max(0, Math.round((loanGiven - loanRepaid) * 100) / 100);
    const advanceGiven = txns.filter(t => t.type === 'advance_given').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const advancePending = txns
      .filter(t => t.type === 'advance_given' && !t.cleared)
      .reduce((s, t) => s + parseFloat(t.amount || 0), 0);

    const currentPayable = parseFloat(employee.current_payable || 0);
    const netSalaryPosition = Math.round((currentPayable + loanReceivable + advancePending) * 100) / 100;
    const salaryPayable = Math.max(0, netSalaryPosition);
    const salaryReceivable = Math.max(0, Math.round(-netSalaryPosition * 100) / 100);

    return res.json({
      employee: {
        id: employee.id,
        name: employee.name,
        designation: employee.designation,
        status: employee.status,
        employment_type: employee.employment_type || 'salary',
        basic_salary: parseFloat(employee.basic_salary || 0),
        daily_wage: parseFloat(employee.daily_wage || 0),
        photo_path: employee.photo_path,
      },
      summary: {
        total_salary_accrued: Math.round(totalSalaryAccrued * 100) / 100,
        total_paid: Math.round(totalPaid * 100) / 100,
        current_payable: currentPayable,
        loan_given: Math.round(loanGiven * 100) / 100,
        loan_receivable: loanReceivable,
        advance_given: Math.round(advanceGiven * 100) / 100,
        advance_pending: Math.round(advancePending * 100) / 100,
        salary_payable: salaryPayable,
        salary_receivable: salaryReceivable,
      },
      payroll_history: payrollHistory,
      transaction_history: history,
    });
  } catch (error) {
    console.error('getEmployeeLedger error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /employees/:id/slips/:txnId ──────────────────────────────────────────
// Single-transaction detail for the generic slip print page. When the
// transaction is the payroll payout leg (related_payroll_id set), the linked
// Payroll row is included so the slip can render a full itemized pay slip.
exports.getTransactionSlip = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const employee = await db.Employee.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const txn = await db.EmployeeTransaction.findOne({
      where: { id: req.params.txnId, employee_id: employee.id },
      include: [
        { model: db.Payroll },
        { model: db.User, as: 'CreatedBy', attributes: ['id', 'name'] },
      ],
    });
    if (!txn) return res.status(404).json({ message: 'Transaction not found' });

    return res.json({
      employee: {
        id: employee.id,
        name: employee.name,
        designation: employee.designation,
        employment_id: employee.employment_id,
      },
      transaction: {
        id: txn.id,
        date: txn.date,
        type: txn.type,
        amount: parseFloat(txn.amount || 0),
        method: txn.method,
        for_month: txn.for_month,
        notes: txn.notes,
        created_by: txn.CreatedBy?.name || null,
      },
      payroll: txn.Payroll ? {
        month: txn.Payroll.month,
        // Read off the snapshot on the payroll row, never off the employee —
        // the employee may have changed pay type or rate since this run.
        employment_type: txn.Payroll.employment_type || 'salary',
        basic_salary: parseFloat(txn.Payroll.basic_salary || 0),
        wage_days_paid: parseFloat(txn.Payroll.wage_days_paid || 0),
        daily_wage_rate: parseFloat(txn.Payroll.daily_wage_rate || 0),
        commission: parseFloat(txn.Payroll.commission || 0),
        commission_note: txn.Payroll.commission_note || null,
        bonus: parseFloat(txn.Payroll.bonus || 0),
        allowances_total: parseFloat(txn.Payroll.allowances_total || 0),
        temp_allowance: parseFloat(txn.Payroll.temp_allowance || 0),
        temp_allowance_label: txn.Payroll.temp_allowance_label || null,
        deductions: parseFloat(txn.Payroll.deductions || 0),
        advance_deduction: parseFloat(txn.Payroll.advance_deduction || 0),
        attendance_deduction: parseFloat(txn.Payroll.attendance_deduction || 0),
        temp_deduction: parseFloat(txn.Payroll.temp_deduction || 0),
        temp_deduction_label: txn.Payroll.temp_deduction_label || null,
        absent_days: txn.Payroll.absent_days || 0,
        leave_days: txn.Payroll.leave_days || 0,
        overtime_hours: parseFloat(txn.Payroll.overtime_hours || 0),
        overtime_amount: parseFloat(txn.Payroll.overtime_amount || 0),
        tax_deduction_percent: parseFloat(txn.Payroll.tax_deduction_percent || 0),
        tax_deduction: parseFloat(txn.Payroll.tax_deduction || 0),
        net_pay: parseFloat(txn.Payroll.net_pay || 0),
      } : null,
    });
  } catch (error) {
    console.error('getEmployeeTransactionSlip error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /employees/:id/clearance-certificate ─────────────────────────────────
exports.getClearanceCertificate = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const employee = await db.Employee.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: [{ model: db.Branch, attributes: ['id', 'name'] }],
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (employee.status !== 'terminated') {
      return res.status(400).json({ message: 'Clearance certificate is only available for terminated employees' });
    }

    const payrollHistory = await db.Payroll.findAll({
      where: { employee_id: employee.id },
      order: [['month', 'DESC']],
    });

    const txns = await db.EmployeeTransaction.findAll({
      where: { employee_id: employee.id },
      order: [['date', 'ASC'], ['id', 'ASC']],
    });

    const totalSalaryAccrued = txns.filter(t => t.type === 'salary_due').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const totalPaid = txns.filter(t => t.type === 'payment_made').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const loanGiven = txns.filter(t => t.type === 'loan_given').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const loanRepaid = txns.filter(t => t.type === 'loan_repayment').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const loanReceivable = Math.max(0, Math.round((loanGiven - loanRepaid) * 100) / 100);
    const advanceGiven = txns.filter(t => t.type === 'advance_given').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const advancePending = txns
      .filter(t => t.type === 'advance_given' && !t.cleared)
      .reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    // Money recovered directly at final settlement (see
    // employeeTermination.js's applyCollectOverpayment / applyCollectAdvance)
    // — exposed so the certificate can account for it explicitly instead of
    // leaving it invisibly folded into current_payable.
    const receivableCollected = txns.filter(t => t.type === 'receivable_collected').reduce((s, t) => s + parseFloat(t.amount || 0), 0);

    const currentPayable = parseFloat(employee.current_payable || 0);
    const salaryPayable = Math.max(0, Math.round(currentPayable * 100) / 100);
    const salaryReceivable = Math.max(0, Math.round(-currentPayable * 100) / 100);
    const threshold = 0.01;

    const clearanceItems = [
      {
        key: 'salary_payable',
        label: 'Outstanding salary payable to employee',
        amount: salaryPayable,
        cleared: salaryPayable < threshold,
      },
      {
        key: 'salary_receivable',
        label: 'Salary overpayment receivable from employee',
        amount: salaryReceivable,
        cleared: salaryReceivable < threshold,
      },
      {
        key: 'loan_receivable',
        label: 'Outstanding loan balance',
        amount: loanReceivable,
        cleared: loanReceivable < threshold,
      },
      {
        key: 'advance_pending',
        label: 'Uncleared salary advances',
        amount: Math.round(advancePending * 100) / 100,
        cleared: advancePending < threshold,
      },
    ];

    const pendingAdvances = txns
      .filter(t => t.type === 'advance_given' && !t.cleared)
      .map(t => ({
        id: t.id,
        date: t.date,
        amount: parseFloat(t.amount || 0),
        for_month: t.for_month,
        notes: t.notes,
      }));

    const fullyCleared = clearanceItems.every(i => i.cleared);

    return res.json({
      employee: {
        id: employee.id,
        name: employee.name,
        designation: employee.designation,
        cnic: employee.cnic,
        phone: employee.phone,
        address: employee.address,
        employment_type: employee.employment_type || 'salary',
        basic_salary: parseFloat(employee.basic_salary || 0),
        daily_wage: parseFloat(employee.daily_wage || 0),
        hire_date: employee.hire_date,
        suspended_at: employee.suspended_at,
        terminated_at: employee.terminated_at,
        termination_notes: employee.termination_notes,
        branch: employee.Branch?.name || null,
        status: employee.status,
      },
      summary: {
        total_salary_accrued: Math.round(totalSalaryAccrued * 100) / 100,
        total_paid: Math.round(totalPaid * 100) / 100,
        current_payable: currentPayable,
        loan_given: Math.round(loanGiven * 100) / 100,
        loan_repaid: Math.round(loanRepaid * 100) / 100,
        loan_receivable: loanReceivable,
        advance_given: Math.round(advanceGiven * 100) / 100,
        advance_pending: Math.round(advancePending * 100) / 100,
        receivable_collected: Math.round(receivableCollected * 100) / 100,
      },
      clearance: {
        items: clearanceItems,
        fully_cleared: fullyCleared,
        pending_advances: pendingAdvances,
      },
      payroll_history: payrollHistory.map(p => ({
        month: p.month,
        employment_type: p.employment_type || 'salary',
        basic_salary: parseFloat(p.basic_salary || 0),
        wage_days_paid: parseFloat(p.wage_days_paid || 0),
        daily_wage_rate: parseFloat(p.daily_wage_rate || 0),
        allowances_total: parseFloat(p.allowances_total || 0),
        temp_allowance: parseFloat(p.temp_allowance || 0),
        commission: parseFloat(p.commission || 0),
        bonus: parseFloat(p.bonus || 0),
        deductions: parseFloat(p.deductions || 0),
        advance_deduction: parseFloat(p.advance_deduction || 0),
        attendance_deduction: parseFloat(p.attendance_deduction || 0),
        absent_days: p.absent_days || 0,
        leave_days: p.leave_days || 0,
        overtime_hours: parseFloat(p.overtime_hours || 0),
        overtime_amount: parseFloat(p.overtime_amount || 0),
        tax_deduction_percent: parseFloat(p.tax_deduction_percent || 0),
        tax_deduction: parseFloat(p.tax_deduction || 0),
        net_pay: parseFloat(p.net_pay || 0),
        status: p.status,
      })),
      issued_at: new Date(),
    });
  } catch (error) {
    console.error('getClearanceCertificate error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /employees/latest-payslips ───────────────────────────────────────────
// One row per employee — their most recent Give Salary payout transaction —
// so the Payroll roster page can show a Print/Download action for the last
// slip given, without an extra request per employee.
exports.getLatestPayslips = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const txns = await db.EmployeeTransaction.findAll({
      where: { shop_id: shopId, type: 'payment_made', related_payroll_id: { [Op.ne]: null } },
      include: [{ model: db.Payroll, attributes: ['month'] }],
      order: [['date', 'DESC'], ['id', 'DESC']],
    });

    const latest = {};
    txns.forEach(t => {
      if (!latest[t.employee_id]) {
        latest[t.employee_id] = { transaction_id: t.id, month: t.Payroll?.month || null, date: t.date };
      }
    });

    return res.json({ latest });
  } catch (error) {
    console.error('getLatestPayslips error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
