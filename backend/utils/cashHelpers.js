const db = require('../models');
const { Op } = require('sequelize');

// ── computeLiveCash ────────────────────────────────────────────────────────────
// Today's cash-in-hand for a shop:
//   opening_cash (today's CashSession)
// + cash/mobile_wallet sale payments received today
// + cash/mobile_wallet installment payments received today
// + cash/bank employee loan-installment repayments received today (cash leg only)
// - cash/mobile_wallet sale refunds paid out today
// - cash paid to suppliers today (stock receipts + standalone payments)
// - cash paid to employees today (advances, loans given, standalone payments)
//
// Accepts an optional `transaction` so callers can read within an in-flight
// DB transaction before committing a new cash-out entry (see assertCashAvailable).
async function computeLiveCash(shopId, { transaction } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const dayStart = new Date(today + 'T00:00:00.000Z');

  const session = await db.CashSession.findOne({
    where: { shop_id: shopId, session_date: today },
    transaction,
  });
  const openingCash = parseFloat(session?.opening_cash || 0);

  const cashSalesPayments = await db.Payment.findAll({
    where: {
      payment_method: { [Op.in]: ['cash', 'mobile_wallet'] },
      payment_date: { [Op.gte]: dayStart },
    },
    include: [{ model: db.Sale, where: { shop_id: shopId }, attributes: [], required: true }],
    attributes: ['amount'],
    transaction,
  });
  const cashIn = cashSalesPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);

  const cashInstallments = await db.InstallmentPayment.findAll({
    where: {
      method: { [Op.in]: ['cash', 'mobile_wallet'] },
      payment_date: { [Op.gte]: dayStart },
    },
    include: [{
      model: db.InstallmentSchedule,
      required: true,
      include: [{
        model: db.InstallmentPlan,
        required: true,
        include: [{ model: db.Sale, where: { shop_id: shopId }, required: true, attributes: [] }],
        attributes: [],
      }],
      attributes: [],
    }],
    attributes: ['amount_paid'],
    transaction,
  });
  const installmentCashIn = cashInstallments.reduce((s, p) => s + parseFloat(p.amount_paid || 0), 0);

  const cashRefunds = await db.SaleReturn.findAll({
    where: {
      shop_id: shopId,
      status: 'completed',
      refund_method: { [Op.in]: ['cash', 'mobile_wallet'] },
      return_date: { [Op.gte]: dayStart },
    },
    attributes: ['refund_amount'],
    transaction,
  });
  const cashOut = cashRefunds.reduce((s, r) => s + parseFloat(r.refund_amount || 0), 0);

  const supplierCashOutRows = await db.SupplierTransaction.findAll({
    where: {
      shop_id: shopId,
      method: 'cash',
      type: { [Op.in]: ['stock_received', 'payment_made'] },
      date: { [Op.gte]: dayStart },
    },
    attributes: ['paid_amount'],
    transaction,
  });
  const supplierCashOut = supplierCashOutRows.reduce((s, r) => s + parseFloat(r.paid_amount || 0), 0);

  const employeeCashOutRows = await db.EmployeeTransaction.findAll({
    where: {
      shop_id: shopId,
      method: 'cash',
      type: { [Op.in]: ['advance_given', 'loan_given', 'payment_made'] },
      date: { [Op.gte]: dayStart },
    },
    attributes: ['amount'],
    transaction,
  });
  const employeeCashOut = employeeCashOutRows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);

  const employeeCashInRows = await db.EmployeeTransaction.findAll({
    where: {
      shop_id: shopId,
      method: 'cash',
      type: { [Op.in]: ['loan_repayment', 'receivable_collected'] },
      date: { [Op.gte]: dayStart },
    },
    attributes: ['amount'],
    transaction,
  });
  const employeeCashIn = employeeCashInRows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);

  const expenseCashOutRows = await db.Expense.findAll({
    where: {
      shop_id: shopId,
      paid_via: 'cash',
      status: { [Op.ne]: 'void' },
      expense_date: { [Op.gte]: dayStart },
    },
    attributes: ['amount'],
    transaction,
  });
  const expenseCashOut = expenseCashOutRows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);

  const liveCash = Math.round((
    openingCash + cashIn + installmentCashIn + employeeCashIn
    - cashOut - supplierCashOut - employeeCashOut - expenseCashOut
  ) * 100) / 100;

  return { liveCash, openingCash, session };
}

// ── assertCashAvailable ────────────────────────────────────────────────────────
// Throws a 400-flavoured error if paying `amount` out in cash today would push
// live cash-in-hand below zero. No overdraft setting exists yet, so this is a
// hard floor.
async function assertCashAvailable(shopId, amount, transaction) {
  const { liveCash } = await computeLiveCash(shopId, { transaction });
  if (liveCash - parseFloat(amount) < 0) {
    const err = new Error(`Insufficient cash in hand. Available: ${liveCash.toFixed(2)}`);
    err.statusCode = 400;
    throw err;
  }
}

// ── assertBankAvailable ────────────────────────────────────────────────────────
// Throws a 400-flavoured error if debiting `amount` from a bank account row
// would push its balance below zero.
function assertBankAvailable(bankAccount, amount) {
  const balance = parseFloat(bankAccount?.current_balance || 0);
  if (balance - parseFloat(amount) < 0) {
    const err = new Error(`Insufficient bank balance. Available: ${balance.toFixed(2)}`);
    err.statusCode = 400;
    throw err;
  }
}

// ── debitBankAccount / creditBankAccount ──────────────────────────────────────
// Mirrors the inline pattern already used in saleController/saleReturnController/
// installmentController: first active bank account for the shop, row-locked.
async function debitBankAccount(shopId, amount, transaction) {
  const bankAcc = await db.BankAccount.findOne({
    where: { shop_id: shopId, is_active: true },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!bankAcc) {
    const err = new Error('No active bank account found for this shop');
    err.statusCode = 400;
    throw err;
  }
  assertBankAvailable(bankAcc, amount);
  await bankAcc.update({
    current_balance: Math.round((parseFloat(bankAcc.current_balance || 0) - parseFloat(amount)) * 100) / 100,
  }, { transaction });
  return bankAcc;
}

async function creditBankAccount(shopId, amount, transaction) {
  const bankAcc = await db.BankAccount.findOne({
    where: { shop_id: shopId, is_active: true },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (bankAcc) {
    await bankAcc.update({
      current_balance: Math.round((parseFloat(bankAcc.current_balance || 0) + parseFloat(amount)) * 100) / 100,
    }, { transaction });
  }
  return bankAcc;
}

module.exports = {
  computeLiveCash, assertCashAvailable, assertBankAvailable,
  debitBankAccount, creditBankAccount,
};
