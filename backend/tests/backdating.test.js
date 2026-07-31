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

async function anyShopWithYears(transaction) {
  const fy = await db.FiscalYear.findOne({ order: [['start_date', 'ASC']], transaction });
  return fy ? fy.shop_id : null;
}

describe('back-dating opens the years it needs', () => {
  maybe('a date in the previous year opens that year', async () => {
    const t = await db.sequelize.transaction();
    try {
      const shopId = await anyShopWithYears(t);
      if (!shopId) {
        console.warn('  skipped: no fiscal years');
        return;
      }
      const earliest = await db.FiscalYear.findOne({
        where: { shop_id: shopId }, order: [['start_date', 'ASC']], transaction: t,
      });
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
      const shopId = await anyShopWithYears(t);
      if (!shopId) {
        console.warn('  skipped: no fiscal years');
        return;
      }
      const earliest = await db.FiscalYear.findOne({
        where: { shop_id: shopId }, order: [['start_date', 'ASC']], transaction: t,
      });
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
      const shopId = await anyShopWithYears(t);
      if (!shopId) {
        console.warn('  skipped: no fiscal years');
        return;
      }
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
      const shopId = await anyShopWithYears(t);
      if (!shopId) {
        console.warn('  skipped: no fiscal years');
        return;
      }
      await db.Shop.update({ books_start_date: '2024-07-01' }, { where: { id: shopId }, transaction: t });
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
      const shopId = await anyShopWithYears(t);
      if (!shopId) {
        console.warn('  skipped: no fiscal years');
        return;
      }
      const user = await db.User.findOne({ where: { shop_id: shopId }, attributes: ['id'], raw: true, transaction: t });
      if (!user) {
        console.warn('  skipped: shop has no users');
        return;
      }
      const earliest = await db.FiscalYear.findOne({
        where: { shop_id: shopId }, order: [['start_date', 'ASC']], transaction: t,
      });
      // Mid-way through the year before the shop's first — squarely back-dated.
      const target = previousFiscalYearStart(earliest.start_date);

      const { postVoucher } = require('../utils/postVoucher');
      const voucher = await postVoucher(shopId, {
        type: 'journal',
        date: target,
        narration: 'backdating check',
        createdBy: user.id,
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
      const shopId = await anyShopWithYears(t);
      if (!shopId) {
        console.warn('  skipped: no fiscal years');
        return;
      }
      const fy = await db.FiscalYear.findOne({
        where: { shop_id: shopId }, order: [['start_date', 'ASC']], transaction: t,
      });
      await db.FiscalYear.update({ status: 'closed' }, { where: { id: fy.id }, transaction: t });

      const { assertWritableDate } = require('../utils/fiscalYear');
      await expect(assertWritableDate(shopId, fy.start_date, t)).rejects.toThrow(/closed/i);
    } finally {
      await t.rollback();
    }
  });
});
