'use strict';

const db = require('../models');
const { Op } = require('sequelize');
const { assertCashAvailable, debitBankAccount, creditBankAccount, bankAccountCode } = require('./cashHelpers');
const { postVoucher } = require('./postVoucher');
const { computeEmployeeBalances, round2 } = require('./employeeBalances');

function parseSettlement(body, key) {
  const row = body?.[key];
  if (!row) return null;
  const amount = round2(row.amount);
  if (!(amount > 0)) return null;
  if (!['cash', 'bank'].includes(row.method)) {
    const err = new Error(`${key}.method must be cash or bank`);
    err.statusCode = 400;
    throw err;
  }
  return {
    amount,
    method: row.method,
    bank_account_id: row.bank_account_id || null,
    notes: row.notes?.trim() || null,
  };
}

async function getLoanReceivable(employeeId, transaction) {
  const loanTotals = await db.EmployeeTransaction.findAll({
    where: { employee_id: employeeId, type: { [Op.in]: ['loan_given', 'loan_repayment'] } },
    attributes: ['type', [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total']],
    group: ['type'],
    raw: true,
    transaction,
  });
  const givenTotal = parseFloat(loanTotals.find(r => r.type === 'loan_given')?.total || 0);
  const repaidTotal = parseFloat(loanTotals.find(r => r.type === 'loan_repayment')?.total || 0);
  return Math.max(0, round2(givenTotal - repaidTotal));
}

async function getAdvancePending(employeeId, transaction) {
  const rows = await db.EmployeeTransaction.findAll({
    where: { employee_id: employeeId, type: 'advance_given', cleared: false },
    order: [['date', 'ASC'], ['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const total = round2(rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0));
  return { total, rows };
}

// The salary-only slice of current_payable, with the loan and advance amounts
// that are tracked separately added back out of it. Mirrors the same
// calculation in ./employeeBalances.js, which drives the termination screen —
// both must agree, or the UI offers a settlement the backend then refuses (or,
// as before, happily collects the same debt through two different buckets).
async function getNetSalaryPosition(employee, transaction) {
  const loanReceivable = await getLoanReceivable(employee.id, transaction);
  const { total: advancePending } = await getAdvancePending(employee.id, transaction);
  return round2(parseFloat(employee.current_payable || 0) + loanReceivable + advancePending);
}

async function applyPayPayable(employee, shopId, settlement, userId, transaction) {
  await employee.reload({ transaction, lock: transaction.LOCK.UPDATE });
  const payable = round2(Math.max(0, await getNetSalaryPosition(employee, transaction)));
  if (!(payable > 0)) return;

  const pay = Math.min(settlement.amount, payable);
  const methodErr = methodGuard(settlement.method);
  if (methodErr) throw methodErr;

  let bankAcc = null;
  if (settlement.method === 'cash') await assertCashAvailable(shopId, pay, transaction);
  else bankAcc = await debitBankAccount(shopId, pay, transaction, settlement.bank_account_id);

  await employee.update({
    current_payable: round2(parseFloat(employee.current_payable || 0) - pay),
  }, { transaction });

  await db.EmployeeTransaction.create({
    shop_id: shopId,
    employee_id: employee.id,
    date: new Date(),
    type: 'payment_made',
    amount: pay,
    method: settlement.method,
    notes: settlement.notes || 'Final settlement — salary payable on termination',
    created_by: userId,
  }, { transaction });

  await postVoucher(shopId, {
    type: 'payment',
    date: new Date(),
    narration: `Final salary settlement paid to ${employee.name} on termination`,
    createdBy: userId,
    lines: [
      { accountCode: '03-SALPAY', debit: pay },
      { accountCode: settlement.method === 'bank' ? bankAccountCode(bankAcc) : '05-CASH', credit: pay },
    ],
  }, transaction);
}

async function applyCollectOverpayment(employee, shopId, settlement, userId, transaction) {
  await employee.reload({ transaction, lock: transaction.LOCK.UPDATE });
  // Netted, so an outstanding loan or uncleared advance can no longer masquerade
  // as a salary overpayment here — it is collected by applyCollectLoan /
  // applyCollectAdvance instead, against the correct receivable account.
  const receivable = round2(Math.max(0, -(await getNetSalaryPosition(employee, transaction))));
  if (!(receivable > 0)) return;

  const collect = Math.min(settlement.amount, receivable);
  let bankAcc = null;
  if (settlement.method === 'bank') bankAcc = await creditBankAccount(shopId, collect, transaction, settlement.bank_account_id);

  await employee.update({
    current_payable: round2(parseFloat(employee.current_payable || 0) + collect),
  }, { transaction });

  await db.EmployeeTransaction.create({
    shop_id: shopId,
    employee_id: employee.id,
    date: new Date(),
    type: 'receivable_collected',
    amount: collect,
    method: settlement.method,
    notes: settlement.notes || 'Final settlement — balance recovered on termination',
    created_by: userId,
  }, { transaction });

  await postVoucher(shopId, {
    type: 'receipt',
    date: new Date(),
    narration: `Final balance recovered from ${employee.name} on termination`,
    createdBy: userId,
    lines: [
      { accountCode: settlement.method === 'bank' ? bankAccountCode(bankAcc) : '05-CASH', debit: collect },
      { accountCode: '03-SALPAY', credit: collect },
    ],
  }, transaction);
}

async function applyCollectLoan(employee, shopId, settlement, userId, transaction) {
  const loanReceivable = await getLoanReceivable(employee.id, transaction);
  if (!(loanReceivable > 0)) return;

  const collect = Math.min(settlement.amount, loanReceivable);
  let bankAcc = null;
  if (settlement.method === 'bank') bankAcc = await creditBankAccount(shopId, collect, transaction, settlement.bank_account_id);

  await employee.update({
    current_payable: round2(parseFloat(employee.current_payable || 0) + collect),
  }, { transaction });

  await db.EmployeeTransaction.create({
    shop_id: shopId,
    employee_id: employee.id,
    date: new Date(),
    type: 'loan_repayment',
    amount: collect,
    method: settlement.method,
    notes: settlement.notes || 'Loan repayment on termination',
    created_by: userId,
  }, { transaction });

  await postVoucher(shopId, {
    type: 'receipt',
    date: new Date(),
    narration: `Loan payment received from ${employee.name} on termination`,
    createdBy: userId,
    lines: [
      { accountCode: settlement.method === 'bank' ? bankAccountCode(bankAcc) : '05-CASH', debit: collect },
      { accountCode: '05-EMPADVLOAN', credit: collect },
    ],
  }, transaction);
}

async function applyCollectAdvance(employee, shopId, settlement, userId, transaction) {
  const { total, rows } = await getAdvancePending(employee.id, transaction);
  if (!(total > 0)) return;

  const collect = Math.min(settlement.amount, total);
  let bankAcc = null;
  if (settlement.method === 'bank') bankAcc = await creditBankAccount(shopId, collect, transaction, settlement.bank_account_id);

  let remaining = collect;
  for (const adv of rows) {
    if (remaining <= 0) break;
    await adv.update({ cleared: true }, { transaction });
    remaining = round2(remaining - parseFloat(adv.amount || 0));
  }

  await employee.update({
    current_payable: round2(parseFloat(employee.current_payable || 0) + collect),
  }, { transaction });

  await db.EmployeeTransaction.create({
    shop_id: shopId,
    employee_id: employee.id,
    date: new Date(),
    type: 'receivable_collected',
    amount: collect,
    method: settlement.method,
    notes: settlement.notes || 'Advance recovered on termination',
    created_by: userId,
  }, { transaction });

  await postVoucher(shopId, {
    type: 'receipt',
    date: new Date(),
    narration: `Advance recovered from ${employee.name} on termination`,
    createdBy: userId,
    lines: [
      { accountCode: settlement.method === 'bank' ? bankAccountCode(bankAcc) : '05-CASH', debit: collect },
      { accountCode: '05-EMPADVLOAN', credit: collect },
    ],
  }, transaction);
}

function methodGuard(method) {
  if (['cash', 'bank'].includes(method)) return null;
  const err = new Error('payment method must be cash or bank');
  err.statusCode = 400;
  return err;
}

async function applyTerminationSettlements(employee, shopId, settlements, userId, transaction) {
  if (!settlements) return;

  const payPayable = parseSettlement(settlements, 'pay_payable');
  const collectOverpayment = parseSettlement(settlements, 'collect_overpayment');
  const collectLoan = parseSettlement(settlements, 'collect_loan');
  const collectAdvance = parseSettlement(settlements, 'collect_advance');

  if (payPayable) await applyPayPayable(employee, shopId, payPayable, userId, transaction);
  if (collectOverpayment) await applyCollectOverpayment(employee, shopId, collectOverpayment, userId, transaction);
  if (collectLoan) await applyCollectLoan(employee, shopId, collectLoan, userId, transaction);
  if (collectAdvance) await applyCollectAdvance(employee, shopId, collectAdvance, userId, transaction);
}

async function loadTerminationPreview(employee) {
  const txns = await db.EmployeeTransaction.findAll({
    where: { employee_id: employee.id },
    order: [['date', 'ASC'], ['id', 'ASC']],
  });
  return computeEmployeeBalances(employee, txns);
}

module.exports = {
  applyTerminationSettlements,
  loadTerminationPreview,
  computeEmployeeBalances,
};
