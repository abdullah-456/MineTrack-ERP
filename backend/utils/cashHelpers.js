const db = require('../models');
const { Op } = require('sequelize');

const round2 = (n) => Math.round(n * 100) / 100;
const todayStr = () => new Date().toISOString().slice(0, 10);

// Opening-balance / setup journals must not inflate today's operational cash
// flow on the shared 05-CASH bucket.
//
// This used to exclude every voucher that touched ANY equity account, which
// swept up real cash movements: an owner drawing (Dr Drawings / Cr Cash) left
// the drawer without the dashboard ever seeing it, and "Direct stock received"
// — which credits 01-CAPITAL for the unpaid remainder — had its genuine cash
// payment leg excluded too. Once director capital is correctly typed as equity,
// that same test would have hidden every BOD cash movement as well.
//
// Vouchers are now tagged 'opening' at the point they are posted, so intent is
// recorded rather than inferred.
async function openingVoucherIds(shopId, transaction) {
  const rows = await db.Voucher.findAll({
    where: { shop_id: shopId, voucher_type: 'opening' },
    attributes: ['id'],
    raw: true,
    transaction,
  });
  return new Set(rows.map(r => r.id));
}

async function cashParentAccount(transaction) {
  return db.ChartOfAccount.findOne({ where: { account_code: '05-CASH' }, transaction });
}

// Every account that holds this shop's cash: the shared Cash in Hand (05-CASH)
// plus every named cash fund nested under it.
//
// Single definition on purpose. computeTotalCashOnHand used to include the
// sub-accounts while computeCashFlow counted only the parent — so the dashboard
// total, the chart-of-accounts tree, and the balance that gates every cash
// payment disagreed with each other the moment a shop created a petty-cash
// fund, and the payment guard used the narrowest of the three.
async function cashAccountIds(shopId, transaction) {
  const parent = await cashParentAccount(transaction);
  if (!parent) return [];

  const children = await db.ChartOfAccount.findAll({
    where: { parent_account_id: parent.id, shop_id: shopId },
    attributes: ['id'],
    transaction,
  });
  return [parent.id, ...children.map(a => a.id)];
}

// All liquid cash for this shop, merged from the GL.
async function computeTotalCashOnHand(shopId, { transaction } = {}) {
  const accountIds = await cashAccountIds(shopId, transaction);
  if (!accountIds.length) return 0;

  const agg = await db.GeneralLedger.findOne({
    where: { shop_id: shopId, account_id: { [Op.in]: accountIds } },
    attributes: [
      [db.sequelize.fn('SUM', db.sequelize.col('debit')), 'total_debit'],
      [db.sequelize.fn('SUM', db.sequelize.col('credit')), 'total_credit'],
    ],
    raw: true,
    transaction,
  });
  return round2(parseFloat(agg?.total_debit || 0) - parseFloat(agg?.total_credit || 0));
}

// ── computeCashFlow ─────────────────────────────────────────────────────────────
// Net movement across every cash account for this shop over [fromDate, toDate).
// Uses the same cashAccountIds() set as computeTotalCashOnHand, so live cash,
// the dashboard total and the payment guard can no longer drift apart.
//
// Vouchers tagged 'opening' are excluded so setup journals do not inflate live
// cash on top of the session's opening_cash baseline. Real capital movements
// (drawings, director contributions) are NOT excluded — they move real cash.
async function computeCashFlow(shopId, fromDate, toDate, { transaction } = {}) {
  const accountIds = await cashAccountIds(shopId, transaction);
  if (!accountIds.length) return 0;

  const excluded = await openingVoucherIds(shopId, transaction);
  const gte = new Date(fromDate + 'T00:00:00.000Z');
  const dateRange = toDate
    ? { [Op.gte]: gte, [Op.lt]: new Date(toDate + 'T00:00:00.000Z') }
    : { [Op.gte]: gte };

  const where = { shop_id: shopId, account_id: { [Op.in]: accountIds }, entry_date: dateRange };
  if (excluded.size) where.voucher_id = { [Op.notIn]: [...excluded] };

  const agg = await db.GeneralLedger.findOne({
    where,
    attributes: [
      [db.sequelize.fn('SUM', db.sequelize.col('debit')), 'total_debit'],
      [db.sequelize.fn('SUM', db.sequelize.col('credit')), 'total_credit'],
    ],
    raw: true,
    transaction,
  });
  return round2(parseFloat(agg?.total_debit || 0) - parseFloat(agg?.total_credit || 0));
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
//
// Takes an exclusive lock on the shop row first. This was previously a plain
// check-then-act: the balance is derived by aggregating the general ledger, and
// the shared cash bucket — unlike a BankAccount, which findTargetBankAccount
// locks — has no row of its own to lock against. Two simultaneous cash payments
// could therefore both read the same pre-transaction balance, both pass, and
// both commit, driving cash in hand negative.
//
// The shop row is the natural serialization point: it always exists, needs no
// new schema, and every cash-out path already runs inside a transaction, so the
// lock is held until that transaction commits. Cash payments are low-throughput,
// so serializing them per shop costs nothing in practice.
async function assertCashAvailable(shopId, amount, transaction) {
  if (transaction) {
    await db.Shop.findOne({
      where: { id: shopId },
      attributes: ['id'],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }

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
// Targets a specific bank account (so each named account — "Office Account",
// "Office 2 Account" — has its own real balance and ledger line) when
// `bankAccountId` is given; otherwise falls back to the first active account
// for the shop, matching every existing caller that hasn't been updated yet.
// Always returns the row with its linked ChartOfAccount included, so callers
// can post the GL line against that specific account's own code.
async function findTargetBankAccount(shopId, transaction, bankAccountId) {
  const where = bankAccountId
    ? { id: bankAccountId, shop_id: shopId, is_active: true }
    : { shop_id: shopId, is_active: true };
  // Postgres won't allow FOR UPDATE across an outer join to a nullable side,
  // so the row lock and the ChartOfAccount lookup have to be separate queries.
  const bankAcc = await db.BankAccount.findOne({
    where,
    order: bankAccountId ? undefined : [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (bankAcc?.chart_of_account_id) {
    bankAcc.ChartOfAccount = await db.ChartOfAccount.findByPk(bankAcc.chart_of_account_id, { transaction });
  }
  return bankAcc;
}

async function debitBankAccount(shopId, amount, transaction, bankAccountId = null) {
  const bankAcc = await findTargetBankAccount(shopId, transaction, bankAccountId);
  if (!bankAcc) {
    const err = new Error('No active bank account found for this shop');
    err.statusCode = 400;
    throw err;
  }
  if (bankAcc.kind !== 'bank') {
    const err = new Error('Selected account is not a bank account');
    err.statusCode = 400;
    throw err;
  }
  assertBankAvailable(bankAcc, amount);
  await bankAcc.update({
    current_balance: Math.round((parseFloat(bankAcc.current_balance || 0) - parseFloat(amount)) * 100) / 100,
  }, { transaction });
  return bankAcc;
}

// Debits either a named cash fund (when bankAccountId is given) or the shared
// Cash in Hand session balance (when it is not).
async function debitCashPayment(shopId, amount, transaction, bankAccountId = null) {
  if (bankAccountId) {
    const cashAcc = await findTargetBankAccount(shopId, transaction, bankAccountId);
    if (!cashAcc) {
      const err = new Error('Cash account not found');
      err.statusCode = 400;
      throw err;
    }
    if (cashAcc.kind !== 'cash') {
      const err = new Error('Selected account is not a cash account');
      err.statusCode = 400;
      throw err;
    }
    assertBankAvailable(cashAcc, amount);
    await cashAcc.update({
      current_balance: Math.round((parseFloat(cashAcc.current_balance || 0) - parseFloat(amount)) * 100) / 100,
    }, { transaction });
    return cashAcc;
  }
  await assertCashAvailable(shopId, amount, transaction);
  return null;
}

function paymentAccountCode(method, bankAcc) {
  if (method === 'bank') return bankAccountCode(bankAcc);
  return bankAcc ? bankAccountCode(bankAcc) : '05-CASH';
}

async function creditBankAccount(shopId, amount, transaction, bankAccountId = null) {
  const bankAcc = await findTargetBankAccount(shopId, transaction, bankAccountId);
  // Throws rather than returning null, matching debitBankAccount. Silently
  // no-oping here left the caller free to post the GL line against the shared
  // '05-BANK' fallback while no BankAccount row was ever updated — so the
  // ledger and BankAccount.current_balance diverged permanently, with nothing
  // to signal it had happened.
  if (!bankAcc) {
    const err = new Error('No active bank account found for this shop');
    err.statusCode = 400;
    throw err;
  }
  if (bankAcc.kind !== 'bank') {
    const err = new Error('Selected account is not a bank account');
    err.statusCode = 400;
    throw err;
  }
  await bankAcc.update({
    current_balance: Math.round((parseFloat(bankAcc.current_balance || 0) + parseFloat(amount)) * 100) / 100,
  }, { transaction });
  return bankAcc;
}

async function creditCashPayment(shopId, amount, transaction, bankAccountId) {
  const cashAcc = await findTargetBankAccount(shopId, transaction, bankAccountId);
  if (!cashAcc) {
    const err = new Error('Cash account not found');
    err.statusCode = 400;
    throw err;
  }
  if (cashAcc.kind !== 'cash') {
    const err = new Error('Selected account is not a cash account');
    err.statusCode = 400;
    throw err;
  }
  await cashAcc.update({
    current_balance: Math.round((parseFloat(cashAcc.current_balance || 0) + parseFloat(amount)) * 100) / 100,
  }, { transaction });
  return cashAcc;
}

// Resolves the GL account code a bank account should post against — its own
// linked sub-account when one exists, falling back to the shared aggregate
// code for any row that predates the per-account linking migration.
function bankAccountCode(bankAcc) {
  return bankAcc?.ChartOfAccount?.account_code || '05-BANK';
}

module.exports = {
  computeLiveCash, computeTotalCashOnHand, computeCashFlow, resolveOpeningCash, ensureTodaySession,
  assertCashAvailable, assertBankAvailable,
  debitBankAccount, debitCashPayment, creditBankAccount, creditCashPayment, bankAccountCode, paymentAccountCode,
};
