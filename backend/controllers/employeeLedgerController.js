const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { assertCashAvailable, debitBankAccount, creditBankAccount } = require('../utils/cashHelpers');
const { postVoucher } = require('../utils/postVoucher');

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

    const { amount, method, notes, for_month } = req.body;
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
    if (for_month < currentMonthStr()) {
      await transaction.rollback();
      return res.status(400).json({ message: 'for_month must be the current month or a future month' });
    }
    const alreadyPaid = await db.Payroll.findOne({ where: { employee_id: employee.id, month: for_month }, transaction });
    if (alreadyPaid) {
      await transaction.rollback();
      return res.status(400).json({ message: `Salary for ${for_month} has already been given — pick a later month` });
    }

    if (method === 'cash') await assertCashAvailable(shopId, amt, transaction);
    else await debitBankAccount(shopId, amt, transaction);

    await employee.update({
      current_payable: Math.round((parseFloat(employee.current_payable || 0) - amt) * 100) / 100,
    }, { transaction });

    const txn = await db.EmployeeTransaction.create({
      shop_id: shopId, employee_id: employee.id, date: new Date(), type: 'advance_given',
      amount: amt, method, for_month, cleared: false, notes: notes?.trim() || null, created_by: req.user.id,
    }, { transaction });

    await postVoucher(shopId, {
      type: 'payment',
      date: new Date(),
      narration: `Advance (for ${for_month}) — ${employee.name}${notes?.trim() ? ' — ' + notes.trim() : ''}`,
      createdBy: req.user.id,
      lines: [
        { accountCode: '05-EMPADVLOAN', debit: amt },
        { accountCode: method === 'bank' ? '05-BANK' : '05-CASH', credit: amt },
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

    const { amount, method, notes } = req.body;
    const amt = parseFloat(amount);
    if (!(amt > 0)) { await transaction.rollback(); return res.status(400).json({ message: 'amount must be greater than 0' }); }
    if (!['cash', 'bank'].includes(method)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'method must be cash or bank' });
    }

    if (method === 'cash') await assertCashAvailable(shopId, amt, transaction);
    else await debitBankAccount(shopId, amt, transaction);

    await employee.update({
      current_payable: Math.round((parseFloat(employee.current_payable || 0) - amt) * 100) / 100,
    }, { transaction });

    const txn = await db.EmployeeTransaction.create({
      shop_id: shopId, employee_id: employee.id, date: new Date(), type: 'loan_given',
      amount: amt, method, notes: notes?.trim() || null, created_by: req.user.id,
    }, { transaction });

    await postVoucher(shopId, {
      type: 'payment',
      date: new Date(),
      narration: `Loan — ${employee.name}${notes?.trim() ? ' — ' + notes.trim() : ''}`,
      createdBy: req.user.id,
      lines: [
        { accountCode: '05-EMPADVLOAN', debit: amt },
        { accountCode: method === 'bank' ? '05-BANK' : '05-CASH', credit: amt },
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

    const { amount, method, notes } = req.body;
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

    if (method === 'bank') await creditBankAccount(shopId, amt, transaction);
    // Cash coming in needs no floor guard.

    await employee.update({
      current_payable: Math.round((parseFloat(employee.current_payable || 0) + amt) * 100) / 100,
    }, { transaction });

    const txn = await db.EmployeeTransaction.create({
      shop_id: shopId, employee_id: employee.id, date: new Date(), type: 'loan_repayment',
      amount: amt, method, notes: notes?.trim() || null, created_by: req.user.id,
    }, { transaction });

    await postVoucher(shopId, {
      type: 'receipt',
      date: new Date(),
      narration: `Loan payment received — ${employee.name}${notes?.trim() ? ' — ' + notes.trim() : ''}`,
      createdBy: req.user.id,
      lines: [
        { accountCode: method === 'bank' ? '05-BANK' : '05-CASH', debit: amt },
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
      type: 'opening_balance', amount: amt, method: null, created_by: req.user.id,
    }, { transaction });

    if (amt !== 0) {
      const absAmt = Math.abs(amt);
      await postVoucher(shopId, {
        type: 'journal',
        date: date ? new Date(date) : new Date(),
        narration: `Opening balance — ${employee.name}`,
        createdBy: req.user.id,
        lines: amt > 0
          ? [{ accountCode: '01-CAPITAL', debit: absAmt }, { accountCode: '03-SALPAY', credit: absAmt }]
          : [{ accountCode: '03-SALPAY', debit: absAmt }, { accountCode: '01-CAPITAL', credit: absAmt }],
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
exports.giveSalary = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const employee = await db.Employee.findOne({
      where: { id: req.params.id, shop_id: shopId }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!employee) { await transaction.rollback(); return res.status(404).json({ message: 'Employee not found' }); }

    const { month, bonus, deductions, method } = req.body;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'month is required in YYYY-MM format' });
    }
    if (!['cash', 'bank'].includes(method)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'method must be cash or bank' });
    }

    const existing = await db.Payroll.findOne({ where: { employee_id: employee.id, month }, transaction });
    if (existing) {
      await transaction.rollback();
      return res.status(409).json({ message: `Salary already given for ${month}` });
    }

    const bonusAmt = parseFloat(bonus) || 0;
    const manualDeductions = parseFloat(deductions) || 0;
    const basicSalary = parseFloat(employee.basic_salary || 0);

    const uncleared = await db.EmployeeTransaction.findAll({
      where: { employee_id: employee.id, type: 'advance_given', for_month: month, cleared: false },
      transaction, lock: transaction.LOCK.UPDATE,
    });
    const advanceDeduction = Math.round(uncleared.reduce((s, a) => s + parseFloat(a.amount || 0), 0) * 100) / 100;

    const totalDeductions = Math.round((manualDeductions + advanceDeduction) * 100) / 100;
    const netPay = Math.round((basicSalary + bonusAmt - totalDeductions) * 100) / 100;
    if (netPay < 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Deductions and advances exceed this month’s salary' });
    }

    if (method === 'cash') await assertCashAvailable(shopId, netPay, transaction);
    else await debitBankAccount(shopId, netPay, transaction);

    const payroll = await db.Payroll.create({
      employee_id: employee.id,
      month,
      basic_salary: basicSalary,
      deductions: totalDeductions,
      advance_deduction: advanceDeduction,
      bonus: bonusAmt,
      net_pay: netPay,
      status: 'paid',
    }, { transaction });

    for (const a of uncleared) {
      await a.update({ cleared: true }, { transaction });
    }

    await db.EmployeeTransaction.create({
      shop_id: shopId, employee_id: employee.id, date: new Date(), type: 'salary_due',
      amount: Math.round((basicSalary + bonusAmt) * 100) / 100, method: null,
      created_by: req.user.id, notes: `Salary ${month}`,
    }, { transaction });

    if (totalDeductions > 0) {
      await db.EmployeeTransaction.create({
        shop_id: shopId, employee_id: employee.id, date: new Date(), type: 'deduction',
        amount: totalDeductions, method: null, created_by: req.user.id,
        notes: `Salary ${month} deductions${advanceDeduction > 0 ? ` (incl. advance ${advanceDeduction.toFixed(2)})` : ''}`,
      }, { transaction });
    }

    const payoutTxn = await db.EmployeeTransaction.create({
      shop_id: shopId, employee_id: employee.id, date: new Date(), type: 'payment_made',
      amount: netPay, method, related_payroll_id: payroll.id, created_by: req.user.id, notes: `Salary ${month} payout`,
    }, { transaction });

    // Net effect on current_payable across the three legs above is 0 (salary
    // accrues, deductions/advance and the payout net it back down by the same
    // total) — so current_payable is intentionally left untouched here.

    // Dr Salaries Expense (net of manual deductions only — advance clearing is
    // recovering an existing asset, not reducing the expense) = Cr advance
    // recovery + Cr Cash/Bank paid out. Balances exactly since
    // netPay = netExpense - advanceDeduction (validated by the netPay>=0 check above).
    const netExpense = Math.max(0, Math.round((basicSalary + bonusAmt - manualDeductions) * 100) / 100);
    if (netExpense > 0) {
      await postVoucher(shopId, {
        type: 'journal',
        date: new Date(),
        narration: `Salary ${month} — ${employee.name} (Basic: ${basicSalary}, Bonus: ${bonusAmt}, Deductions: ${totalDeductions}, Net Pay: ${netPay})`,
        createdBy: req.user.id,
        lines: [
          { accountCode: '07-SALARIES', debit: netExpense },
          ...(advanceDeduction > 0 ? [{ accountCode: '05-EMPADVLOAN', credit: advanceDeduction }] : []),
          { accountCode: method === 'bank' ? '05-BANK' : '05-CASH', credit: netPay },
        ],
      }, transaction);
    }

    await transaction.commit();
    const fresh = await db.Employee.findByPk(employee.id);
    return res.status(201).json({ payroll, transaction_id: payoutTxn.id, employee: fresh });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('giveSalary error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

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
      salary_due: 1, loan_repayment: 1, opening_balance: 1, adjustment: 1,
      advance_given: -1, loan_given: -1, payment_made: -1, deduction: -1,
    };
    let running = 0;
    const history = txns.map(t => {
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
    }).reverse();

    const totalSalaryAccrued = txns.filter(t => t.type === 'salary_due').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const totalPaid = txns.filter(t => t.type === 'payment_made').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const loanGiven = txns.filter(t => t.type === 'loan_given').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const loanRepaid = txns.filter(t => t.type === 'loan_repayment').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const loanReceivable = Math.max(0, Math.round((loanGiven - loanRepaid) * 100) / 100);
    const advanceGiven = txns.filter(t => t.type === 'advance_given').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const advancePending = txns
      .filter(t => t.type === 'advance_given' && !t.cleared)
      .reduce((s, t) => s + parseFloat(t.amount || 0), 0);

    return res.json({
      employee: {
        id: employee.id,
        name: employee.name,
        designation: employee.designation,
        status: employee.status,
        basic_salary: parseFloat(employee.basic_salary || 0),
      },
      summary: {
        total_salary_accrued: Math.round(totalSalaryAccrued * 100) / 100,
        total_paid: Math.round(totalPaid * 100) / 100,
        current_payable: parseFloat(employee.current_payable || 0),
        loan_given: Math.round(loanGiven * 100) / 100,
        loan_receivable: loanReceivable,
        advance_given: Math.round(advanceGiven * 100) / 100,
        advance_pending: Math.round(advancePending * 100) / 100,
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
        basic_salary: parseFloat(txn.Payroll.basic_salary || 0),
        bonus: parseFloat(txn.Payroll.bonus || 0),
        deductions: parseFloat(txn.Payroll.deductions || 0),
        advance_deduction: parseFloat(txn.Payroll.advance_deduction || 0),
        net_pay: parseFloat(txn.Payroll.net_pay || 0),
      } : null,
    });
  } catch (error) {
    console.error('getEmployeeTransactionSlip error:', error);
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
