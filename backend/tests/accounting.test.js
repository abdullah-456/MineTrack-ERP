'use strict';

/**
 * Accounting invariant suite.
 *
 * Two layers:
 *   1. Pure-function regression tests for the arithmetic bugs fixed in the audit
 *      — these need no database and always run.
 *   2. Invariants checked against whatever data is in the configured database
 *      (every voucher balances, trial balance ties, assets = liabilities +
 *      equity, entity balances reconcile with the ledger). These skip cleanly if
 *      no database is reachable, so `npm test` is safe on any machine.
 *
 * Point DB_NAME at a scratch database before running against real data.
 */

const { computeEmployeeBalances } = require('../utils/employeeBalances');
const { parseTransactionDate } = require('../utils/transactionDate');

// ── Layer 1: pure arithmetic ────────────────────────────────────────────────

// Mirrors the netting in saleController.create.
function applySaleAdvance(balance, total, payAmount) {
  const available = Math.max(0, -balance);
  const advanceApplied = Math.round(Math.min(available, Math.max(0, total - payAmount)) * 100) / 100;
  const arDebit = Math.round((total - payAmount - advanceApplied) * 100) / 100;
  const newBalance = Math.round((balance + total - payAmount) * 100) / 100;
  const voucherDebits = payAmount + advanceApplied + Math.max(0, arDebit);
  return { advanceApplied, arDebit, newBalance, voucherDebits };
}

// Mirrors the flooring in saleReturnController.create.
function applyReturnCredit(returnedValue, outstanding) {
  const creditApplied = Math.max(0, Math.min(returnedValue, outstanding));
  return { creditApplied, cashRefund: Math.round((returnedValue - creditApplied) * 100) / 100 };
}

describe('sale — customer advance is netted against what was just paid', () => {
  test('customer with credit paying in full: credit untouched, voucher balances', () => {
    const r = applySaleAdvance(-500, 1000, 1000);
    expect(r.advanceApplied).toBe(0);
    expect(r.arDebit).toBe(0);
    expect(r.newBalance).toBe(-500);
    expect(r.voucherDebits).toBeCloseTo(1000, 2); // == sales credit
  });

  test('customer with credit paying part: only the shortfall consumes credit', () => {
    const r = applySaleAdvance(-500, 1000, 600);
    expect(r.advanceApplied).toBe(400);
    expect(r.newBalance).toBe(-100);
    expect(r.voucherDebits).toBeCloseTo(1000, 2);
  });

  test('AR leg is never negative, so the voucher can always balance', () => {
    for (const [bal, total, pay] of [[-500, 1000, 1000], [-5000, 100, 100], [-1, 2, 2], [0, 500, 500]]) {
      const r = applySaleAdvance(bal, total, pay);
      expect(r.arDebit).toBeGreaterThanOrEqual(0);
      expect(r.voucherDebits).toBeCloseTo(total, 2);
    }
  });

  test('plain credit sale still books the full amount to receivables', () => {
    const r = applySaleAdvance(0, 1000, 0);
    expect(r.arDebit).toBe(1000);
    expect(r.newBalance).toBe(1000);
  });
});

describe('return — credit applied is floored at zero', () => {
  test('customer already holding credit is refunded exactly the return value', () => {
    const r = applyReturnCredit(500, -200);
    expect(r.creditApplied).toBe(0);
    expect(r.cashRefund).toBe(500);
  });

  test('customer owing money has it offset first', () => {
    const r = applyReturnCredit(500, 300);
    expect(r.creditApplied).toBe(300);
    expect(r.cashRefund).toBe(200);
  });

  test('refund never exceeds the value returned', () => {
    for (const outstanding of [-1000, -1, 0, 250, 10000]) {
      const r = applyReturnCredit(500, outstanding);
      expect(r.cashRefund).toBeLessThanOrEqual(500);
      expect(r.cashRefund).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('employee balances — one debt cannot appear in two buckets', () => {
  test('an unrepaid loan is a loan receivable, not a salary overpayment', () => {
    const b = computeEmployeeBalances({ current_payable: -1000 }, [{ type: 'loan_given', amount: 1000 }]);
    expect(b.loan_receivable).toBe(1000);
    expect(b.salary_receivable).toBe(0);
  });

  test('an uncleared advance is an advance, not a salary overpayment', () => {
    const b = computeEmployeeBalances(
      { current_payable: -500 },
      [{ type: 'advance_given', amount: 500, cleared: false }],
    );
    expect(b.advance_pending).toBe(500);
    expect(b.salary_receivable).toBe(0);
  });

  test('a genuine salary overpayment is still reported', () => {
    const b = computeEmployeeBalances({ current_payable: -750 }, []);
    expect(b.salary_receivable).toBe(750);
    expect(b.loan_receivable).toBe(0);
  });

  test('salary owed and a loan outstanding are reported independently', () => {
    const b = computeEmployeeBalances({ current_payable: 1000 }, [{ type: 'loan_given', amount: 1000 }]);
    expect(b.salary_payable).toBe(2000);
    expect(b.loan_receivable).toBe(1000);
  });

  test('an advance cleared through payroll leaves nothing outstanding', () => {
    const b = computeEmployeeBalances(
      { current_payable: 0 },
      [{ type: 'advance_given', amount: 1000, cleared: true }],
    );
    expect(b.salary_receivable).toBe(0);
    expect(b.advance_pending).toBe(0);
    expect(b.has_outstanding).toBe(false);
  });
});

describe('transaction dates', () => {
  test('backdating is allowed', () => {
    const d = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    expect(parseTransactionDate(d.toISOString()).getTime()).toBe(d.getTime());
  });

  test('future dates are rejected', () => {
    const future = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();
    expect(() => parseTransactionDate(future)).toThrow(/future/i);
  });

  test('an absent date defaults to now', () => {
    expect(parseTransactionDate(undefined)).toBeInstanceOf(Date);
  });

  test('an unparseable date is rejected', () => {
    expect(() => parseTransactionDate('not-a-date')).toThrow(/valid date/i);
  });
});

// ── Layer 2: invariants against the configured database ─────────────────────

const db = require('../models');
const {
  aggregateGlByAccount, loadAccounts, buildTrialBalance, buildBalanceSheet,
} = require('../utils/financialStatements');

let dbAvailable = false;
beforeAll(async () => {
  try {
    await db.sequelize.authenticate();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
});
afterAll(async () => {
  if (dbAvailable) await db.sequelize.close();
});

const maybe = (name, fn) => test(name, async () => {
  if (!dbAvailable) {
    console.warn(`  skipped (no database): ${name}`);
    return;
  }
  await fn();
});

describe('ledger invariants', () => {
  maybe('every posted voucher has equal debits and credits', async () => {
    const [rows] = await db.sequelize.query(`
      SELECT voucher_id, SUM(debit) AS d, SUM(credit) AS c
        FROM general_ledger GROUP BY voucher_id
      HAVING ABS(SUM(debit) - SUM(credit)) > 0.01
    `);
    expect(rows).toEqual([]);
  });

  maybe('no general_ledger row is orphaned from its voucher', async () => {
    const [rows] = await db.sequelize.query(`
      SELECT gl.id FROM general_ledger gl
       LEFT JOIN vouchers v ON v.id = gl.voucher_id
       WHERE v.id IS NULL
    `);
    expect(rows).toEqual([]);
  });

  maybe('voucher numbers are unique within each shop', async () => {
    const [rows] = await db.sequelize.query(`
      SELECT shop_id, voucher_number FROM vouchers
       WHERE voucher_number IS NOT NULL
       GROUP BY shop_id, voucher_number HAVING COUNT(*) > 1
    `);
    expect(rows).toEqual([]);
  });

  maybe('trial balance ties and the balance sheet balances, for every shop', async () => {
    const shops = await db.Shop.findAll({ attributes: ['id'], raw: true });
    const asOf = new Date().toISOString().slice(0, 10);

    for (const shop of shops) {
      const accounts = await loadAccounts(shop.id);
      const balanceMap = await aggregateGlByAccount(shop.id, { asOf });
      if (!Object.keys(balanceMap).length) continue;

      const tb = buildTrialBalance(accounts, balanceMap);
      expect({ shop: shop.id, balanced: tb.is_balanced }).toEqual({ shop: shop.id, balanced: true });

      const bs = buildBalanceSheet(accounts, balanceMap);
      expect({ shop: shop.id, balanced: bs.is_balanced }).toEqual({ shop: shop.id, balanced: true });
    }
  });

  maybe('director capital is classified as equity, never as a liability', async () => {
    const [rows] = await db.sequelize.query(`
      SELECT account_code, account_type FROM chart_of_accounts
       WHERE account_code LIKE '03-BOD%' AND account_type <> 'equity'
    `);
    expect(rows).toEqual([]);
  });

  maybe('customer balances reconcile with their transaction history', async () => {
    // advance_applied carries a sign of 0: it records credit being consumed,
    // which the sale_charge on the same invoice already accounts for.
    const [rows] = await db.sequelize.query(`
      SELECT c.id, c.current_balance, COALESCE(SUM(
               CASE ct.type
                 WHEN 'sale_charge'      THEN  ct.amount
                 WHEN 'opening_balance'  THEN  ct.amount
                 WHEN 'adjustment'       THEN  ct.amount
                 WHEN 'payment_received' THEN -ct.amount
                 WHEN 'return_credit'    THEN -ct.amount
                 ELSE 0 END), 0) AS replayed
        FROM customers c
        LEFT JOIN customer_transactions ct ON ct.customer_id = c.id
       GROUP BY c.id, c.current_balance
      HAVING ABS(COALESCE(c.current_balance, 0) - COALESCE(SUM(
               CASE ct.type
                 WHEN 'sale_charge'      THEN  ct.amount
                 WHEN 'opening_balance'  THEN  ct.amount
                 WHEN 'adjustment'       THEN  ct.amount
                 WHEN 'payment_received' THEN -ct.amount
                 WHEN 'return_credit'    THEN -ct.amount
                 ELSE 0 END), 0)) > 0.01
    `);
    expect(rows).toEqual([]);
  });
});
