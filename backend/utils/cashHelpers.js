const db = require('../models');
const { Op } = require('sequelize');

const round2 = (n) => Math.round(n * 100) / 100;
const todayStr = () => new Date().toISOString().slice(0, 10);

// ── computeCashFlow ─────────────────────────────────────────────────────────────
// Net cash movement (in − out) for a shop over the half-open date window
// [fromDate 00:00, toDate 00:00). Pass `toDate = null` for an open-ended window
// (everything from `fromDate` onward), which is what "today's live activity" uses.
//
//   + cash/mobile_wallet sale payments received
//   + cash/mobile_wallet installment payments received
//   + cash employee loan-installment repayments / receivable collections
//   + cash standalone customer payments received (incl. advances)
//   − cash/mobile_wallet sale refunds paid out
//   − cash paid to suppliers (stock receipts + standalone payments)
//   − cash paid to employees (advances, loans given, standalone payments)
//   − cash expenses
//
// Accepts an optional `transaction` so callers can read within an in-flight
// DB transaction before committing a new cash-out entry (see assertCashAvailable).
async function computeCashFlow(shopId, fromDate, toDate, { transaction } = {}) {
  const gte = new Date(fromDate + 'T00:00:00.000Z');
  const range = toDate
    ? { [Op.gte]: gte, [Op.lt]: new Date(toDate + 'T00:00:00.000Z') }
    : { [Op.gte]: gte };

  const cashSalesPayments = await db.Payment.findAll({
    where: {
      payment_method: { [Op.in]: ['cash', 'mobile_wallet'] },
      payment_date: range,
    },
    include: [{ model: db.Sale, where: { shop_id: shopId }, attributes: [], required: true }],
    attributes: ['amount'],
    transaction,
  });
  const cashIn = cashSalesPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);

  const cashInstallments = await db.InstallmentPayment.findAll({
    where: {
      method: { [Op.in]: ['cash', 'mobile_wallet'] },
      payment_date: range,
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

  // Standalone customer payments (paying down credit, or paying in advance).
  // Sale-time customer payments are already captured via db.Payment above and
  // ALSO mirrored into a CustomerTransaction with related_sale_id set — so we
  // count only the standalone ledger payments (related_sale_id IS NULL) here to
  // avoid double-counting.
  const customerCashInRows = await db.CustomerTransaction.findAll({
    where: {
      shop_id: shopId,
      method: 'cash',
      type: 'payment_received',
      related_sale_id: null,
      date: range,
    },
    attributes: ['amount'],
    transaction,
  });
  const customerCashIn = customerCashInRows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);

  const cashRefunds = await db.SaleReturn.findAll({
    where: {
      shop_id: shopId,
      status: 'completed',
      refund_method: { [Op.in]: ['cash', 'mobile_wallet'] },
      return_date: range,
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
      date: range,
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
      date: range,
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
      date: range,
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
      expense_date: range,
    },
    attributes: ['amount'],
    transaction,
  });
  const expenseCashOut = expenseCashOutRows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);

  return round2(
    cashIn + installmentCashIn + employeeCashIn + customerCashIn
    - cashOut - supplierCashOut - employeeCashOut - expenseCashOut
  );
}

// ── resolveOpeningCash ──────────────────────────────────────────────────────────
// Today's opening cash for a shop, carried forward from the previous day's
// closing balance — exactly like a bank account's running balance.
//
//   • If a CashSession row already exists for today, its stored opening_cash is
//     authoritative (this lets an admin manually adjust/override it if needed).
//   • Otherwise the opening is the most recent prior session's opening_cash plus
//     every cash movement from that session's date up to (but not including)
//     today — i.e. that day's closing balance, rolled through any gap days.
//   • With no history at all (shop never set up), opening is 0.
//
// Returns { openingCash, session, hasBaseline }. `session` is today's row when it
// exists (null when the baseline was carried forward but not yet persisted).
async function resolveOpeningCash(shopId, { transaction } = {}) {
  const today = todayStr();

  const session = await db.CashSession.findOne({
    where: { shop_id: shopId, session_date: today },
    transaction,
  });
  if (session) {
    return { openingCash: parseFloat(session.opening_cash || 0), session, hasBaseline: true };
  }

  const prev = await db.CashSession.findOne({
    where: { shop_id: shopId, session_date: { [Op.lt]: today } },
    order: [['session_date', 'DESC']],
    transaction,
  });
  if (!prev) {
    return { openingCash: 0, session: null, hasBaseline: false };
  }

  const flowSincePrev = await computeCashFlow(shopId, prev.session_date, today, { transaction });
  const openingCash = round2(parseFloat(prev.opening_cash || 0) + flowSincePrev);
  return { openingCash, session: null, hasBaseline: true };
}

// ── ensureTodaySession ──────────────────────────────────────────────────────────
// Persists today's CashSession (idempotently) with its opening carried forward
// from the previous day's closing balance. Also stamps the previous session's
// closing_cash for reporting. Called on login/profile fetch so cash-in-hand is
// always anchored to a real row without prompting the user each morning.
async function ensureTodaySession(shopId, userId, { transaction } = {}) {
  const today = todayStr();

  const existing = await db.CashSession.findOne({
    where: { shop_id: shopId, session_date: today },
    transaction,
  });
  if (existing) return existing;

  const prev = await db.CashSession.findOne({
    where: { shop_id: shopId, session_date: { [Op.lt]: today } },
    order: [['session_date', 'DESC']],
    transaction,
  });
  // No prior baseline means the shop hasn't completed financial setup yet —
  // don't fabricate a session; setup will create the first one.
  if (!prev) return null;

  const flowSincePrev = await computeCashFlow(shopId, prev.session_date, today, { transaction });
  const openingCash = round2(parseFloat(prev.opening_cash || 0) + flowSincePrev);

  // Record the previous session's closing balance for historical reporting.
  if (prev.closing_cash === null || prev.closing_cash === undefined) {
    await prev.update({ closing_cash: openingCash }, { transaction });
  }

  const [session] = await db.CashSession.findOrCreate({
    where: { shop_id: shopId, session_date: today },
    defaults: {
      shop_id: shopId,
      session_date: today,
      opening_cash: openingCash,
      notes: 'Auto-carried from previous day closing',
      created_by: userId,
    },
    transaction,
  });
  return session;
}

// ── computeLiveCash ────────────────────────────────────────────────────────────
// Today's cash-in-hand = today's opening cash (carried forward from yesterday's
// close) + today's net cash flow.
async function computeLiveCash(shopId, { transaction } = {}) {
  const today = todayStr();
  const { openingCash, session, hasBaseline } = await resolveOpeningCash(shopId, { transaction });
  const todayFlow = await computeCashFlow(shopId, today, null, { transaction });
  const liveCash = round2(openingCash + todayFlow);
  return { liveCash, openingCash, session, hasBaseline };
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
  computeLiveCash, computeCashFlow, resolveOpeningCash, ensureTodaySession,
  assertCashAvailable, assertBankAvailable,
  debitBankAccount, creditBankAccount,
};
