'use strict';

/**
 * A terminated employee must not be able to receive a NEW advance or loan.
 *
 * An advance given here has no path back: runGiveSalary is what auto-clears
 * an advance against a future month's salary, and it already refuses to run
 * for a terminated employee — so a fresh advance would sit as permanent,
 * uncollectable debt. A brand-new loan to someone no longer on staff isn't a
 * routine ledger action either. Both guards mirror the one runGiveSalary
 * already had; new money to/from a terminated employee belongs on the
 * clearance certificate's settlement screen instead (employeeTermination.js).
 *
 * recordAdvance/recordLoan manage their OWN internal transaction (unlike
 * markAttendance/runGiveSalary, which take one) — so this suite can't use the
 * roll-back-everything pattern the other test files use. It builds its own
 * throwaway shop per test instead. Shop creation is the very first thing
 * inside try/finally, and cleanup is keyed off shop_id rather than the
 * branch/employee objects — so even a fixture that fails partway through
 * setup still gets torn down completely. (The first version of this file
 * created the shop BEFORE the try block; a missing required field on the
 * next line threw before cleanup could run, leaving three orphaned shops
 * behind that had to be cleaned up by hand.)
 */

const db = require('../models');
const { recordAdvance, recordLoan } = require('../controllers/employeeLedgerController');

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

async function cleanupShop(shopId) {
  await db.EmployeeTransaction.destroy({ where: { shop_id: shopId } });
  await db.Employee.destroy({ where: { shop_id: shopId } });
  await db.Branch.destroy({ where: { shop_id: shopId } });
  await db.Shop.destroy({ where: { id: shopId } });
}

// A minimal Express req/res pair — just enough for requireShopId (reads
// req.user.shop_id) and for capturing what the handler responds with.
function fakeReqRes(employeeId, shopId, body) {
  const res = { statusCode: 200, body: null };
  res.status = function status(code) { this.statusCode = code; return this; };
  res.json = function json(b) { this.body = b; return this; };
  const req = { params: { id: String(employeeId) }, user: { shop_id: shopId }, body };
  return { req, res };
}

describe('a terminated employee cannot receive new advances or loans', () => {
  maybe('recordAdvance refuses and writes nothing', async () => {
    const shop = await db.Shop.create({
      name: `__ledger_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    });
    try {
      const branch = await db.Branch.create({ shop_id: shop.id, name: '__ledger_test_branch', status: 'active' });
      const employee = await db.Employee.create({
        shop_id: shop.id, branch_id: branch.id, name: '__terminated_test_employee',
        employment_type: 'salary', basic_salary: 30000, status: 'terminated', terminated_at: new Date(),
      });

      const { req, res } = fakeReqRes(employee.id, shop.id, {
        amount: 5000, method: 'cash', for_month: '2099-01', notes: 'should be refused',
      });

      await recordAdvance(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/terminated/i);

      const txns = await db.EmployeeTransaction.findAll({ where: { employee_id: employee.id } });
      expect(txns).toHaveLength(0);
      const fresh = await db.Employee.findByPk(employee.id);
      expect(parseFloat(fresh.current_payable || 0)).toBe(0);
    } finally {
      await cleanupShop(shop.id);
    }
  });

  maybe('recordLoan refuses and writes nothing', async () => {
    const shop = await db.Shop.create({
      name: `__ledger_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    });
    try {
      const branch = await db.Branch.create({ shop_id: shop.id, name: '__ledger_test_branch', status: 'active' });
      const employee = await db.Employee.create({
        shop_id: shop.id, branch_id: branch.id, name: '__terminated_test_employee',
        employment_type: 'salary', basic_salary: 30000, status: 'terminated', terminated_at: new Date(),
      });

      const { req, res } = fakeReqRes(employee.id, shop.id, {
        amount: 5000, method: 'cash', notes: 'should be refused',
      });

      await recordLoan(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/terminated/i);

      const txns = await db.EmployeeTransaction.findAll({ where: { employee_id: employee.id } });
      expect(txns).toHaveLength(0);
      const fresh = await db.Employee.findByPk(employee.id);
      expect(parseFloat(fresh.current_payable || 0)).toBe(0);
    } finally {
      await cleanupShop(shop.id);
    }
  });

  // Sanity check that the guard is specific to 'terminated' status — an
  // active employee must be completely unaffected by it. Doesn't assert the
  // advance actually succeeds (a brand-new throwaway shop has no cash funded
  // in it, so assertCashAvailable would legitimately refuse it for THAT
  // reason) — only that it never gets refused for being "terminated", which
  // is the one thing this guard is responsible for.
  maybe('an active employee is not caught by the same guard', async () => {
    const shop = await db.Shop.create({
      name: `__ledger_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    });
    try {
      const branch = await db.Branch.create({ shop_id: shop.id, name: '__ledger_test_branch', status: 'active' });
      const employee = await db.Employee.create({
        shop_id: shop.id, branch_id: branch.id, name: '__active_test_employee',
        employment_type: 'salary', basic_salary: 30000, status: 'active',
      });

      const { req, res } = fakeReqRes(employee.id, shop.id, {
        amount: 5000, method: 'cash', for_month: '2099-01', notes: 'should not be blocked as terminated',
      });

      await recordAdvance(req, res);

      expect(res.statusCode).not.toBe(0);
      if (res.statusCode >= 400) {
        expect(res.body.message).not.toMatch(/terminated/i);
      }
    } finally {
      await cleanupShop(shop.id);
    }
  });
});
