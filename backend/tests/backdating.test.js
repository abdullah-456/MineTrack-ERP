'use strict';

/**
 * Entering history: a transaction must land on the day the user typed, in the
 * fiscal year that day belongs to.
 *
 * The reported bug: sales entered with a June and a March date both showed in
 * the current ledger stamped today, because saleController hardcoded
 * `sale_date: new Date()` and never read the value the form sent.
 *
 * Anything that writes runs inside a transaction that is ALWAYS rolled back.
 */

const db = require('../models');
const { toBusinessDate, parseTransactionDate } = require('../utils/transactionDate');
const {
  ensureFiscalYearCoveringDate,
  toDateOnly,
  previousFiscalYearStart,
  computeEndDate,
  nextFiscalYearStart,
  fiscalYearLabelFromStart,
} = require('../utils/fiscalYear');

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

// ── The timezone trap (no database) ─────────────────────────────────────────

describe('a business date is a calendar day, not an instant', () => {
  // The regression: the database runs UTC and the shop runs UTC+5, so an entry
  // made at 02:00 local resolved to the PREVIOUS day once read back — putting a
  // 1 July sale in the fiscal year that had just ended.
  test('an early-morning entry keeps the day the user typed', () => {
    expect(toBusinessDate('2026-07-01T02:00').toISOString()).toBe('2026-07-01T12:00:00.000Z');
    expect(toDateOnly('2026-07-01T02:00')).toBe('2026-07-01');
  });

  test('a late-night entry does not roll forward either', () => {
    expect(toDateOnly('2026-06-30T23:30')).toBe('2026-06-30');
  });

  test('a plain date string is never reinterpreted through a timezone', () => {
    expect(toBusinessDate('2026-03-15').toISOString()).toBe('2026-03-15T12:00:00.000Z');
  });

  test('midday anchoring leaves 12 hours of margin on both sides', () => {
    // Whatever the offset, the stored instant is far enough from midnight that
    // no timezone on earth reads a different calendar day.
    const d = toBusinessDate('2026-03-15');
    expect(d.getUTCHours()).toBe(12);
    expect(d.getUTCMinutes()).toBe(0);
  });

  test('the calendar day survives a round trip through a Date', () => {
    for (const iso of ['2026-01-01T00:30', '2026-12-31T23:59', '2026-06-30T22:00']) {
      const first = toBusinessDate(iso);
      expect(toBusinessDate(first).toISOString()).toBe(first.toISOString());
    }
  });

  test('an invalid date is still rejected', () => {
    expect(toBusinessDate('not-a-date')).toBeNull();
    expect(() => parseTransactionDate('not-a-date')).toThrow(/valid date/i);
  });

  test('future dates are still rejected', () => {
    const future = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();
    expect(() => parseTransactionDate(future)).toThrow(/future/i);
  });
});

describe('stepping between fiscal years', () => {
  test('the previous year starts exactly one year earlier', () => {
    expect(previousFiscalYearStart('2026-07-01')).toBe('2025-07-01');
  });

  test('a predecessor ends the day before its successor begins', () => {
    const prevStart = previousFiscalYearStart('2026-07-01');
    expect(nextFiscalYearStart(computeEndDate(prevStart, 6, 30))).toBe('2026-07-01');
  });

  test('walking back and forward returns to the same year', () => {
    let start = '2026-07-01';
    for (let i = 0; i < 5; i += 1) start = previousFiscalYearStart(start);
    for (let i = 0; i < 5; i += 1) start = nextFiscalYearStart(computeEndDate(start, 6, 30));
    expect(start).toBe('2026-07-01');
  });
});

// ── Against the configured database ─────────────────────────────────────────
//
// These tests used to pick "any shop with fiscal years" out of the live dev
// database (db.FiscalYear.findOne({ order: [['start_date', 'ASC']] }) — the
// globally earliest fiscal year row, whichever shop that happened to belong
// to) and walk backward from whatever it found. That worked until it didn't:
// the 5-year default backdating floor (backdateFloor() in utils/fiscalYear.js)
// is computed relative to REAL wall-clock "today", so as actual time passed,
// the picked shop's earliest year eventually became too old to safely walk
// two years further back from — and separately, once the shared dev database
// accumulated a fiscal year that happened to already cover a test's target
// date, ensureFiscalYearCoveringDate correctly returned that existing year
// immediately instead of ever reaching the floor-check code the test meant to
// exercise. Neither was a product bug: the floor was doing its job, and
// returning an existing covering year without re-validating it against a
// books_start_date set AFTER it already existed is correct — retroactively
// invalidating a fiscal year that may already carry postings would be
// actively dangerous. The tests' assumption (their picked shop's data would
// always still be young enough / never already cover the target) was what
// broke as real time and the shared database moved on regardless of them.
//
// Fixed by building each test's own throwaway shop and fiscal year, anchored
// a small, fixed distance from whatever "today" is AT TEST RUN TIME rather
// than relying on the shared database's accumulated state. That removes both
// failure modes at once: there is no pre-existing data to accidentally cover
// a target date, and every date used stays a safe margin inside the 5-year
// floor no matter how much real time has passed since these tests were
// written or how long they keep running into the future.

let shopSeq = 0;

// A throwaway shop of its own, mirroring employmentId.test.js's makeShop —
// only this test's own assertions ever touch it, so it can't collide with
// real shop data or with any other test file's fixtures.
async function makeIsolatedShop(transaction, { booksStartDate = null } = {}) {
  shopSeq += 1;
  const tag = `${Date.now()}_${shopSeq}_${Math.random().toString(36).slice(2, 7)}`;
  const shop = await db.Shop.create({
    name: `__backdating_test_${tag}`,
    books_start_date: booksStartDate,
  }, { transaction });
  // role_id 2 ('admin') is a seeded, shared system row — safe to reference,
  // never created or deleted by any test.
  const user = await db.User.create({
    name: 'Backdating Test User',
    email: `__backdating_${tag}@test.local`,
    password_hash: 'not-a-real-hash',
    role_id: 2,
    shop_id: shop.id,
  }, { transaction });
  return { shopId: shop.id, userId: user.id };
}

// Seeds exactly one fiscal year, anchored `yearsAgo` years before whatever
// "today" is when the suite actually runs — never a hardcoded calendar date —
// so the tests that walk further back from it stay comfortably inside the
// 5-year default floor regardless of when this file is executed.
async function seedFiscalYear(shopId, yearsAgo, transaction) {
  const start = `${new Date().getUTCFullYear() - yearsAgo}-07-01`;
  const fy = await db.FiscalYear.create({
    shop_id: shopId,
    label: fiscalYearLabelFromStart(start),
    start_date: start,
    end_date: computeEndDate(start, 6, 30),
    status: 'open',
  }, { transaction });
  return fy;
}

describe('back-dating opens the years it needs', () => {
  maybe('a date in the previous year opens that year', async () => {
    const t = await db.sequelize.transaction();
    try {
      const { shopId } = await makeIsolatedShop(t);
      const earliest = await seedFiscalYear(shopId, 1, t);
      // A day inside the year immediately before the shop's first one.
      const target = previousFiscalYearStart(earliest.start_date);

      const opened = await ensureFiscalYearCoveringDate(shopId, target, t);
      expect(opened.start_date).toBe(target);
      expect(opened.status).toBe('open');
      expect(nextFiscalYearStart(opened.end_date)).toBe(earliest.start_date);
    } finally {
      await t.rollback();
    }
  });

  maybe('predecessors are contiguous — no gap, no overlap', async () => {
    const t = await db.sequelize.transaction();
    try {
      const { shopId } = await makeIsolatedShop(t);
      const earliest = await seedFiscalYear(shopId, 1, t);
      // Two years back, so the walk has to create more than one.
      const target = previousFiscalYearStart(previousFiscalYearStart(earliest.start_date));
      await ensureFiscalYearCoveringDate(shopId, target, t);

      const years = await db.FiscalYear.findAll({
        where: { shop_id: shopId }, order: [['start_date', 'ASC']], transaction: t, raw: true,
      });
      for (let i = 1; i < years.length; i += 1) {
        expect(nextFiscalYearStart(years[i - 1].end_date)).toBe(years[i].start_date);
      }
    } finally {
      await t.rollback();
    }
  });

  maybe('a date past the backdating floor is refused and creates nothing', async () => {
    const t = await db.sequelize.transaction();
    try {
      const { shopId } = await makeIsolatedShop(t);
      await seedFiscalYear(shopId, 1, t);
      const before = await db.FiscalYear.count({ where: { shop_id: shopId }, transaction: t });
      await expect(ensureFiscalYearCoveringDate(shopId, '2010-01-01', t))
        .rejects.toThrow(/books start date|years back/i);
      const after = await db.FiscalYear.count({ where: { shop_id: shopId }, transaction: t });
      expect(after).toBe(before);
    } finally {
      await t.rollback();
    }
  });

  maybe('an explicit books start date overrides the default floor', async () => {
    const t = await db.sequelize.transaction();
    try {
      // No fiscal year seeded covering the target date on purpose: the point
      // of this test is that the FLOOR rejects the date, which only happens
      // when ensureFiscalYearCoveringDate has to walk backward for it in the
      // first place — an already-covering year would return early instead
      // and never reach the floor check at all.
      const { shopId } = await makeIsolatedShop(t, { booksStartDate: '2024-07-01' });
      await seedFiscalYear(shopId, 1, t);
      await expect(ensureFiscalYearCoveringDate(shopId, '2024-01-01', t))
        .rejects.toThrow(/books start date \(2024-07-01\)/i);
    } finally {
      await t.rollback();
    }
  });
});

describe('a back-dated posting lands in the right year', () => {
  maybe('the voucher carries the typed day and the matching fiscal year', async () => {
    const t = await db.sequelize.transaction();
    try {
      const { shopId, userId } = await makeIsolatedShop(t);
      const earliest = await seedFiscalYear(shopId, 1, t);
      // Mid-way through the year before the shop's first — squarely back-dated.
      const target = previousFiscalYearStart(earliest.start_date);

      const { postVoucher } = require('../utils/postVoucher');
      const voucher = await postVoucher(shopId, {
        type: 'journal',
        date: target,
        narration: 'backdating check',
        createdBy: userId,
        lines: [{ accountCode: '05-CASH', debit: 1 }, { accountCode: '01-OBE', credit: 1 }],
      }, t);

      expect(toDateOnly(voucher.voucher_date)).toBe(target);

      const fy = await db.FiscalYear.findByPk(voucher.fiscal_year_id, { transaction: t });
      expect(fy.start_date <= target && fy.end_date >= target).toBe(true);
      expect(fy.id).not.toBe(earliest.id);

      // The ledger line must carry the same day, not today.
      const gl = await db.GeneralLedger.findOne({
        where: { voucher_id: voucher.id }, transaction: t,
      });
      expect(toDateOnly(gl.entry_date)).toBe(target);
    } finally {
      await t.rollback();
    }
  });

  maybe('posting into a closed year is still refused', async () => {
    const t = await db.sequelize.transaction();
    try {
      const { shopId } = await makeIsolatedShop(t);
      const fy = await seedFiscalYear(shopId, 1, t);
      await db.FiscalYear.update({ status: 'closed' }, { where: { id: fy.id }, transaction: t });

      const { assertWritableDate } = require('../utils/fiscalYear');
      await expect(assertWritableDate(shopId, fy.start_date, t)).rejects.toThrow(/closed/i);
    } finally {
      await t.rollback();
    }
  });
});
