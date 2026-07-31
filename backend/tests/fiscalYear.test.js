'use strict';

/**
 * Fiscal-year invariants.
 *
 * Everything that writes runs inside a transaction that is ALWAYS rolled back,
 * so this suite is safe against a live database. Read-only checks skip cleanly
 * when no database is reachable, matching accounting.test.js.
 */

const db = require('../models');
const { Op } = require('sequelize');
const {
  sliceHistoryToRange,
  openingBalanceRow,
  ensureFiscalYearCoveringDate,
  assertWritableDate,
  computeEndDate,
  nextFiscalYearStart,
  previousFiscalYearStart,
  alignStartToJuly1,
  fiscalYearLabelFromStart,
  getCurrentFiscalYear,
  toDateOnly,
} = require('../utils/fiscalYear');
const { closeFiscalYear } = require('../services/fiscalYearClose');
const { loadAccounts, aggregateGlByAccount, buildBalanceSheet, buildProfitAndLoss } = require('../utils/financialStatements');
const { computeTotalCashOnHand, computeTotalBank } = require('../utils/cashHelpers');

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

// ── Pure date arithmetic (no database) ──────────────────────────────────────

describe('fiscal year date arithmetic', () => {
  test('a July–June year is derived from any date inside it', () => {
    expect(alignStartToJuly1('2026-08-01')).toBe('2026-07-01');
    expect(alignStartToJuly1('2026-06-30')).toBe('2025-07-01');
    expect(alignStartToJuly1('2026-07-01')).toBe('2026-07-01');
  });

  test('the year ends the day before the next one starts', () => {
    const end = computeEndDate('2026-07-01', 6, 30);
    expect(end).toBe('2027-06-30');
    expect(nextFiscalYearStart(end)).toBe('2027-07-01');
  });

  test('successive years are contiguous with no gap or overlap', () => {
    let start = '2020-07-01';
    for (let i = 0; i < 10; i += 1) {
      const end = computeEndDate(start, 6, 30);
      const next = nextFiscalYearStart(end);
      expect(new Date(next) - new Date(end)).toBe(24 * 60 * 60 * 1000);
      start = next;
    }
  });

  test('labels follow the start year', () => {
    expect(fiscalYearLabelFromStart('2026-07-01')).toBe('FY 2026-27');
    expect(fiscalYearLabelFromStart('2099-07-01')).toBe('FY 2099-00');
  });
});

// ── History slicing (no database) ───────────────────────────────────────────

describe('entity ledger year-scoping', () => {
  const history = [
    { id: 1, date: '2025-08-01', running_balance: 100 },
    { id: 2, date: '2026-02-01', running_balance: 250 },
    { id: 3, date: '2026-09-01', running_balance: 400 },
    { id: 4, date: '2027-01-01', running_balance: 375 },
  ];

  test('the year opens with the balance carried in from before it', () => {
    const { opening, rows } = sliceHistoryToRange(history, { from: '2026-07-01', to: '2027-06-30' });
    expect(opening.running_balance).toBe(250);
    expect(rows.map(r => r.id)).toEqual([3, 4]);
  });

  test('the closing balance of a scoped year equals the unscoped one', () => {
    const { rows } = sliceHistoryToRange(history, { from: '2026-07-01', to: '2027-06-30' });
    expect(rows[rows.length - 1].running_balance).toBe(history[history.length - 1].running_balance);
  });

  test('a year before any activity opens at zero rather than blank', () => {
    const { opening, rows } = sliceHistoryToRange(history, { from: '2024-07-01', to: '2025-06-30' });
    expect(opening.running_balance).toBe(0);
    expect(rows).toEqual([]);
  });

  test('no range means no opening row and nothing is hidden', () => {
    const { opening, rows } = sliceHistoryToRange(history, {});
    expect(opening).toBeNull();
    expect(rows).toHaveLength(history.length);
  });

  test('scoping is lossless — every row belongs to exactly one year', () => {
    const years = [
      { from: '2025-07-01', to: '2026-06-30' },
      { from: '2026-07-01', to: '2027-06-30' },
    ];
    const seen = years.flatMap(y => sliceHistoryToRange(history, y).rows.map(r => r.id));
    expect(seen.sort()).toEqual([1, 2, 3, 4]);
  });

  test('the opening row is marked so the UI never offers to edit it', () => {
    const row = openingBalanceRow({ running_balance: 250 }, '2026-07-01');
    expect(row.is_opening).toBe(true);
    expect(row.type).toBe('opening_balance');
    expect(row.running_balance).toBe(250);
    expect(typeof row.id).toBe('string');
  });

  test('a multi-balance ledger carries every balance forward', () => {
    const keys = ['running_investment', 'running_current_cash', 'running_current_bank'];
    const bod = [
      { id: 1, date: '2026-02-01', running_investment: 500, running_current_cash: 20, running_current_bank: 5 },
      { id: 2, date: '2026-09-01', running_investment: 900, running_current_cash: 40, running_current_bank: 9 },
    ];
    const { opening } = sliceHistoryToRange(bod, { from: '2026-07-01', to: '2027-06-30' }, { balanceKeys: keys });
    expect(opening).toEqual({ running_investment: 500, running_current_cash: 20, running_current_bank: 5 });
  });
});

// ── Against the configured database ─────────────────────────────────────────

async function shopWithOverdueYear(transaction) {
  const today = new Date().toISOString().slice(0, 10);
  const fy = await db.FiscalYear.findOne({
    where: { status: 'open', end_date: { [Op.lt]: today } },
    order: [['end_date', 'ASC']],
    transaction,
  });
  if (!fy) return null;
  const user = await db.User.findOne({ where: { shop_id: fy.shop_id }, attributes: ['id'], raw: true, transaction });
  return user ? { fy, shopId: fy.shop_id, userId: user.id } : null;
}

// A fiscal year built inside the test's own transaction, dated nowhere near any
// real business data, for tests whose assertion is purely structural (does
// closing produce a fresh open successor?) rather than about real numbers.
//
// shopWithOverdueYear above picks whatever real shop happens to have the
// earliest overdue year in the live database — right for the accounting-math
// tests, which want genuine balances to check. But once a shop has real,
// multi-year history, its "next" year after some overdue one may already exist
// and already be closed (a real admin closed it for real), which is a
// perfectly valid state that just isn't what "leaves it open" is testing.
async function makeSyntheticOverdueYear(transaction) {
  const user = await db.User.findOne({ attributes: ['id', 'shop_id'], raw: true, transaction });
  if (!user) return null;
  const fy = await db.FiscalYear.create({
    shop_id: user.shop_id,
    label: 'FY 1901-02 (test fixture)',
    start_date: '1901-07-01',
    end_date: '1902-06-30',
    status: 'open',
  }, { transaction });
  return { fy, shopId: user.shop_id, userId: user.id };
}

describe('year-end close', () => {
  maybe('leaves capital, cash and bank untouched', async () => {
    const t = await db.sequelize.transaction();
    try {
      const target = await shopWithOverdueYear(t);
      if (!target) {
        console.warn('  skipped: no shop with a closable year');
        return;
      }
      const { shopId, fy, userId } = target;

      const before = {
        cash: await computeTotalCashOnHand(shopId),
        bank: await computeTotalBank(shopId),
      };
      const accounts = await loadAccounts(shopId);
      const bsBefore = buildBalanceSheet(accounts, await aggregateGlByAccount(shopId, { asOf: fy.end_date }));

      await closeFiscalYear(shopId, fy.id, userId, { transaction: t });

      // The close moves P&L into equity; it must not create or destroy assets.
      const bsAfter = buildBalanceSheet(accounts, await aggregateGlByAccount(shopId, { asOf: fy.end_date }));
      expect(bsAfter.total_assets).toBeCloseTo(bsBefore.total_assets, 2);
      expect(bsAfter.is_balanced).toBe(true);

      // The regression test for the double-counting opening voucher.
      expect(await computeTotalCashOnHand(shopId)).toBeCloseTo(before.cash, 2);
      expect(await computeTotalBank(shopId)).toBeCloseTo(before.bank, 2);
    } finally {
      await t.rollback();
    }
  });

  maybe('opens the following year and leaves it open', async () => {
    const t = await db.sequelize.transaction();
    try {
      const target = await makeSyntheticOverdueYear(t);
      if (!target) {
        console.warn('  skipped: no shop to attach a fixture year to');
        return;
      }
      const { shopId, fy, userId } = target;
      const result = await closeFiscalYear(shopId, fy.id, userId, { transaction: t });

      expect(result.new_fiscal_year.start_date).toBe(nextFiscalYearStart(fy.end_date));
      const reloaded = await db.FiscalYear.findByPk(fy.id, { transaction: t });
      expect(reloaded.status).toBe('closed');
      const successor = await db.FiscalYear.findByPk(result.new_fiscal_year.id, { transaction: t });
      expect(successor.status).toBe('open');
    } finally {
      await t.rollback();
    }
  });

  maybe("a closed year's profit and loss still reports real figures", async () => {
    const t = await db.sequelize.transaction();
    try {
      const target = await shopWithOverdueYear(t);
      if (!target) {
        console.warn('  skipped: no shop with a closable year');
        return;
      }
      const { shopId, fy, userId } = target;
      const accounts = await loadAccounts(shopId);
      const range = { from: fy.start_date, to: fy.end_date };
      const opts = { excludeVoucherTypes: ['closing'] };
      const before = buildProfitAndLoss(accounts, await aggregateGlByAccount(shopId, range, opts));

      await closeFiscalYear(shopId, fy.id, userId, { transaction: t });

      // The closing voucher is dated inside the period; excluding it is what
      // stops the year reporting zero revenue and zero expenses afterwards.
      const after = buildProfitAndLoss(accounts, await aggregateGlByAccount(shopId, range, opts));
      expect(after.total_income).toBeCloseTo(before.total_income, 2);
      expect(after.total_expenses).toBeCloseTo(before.total_expenses, 2);
    } finally {
      await t.rollback();
    }
  });

  maybe('closing before the year has ended is refused', async () => {
    const t = await db.sequelize.transaction();
    try {
      const today = new Date().toISOString().slice(0, 10);
      const future = await db.FiscalYear.findOne({
        where: { status: 'open', end_date: { [Op.gte]: today } },
        transaction: t,
      });
      if (!future) {
        console.warn('  skipped: no shop with a still-running year');
        return;
      }
      await expect(closeFiscalYear(future.shop_id, future.id, null, { transaction: t }))
        .rejects.toThrow(/only allowed after/i);
    } finally {
      await t.rollback();
    }
  });
});

describe('posting dates', () => {
  maybe('a date past the last year opens the next one instead of failing', async () => {
    const t = await db.sequelize.transaction();
    try {
      const fy = await db.FiscalYear.findOne({ order: [['start_date', 'DESC']], transaction: t });
      if (!fy) {
        console.warn('  skipped: no fiscal years');
        return;
      }
      const dayAfter = nextFiscalYearStart(fy.end_date);
      const opened = await ensureFiscalYearCoveringDate(fy.shop_id, dayAfter, t);
      expect(opened.start_date).toBe(dayAfter);
      expect(opened.status).toBe('open');
    } finally {
      await t.rollback();
    }
  });

  // Back-dating is allowed now — a business entering its history needs it — but
  // only down to the shop's books start date, so a mistyped year is still caught.
  // The floor itself is covered in detail by backdating.test.js.
  maybe('a date far beyond the backdating floor is refused', async () => {
    const t = await db.sequelize.transaction();
    try {
      const fy = await db.FiscalYear.findOne({ order: [['start_date', 'ASC']], transaction: t });
      if (!fy) {
        console.warn('  skipped: no fiscal years');
        return;
      }
      await expect(ensureFiscalYearCoveringDate(fy.shop_id, '1999-01-01', t))
        .rejects.toThrow(/books start date|years back/i);
    } finally {
      await t.rollback();
    }
  });

  maybe('writing into a closed year is refused', async () => {
    const t = await db.sequelize.transaction();
    try {
      const target = await shopWithOverdueYear(t);
      if (!target) {
        console.warn('  skipped: no shop with a closable year');
        return;
      }
      const { shopId, fy } = target;
      await db.FiscalYear.update({ status: 'closed' }, { where: { id: fy.id }, transaction: t });

      const midYear = fy.start_date;
      await expect(assertWritableDate(shopId, midYear, t)).rejects.toThrow(/closed/i);
    } finally {
      await t.rollback();
    }
  });
});

// ── "current" tracks the calendar, not the last transaction ────────────────
//
// Nothing except closing a year used to advance shop.current_fiscal_year_id —
// not even posting into a freshly auto-opened year. So a shop that hadn't
// closed its old year kept showing that year as "current" indefinitely,
// whether or not anything had been posted since it ended. These tests use a
// throwaway synthetic shop (just a name — the Shop model needs nothing else)
// so "does a brand new year get created" can be asserted precisely, without
// depending on whether the live database happens to already have one.
async function makeIsolatedShop(transaction) {
  return db.Shop.create({ name: `__fy_test_shop_${Date.now()}`, setup_completed: true }, { transaction });
}

describe('current fiscal year tracks the calendar', () => {
  maybe('rolls forward and creates the new year on its own, with zero transactions posted', async () => {
    const t = await db.sequelize.transaction();
    try {
      const shop = await makeIsolatedShop(t);
      const yesterday = toDateOnly(new Date(Date.now() - 24 * 3600 * 1000));
      const ended = await db.FiscalYear.create({
        shop_id: shop.id,
        label: 'FY ended (fixture)',
        start_date: '2000-07-01',
        end_date: yesterday,
        status: 'open',
      }, { transaction: t });
      await shop.update({ current_fiscal_year_id: ended.id }, { transaction: t });

      const before = await db.FiscalYear.count({ where: { shop_id: shop.id }, transaction: t });
      const current = await getCurrentFiscalYear(shop.id, t);
      const after = await db.FiscalYear.count({ where: { shop_id: shop.id }, transaction: t });

      expect(after).toBe(before + 1);
      expect(current.id).not.toBe(ended.id);
      const today = toDateOnly(new Date());
      expect(current.start_date <= today && current.end_date >= today).toBe(true);

      // The reads that drive the dropdown, the year-end prompt, and every
      // report/list default all go through this same column.
      await shop.reload({ transaction: t });
      expect(shop.current_fiscal_year_id).toBe(current.id);

      // The old year is left exactly as it was — still open, not silently
      // closed. Closing stays a separate, explicit action.
      await ended.reload({ transaction: t });
      expect(ended.status).toBe('open');
    } finally {
      await t.rollback();
    }
  });

  maybe('is idempotent — asking twice does not create a second new year', async () => {
    const t = await db.sequelize.transaction();
    try {
      const shop = await makeIsolatedShop(t);
      const yesterday = toDateOnly(new Date(Date.now() - 24 * 3600 * 1000));
      const ended = await db.FiscalYear.create({
        shop_id: shop.id,
        label: 'FY ended (fixture)',
        start_date: '2000-07-01',
        end_date: yesterday,
        status: 'open',
      }, { transaction: t });
      await shop.update({ current_fiscal_year_id: ended.id }, { transaction: t });

      const first = await getCurrentFiscalYear(shop.id, t);
      const countAfterFirst = await db.FiscalYear.count({ where: { shop_id: shop.id }, transaction: t });
      const second = await getCurrentFiscalYear(shop.id, t);
      const countAfterSecond = await db.FiscalYear.count({ where: { shop_id: shop.id }, transaction: t });

      expect(second.id).toBe(first.id);
      expect(countAfterSecond).toBe(countAfterFirst);
    } finally {
      await t.rollback();
    }
  });

  maybe('never regresses "current" to an older year', async () => {
    const t = await db.sequelize.transaction();
    try {
      const fy = await db.FiscalYear.findOne({ order: [['start_date', 'DESC']], transaction: t });
      if (!fy) {
        console.warn('  skipped: no fiscal years');
        return;
      }
      const before = await getCurrentFiscalYear(fy.shop_id, t);
      // Opening an EARLIER (backdated) year must not change what "current" is.
      await ensureFiscalYearCoveringDate(fy.shop_id, previousFiscalYearStart(fy.start_date), t);
      const after = await getCurrentFiscalYear(fy.shop_id, t);
      expect(after.id).toBe(before.id);
    } finally {
      await t.rollback();
    }
  });
});

describe('fiscal year data integrity', () => {
  maybe('no two years overlap for the same shop', async () => {
    const [rows] = await db.sequelize.query(`
      SELECT a.shop_id, a.label AS a_label, b.label AS b_label
        FROM fiscal_years a
        JOIN fiscal_years b
          ON b.shop_id = a.shop_id AND b.id <> a.id
         AND a.start_date <= b.end_date AND b.start_date <= a.end_date
    `);
    expect(rows).toEqual([]);
  });

  maybe('every shop with a fiscal year has a current one recorded', async () => {
    const [rows] = await db.sequelize.query(`
      SELECT s.id FROM shops s
       WHERE s.current_fiscal_year_id IS NULL
         AND EXISTS (SELECT 1 FROM fiscal_years f WHERE f.shop_id = s.id AND f.status = 'open')
    `);
    // Repaired by migration 20260814000000; this guards against regressing it.
    expect(rows).toEqual([]);
  });
});
