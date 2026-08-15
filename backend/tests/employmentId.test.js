'use strict';

/**
 * Employment ID allocation.
 *
 * An employee attached to a mine carrying a location abbreviation is issued
 * EMP-KHW-0007 instead of EMP-<shopId>-0007. The shop is still the owning
 * tenant on the row — it just stops being the visible part of the ID.
 *
 * The rule that matters most, and the one these tests exist to protect: the
 * trailing number is a SINGLE running sequence per shop, shared by every
 * prefix. A shop using two abbreviations issues EMP-KHW-0006, EMP-STH-0007,
 * EMP-3-0008 — the count never restarts per prefix ("no mixing up of them",
 * confirmed with the user).
 *
 * Same rolled-back-transaction pattern as attendance.test.js.
 */

const db = require('../models');
const { nextEmploymentId, reissueEmploymentId } = require('../utils/employmentId');

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

// A throwaway shop of its own, so the sequence assertions below are about rows
// this test created and nothing else — the real shops already hold employees.
async function makeShop(transaction) {
  const shop = await db.Shop.create({
    name: `__empid_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  }, { transaction });
  return shop;
}

async function makeMine(shopId, name, abbr, transaction) {
  return db.Branch.create({
    shop_id: shopId, name, location_abbr: abbr, status: 'active',
  }, { transaction });
}

async function addEmployee(shopId, branchId, employmentId, transaction) {
  return db.Employee.create({
    shop_id: shopId,
    branch_id: branchId,
    name: `__emp_${Math.random().toString(36).slice(2, 8)}`,
    employment_id: employmentId,
    basic_salary: 1000,
    status: 'active',
  }, { transaction });
}

describe('employment id allocation', () => {
  maybe('uses the mine’s abbreviation as the visible prefix', async () => {
    const t = await db.sequelize.transaction();
    try {
      const shop = await makeShop(t);
      const mine = await makeMine(shop.id, 'Khewra', 'KHW', t);
      await addEmployee(shop.id, mine.id, `EMP-${shop.id}-0001`, t);

      const next = await nextEmploymentId(shop.id, 'KHW', t);
      expect(next).toBe('EMP-KHW-0002');
    } finally {
      await t.rollback();
    }
  });

  maybe('falls back to the shop id when no abbreviation is given', async () => {
    const t = await db.sequelize.transaction();
    try {
      const shop = await makeShop(t);
      const mine = await makeMine(shop.id, 'Unnamed', null, t);
      await addEmployee(shop.id, mine.id, `EMP-${shop.id}-0001`, t);

      expect(await nextEmploymentId(shop.id, '', t)).toBe(`EMP-${shop.id}-0002`);
      expect(await nextEmploymentId(shop.id, null, t)).toBe(`EMP-${shop.id}-0002`);
    } finally {
      await t.rollback();
    }
  });

  // The core guarantee: switching prefix must never restart the numbering.
  maybe('keeps ONE running sequence across mixed prefixes', async () => {
    const t = await db.sequelize.transaction();
    try {
      const shop = await makeShop(t);
      const khw = await makeMine(shop.id, 'Khewra', 'KHW', t);
      const sth = await makeMine(shop.id, 'Southern', 'STH', t);

      const first = await nextEmploymentId(shop.id, 'KHW', t);
      expect(first).toBe('EMP-KHW-0001');
      await addEmployee(shop.id, khw.id, first, t);

      // Different mine, different prefix — the number must carry on, not reset.
      const second = await nextEmploymentId(shop.id, 'STH', t);
      expect(second).toBe('EMP-STH-0002');
      await addEmployee(shop.id, sth.id, second, t);

      // No abbreviation at all — still the same running sequence.
      const third = await nextEmploymentId(shop.id, '', t);
      expect(third).toBe(`EMP-${shop.id}-0003`);
      await addEmployee(shop.id, khw.id, third, t);

      expect(await nextEmploymentId(shop.id, 'KHW', t)).toBe('EMP-KHW-0004');
    } finally {
      await t.rollback();
    }
  });

  // Regression guard for the old count()+1 logic: with a varying prefix, an
  // exact-string collision check no longer catches a reused number, because
  // EMP-KHW-0002 and EMP-3-0002 are different strings that both mean
  // "employee number 2".
  maybe('does not re-hand-out a number after an employee is deleted', async () => {
    const t = await db.sequelize.transaction();
    try {
      const shop = await makeShop(t);
      const mine = await makeMine(shop.id, 'Khewra', 'KHW', t);
      await makeMine(shop.id, 'Southern', 'STH', t);
      await addEmployee(shop.id, mine.id, 'EMP-KHW-0001', t);
      const second = await addEmployee(shop.id, mine.id, 'EMP-KHW-0002', t);
      await addEmployee(shop.id, mine.id, 'EMP-KHW-0003', t);

      await second.destroy({ transaction: t });

      // Two employees remain, so a count-based sequence would offer 0003 —
      // already taken — and then 0002 under a different prefix.
      expect(await nextEmploymentId(shop.id, 'STH', t)).toBe('EMP-STH-0004');
    } finally {
      await t.rollback();
    }
  });

  // Client-supplied, so it is re-checked against this shop's own mines rather
  // than trusted — otherwise a crafted request could mint an ID under a prefix
  // belonging to another tenant.
  maybe('ignores an abbreviation that no mine in this shop uses', async () => {
    const t = await db.sequelize.transaction();
    try {
      const shop = await makeShop(t);
      await makeMine(shop.id, 'Khewra', 'KHW', t);

      const other = await makeShop(t);
      await makeMine(other.id, 'Elsewhere', 'ZZZ', t);

      // 'ZZZ' exists, but on a different shop — must not be usable here.
      expect(await nextEmploymentId(shop.id, 'ZZZ', t)).toBe(`EMP-${shop.id}-0001`);
      expect(await nextEmploymentId(shop.id, 'NOPE', t)).toBe(`EMP-${shop.id}-0001`);
    } finally {
      await t.rollback();
    }
  });

  maybe('normalises case and strips separators before matching', async () => {
    const t = await db.sequelize.transaction();
    try {
      const shop = await makeShop(t);
      await makeMine(shop.id, 'Khewra', 'KHW', t);

      // A '-' would break where the sequence number starts, so it is stripped
      // rather than passed through.
      expect(await nextEmploymentId(shop.id, 'khw', t)).toBe('EMP-KHW-0001');
      expect(await nextEmploymentId(shop.id, 'k-h-w', t)).toBe('EMP-KHW-0001');
    } finally {
      await t.rollback();
    }
  });
});

// Re-issuing an EXISTING employee's ID. The whole point is that only the
// visible prefix moves — carrying the sequence number across is what keeps
// this from consuming a new number or leaving a hole in the shop's ordering.
describe('re-issuing an existing employment id', () => {
  maybe('swaps the prefix and keeps the sequence number', async () => {
    const t = await db.sequelize.transaction();
    try {
      const shop = await makeShop(t);
      const mine = await makeMine(shop.id, 'Khewra', 'KHW', t);
      await addEmployee(shop.id, mine.id, `EMP-${shop.id}-0002`, t);

      const next = await reissueEmploymentId(shop.id, `EMP-${shop.id}-0002`, 'KHW', t);
      expect(next).toBe('EMP-KHW-0002');
    } finally {
      await t.rollback();
    }
  });

  maybe('goes back to shop numbering when the abbreviation is cleared', async () => {
    const t = await db.sequelize.transaction();
    try {
      const shop = await makeShop(t);
      const mine = await makeMine(shop.id, 'Khewra', 'KHW', t);
      await addEmployee(shop.id, mine.id, 'EMP-KHW-0002', t);

      expect(await reissueEmploymentId(shop.id, 'EMP-KHW-0002', '', t)).toBe(`EMP-${shop.id}-0002`);
    } finally {
      await t.rollback();
    }
  });

  maybe('never allocates a new number, even after other employees are added', async () => {
    const t = await db.sequelize.transaction();
    try {
      const shop = await makeShop(t);
      const mine = await makeMine(shop.id, 'Khewra', 'KHW', t);
      await addEmployee(shop.id, mine.id, `EMP-${shop.id}-0001`, t);
      await addEmployee(shop.id, mine.id, `EMP-${shop.id}-0002`, t);
      await addEmployee(shop.id, mine.id, `EMP-${shop.id}-0003`, t);

      // The first employee keeps 0001 — re-issuing must not push them to 0004.
      expect(await reissueEmploymentId(shop.id, `EMP-${shop.id}-0001`, 'KHW', t)).toBe('EMP-KHW-0001');
      // And the sequence for the NEXT new hire is untouched by any of this.
      expect(await nextEmploymentId(shop.id, 'KHW', t)).toBe('EMP-KHW-0004');
    } finally {
      await t.rollback();
    }
  });

  maybe('is a no-op when the prefix would not actually change', async () => {
    const t = await db.sequelize.transaction();
    try {
      const shop = await makeShop(t);
      const mine = await makeMine(shop.id, 'Khewra', 'KHW', t);
      await addEmployee(shop.id, mine.id, 'EMP-KHW-0002', t);

      expect(await reissueEmploymentId(shop.id, 'EMP-KHW-0002', 'KHW', t)).toBe('EMP-KHW-0002');
    } finally {
      await t.rollback();
    }
  });

  maybe('rejects a re-issue that would collide with another employee', async () => {
    const t = await db.sequelize.transaction();
    try {
      const shop = await makeShop(t);
      const mine = await makeMine(shop.id, 'Khewra', 'KHW', t);
      await addEmployee(shop.id, mine.id, 'EMP-KHW-0002', t);
      await addEmployee(shop.id, mine.id, `EMP-${shop.id}-0002`, t);

      // Both hold number 2 under different prefixes — merging them would
      // violate the unique index, so it has to fail with a real message
      // instead of a raw constraint error out of the save.
      await expect(reissueEmploymentId(shop.id, `EMP-${shop.id}-0002`, 'KHW', t))
        .rejects.toThrow(/already used by/i);
    } finally {
      await t.rollback();
    }
  });

  // No identifiable sequence number to preserve, so rewriting would be
  // guesswork.
  maybe('leaves an unparseable legacy id alone', async () => {
    const t = await db.sequelize.transaction();
    try {
      const shop = await makeShop(t);
      const mine = await makeMine(shop.id, 'Khewra', 'KHW', t);
      await addEmployee(shop.id, mine.id, 'LEGACY-ID', t);

      expect(await reissueEmploymentId(shop.id, 'LEGACY-ID', 'KHW', t)).toBe('LEGACY-ID');
    } finally {
      await t.rollback();
    }
  });
});
