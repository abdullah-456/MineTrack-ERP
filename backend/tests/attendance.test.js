'use strict';

/**
 * Attendance marking, and the absence-based payroll deduction it feeds:
 * monthly salary / real-days-in-that-month * absent (and optionally leave)
 * days, folded into giveSalary's existing deduction total.
 *
 * Everything that writes runs inside a transaction that is ALWAYS rolled back,
 * following the pattern in fiscalYear.test.js / backdating.test.js, made
 * possible because both markAttendance and runGiveSalary were refactored to
 * take an explicit transaction (mirroring closeFiscalYear) rather than
 * managing and committing their own — the same trap documented in the code
 * comments there.
 *
 * Tests run against a throwaway employee created on a real shop (not a real
 * one), dated in the month before this one — safely in the past regardless of
 * where in the month "today" falls, and impossible to collide with real data.
 */

const db = require('../models');
const { markAttendance, getAttendanceSummaryForMonth, buildMonthGrid } = require('../controllers/attendanceController');
const { runGiveSalary } = require('../controllers/employeeLedgerController');

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

// The month before this one — always fully in the past no matter which day of
// the current month "today" is, so no test date can accidentally land in the
// future and get rejected by the future-date guard.
function lastMonth() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

async function makeIsolatedEmployee(transaction) {
  const shop = await db.Shop.findOne({ where: { setup_completed: true }, transaction, raw: true });
  if (!shop) return null;
  const branch = await db.Branch.findOne({ where: { shop_id: shop.id }, transaction, raw: true });
  if (!branch) return null;
  const user = await db.User.findOne({ where: { shop_id: shop.id }, attributes: ['id'], transaction, raw: true });
  if (!user) return null;

  const employee = await db.Employee.create({
    shop_id: shop.id,
    branch_id: branch.id,
    name: `__attendance_test_employee_${Date.now()}`,
    basic_salary: 30000,
    status: 'active',
  }, { transaction });

  return { shopId: shop.id, userId: user.id, employee };
}

describe('marking attendance', () => {
  maybe('bulk-marks the roster and re-marking the same day updates rather than duplicates', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, employee } = setup;
      const date = `${lastMonth()}-03`;

      const first = await markAttendance(shopId, userId, date, [{ employee_id: employee.id, status: 'absent' }], t);
      expect(first.marked).toBe(1);

      await markAttendance(shopId, userId, date, [{ employee_id: employee.id, status: 'present' }], t);
      const rows = await db.Attendance.findAll({ where: { employee_id: employee.id, date }, transaction: t });
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('present');
    } finally {
      await t.rollback();
    }
  });

  maybe('rejects marking a future date', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, employee } = setup;
      const future = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10);

      await expect(markAttendance(shopId, userId, future, [{ employee_id: employee.id, status: 'present' }], t))
        .rejects.toThrow(/future/i);
    } finally {
      await t.rollback();
    }
  });

  maybe('rejects an entry for an employee outside the shop', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId } = setup;
      const otherEmployee = await db.Employee.findOne({ where: { shop_id: { [db.Sequelize.Op.ne]: shopId } }, transaction: t, raw: true });
      if (!otherEmployee) { console.warn('  skipped: only one shop has employees'); return; }

      await expect(markAttendance(shopId, userId, `${lastMonth()}-03`, [{ employee_id: otherEmployee.id, status: 'present' }], t))
        .rejects.toThrow(/not found for this shop/i);
    } finally {
      await t.rollback();
    }
  });

  // Regression: getMonth used to key its `days` object by the full date
  // string ("2026-08-05") while the frontend's month grid looks entries up by
  // day-of-month only ("05") — every lookup silently missed, so a freshly
  // fetched grid (including the one shown right after Save) rendered as if
  // nothing had ever been marked, even though the rows were saved correctly.
  maybe('the month grid is keyed by day-of-month, matching what the frontend looks up', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, employee } = setup;
      const month = lastMonth();

      await markAttendance(shopId, userId, `${month}-05`, [{ employee_id: employee.id, status: 'absent' }], t);
      await markAttendance(shopId, userId, `${month}-14`, [{ employee_id: employee.id, status: 'leave' }], t);

      const grid = await buildMonthGrid(shopId, month, null, t);
      const row = grid.employees.find(e => e.id === employee.id);

      expect(row.days['05']).toEqual({ status: 'absent', notes: null });
      expect(row.days['14']).toEqual({ status: 'leave', notes: null });
      // The bug's exact symptom: a full-date key would sit alongside the
      // 2-digit ones and never be looked up by the frontend at all.
      expect(Object.keys(row.days).every(k => /^\d{2}$/.test(k))).toBe(true);
    } finally {
      await t.rollback();
    }
  });

  maybe('the monthly summary counts exactly what was marked', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, employee } = setup;
      const month = lastMonth();

      for (const [day, status] of [['02', 'present'], ['03', 'absent'], ['04', 'absent'], ['05', 'leave']]) {
        // eslint-disable-next-line no-await-in-loop
        await markAttendance(shopId, userId, `${month}-${day}`, [{ employee_id: employee.id, status }], t);
      }

      const summary = await getAttendanceSummaryForMonth(shopId, employee.id, month, t);
      expect(summary.present_days).toBe(1);
      expect(summary.absent_days).toBe(2);
      expect(summary.leave_days).toBe(1);
      expect(summary.marked_days).toBe(4);
    } finally {
      await t.rollback();
    }
  });
});

describe('absence-based payroll deduction', () => {
  maybe('deducts exactly dailyRate × absentDays, using real days in that month', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, employee } = setup;
      const month = lastMonth();
      const [year, mon] = month.split('-').map(Number);
      const daysInMonth = new Date(year, mon, 0).getDate();
      const dailyRate = 30000 / daysInMonth;

      const absentDays = ['03', '04', '05', '10', '11', '17', '24'];
      for (const day of absentDays) {
        // eslint-disable-next-line no-await-in-loop
        await markAttendance(shopId, userId, `${month}-${day}`, [{ employee_id: employee.id, status: 'absent' }], t);
      }

      const result = await runGiveSalary(shopId, userId, employee.id, {
        month, bonus: 0, tax_deduction_percent: 0, method: 'cash', deduct_for_absence: true,
      }, t);

      expect(result.payroll.absent_days).toBe(absentDays.length);
      expect(parseFloat(result.payroll.attendance_deduction)).toBeCloseTo(dailyRate * absentDays.length, 2);
      expect(parseFloat(result.payroll.net_pay)).toBeCloseTo(30000 - dailyRate * absentDays.length, 2);

      // The voucher this posts must still balance — the expense leg has to
      // drop by the same attendance deduction, or debits stop matching credits
      // the moment any absence deduction applies.
      const voucher = await db.Voucher.findOne({ where: { shop_id: shopId }, order: [['id', 'DESC']], transaction: t });
      const lines = await db.GeneralLedger.findAll({ where: { voucher_id: voucher.id }, transaction: t, raw: true });
      const debit = lines.reduce((s, l) => s + parseFloat(l.debit || 0), 0);
      const credit = lines.reduce((s, l) => s + parseFloat(l.credit || 0), 0);
      expect(debit).toBeCloseTo(credit, 2);
    } finally {
      await t.rollback();
    }
  });

  maybe('with count_leave_as_absence, leave days are included too', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, employee } = setup;
      const month = lastMonth();
      const [year, mon] = month.split('-').map(Number);
      const dailyRate = 30000 / new Date(year, mon, 0).getDate();

      await markAttendance(shopId, userId, `${month}-03`, [{ employee_id: employee.id, status: 'absent' }], t);
      await markAttendance(shopId, userId, `${month}-04`, [{ employee_id: employee.id, status: 'leave' }], t);

      const result = await runGiveSalary(shopId, userId, employee.id, {
        month, bonus: 0, tax_deduction_percent: 0, method: 'cash',
        deduct_for_absence: true, count_leave_as_absence: true,
      }, t);

      expect(result.payroll.absent_days).toBe(1);
      expect(result.payroll.leave_days).toBe(1);
      expect(parseFloat(result.payroll.attendance_deduction)).toBeCloseTo(dailyRate * 2, 2);
    } finally {
      await t.rollback();
    }
  });

  maybe('with no attendance marked, the deduction is zero — a true no-op', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, employee } = setup;

      const result = await runGiveSalary(shopId, userId, employee.id, {
        month: lastMonth(), bonus: 0, tax_deduction_percent: 0, method: 'cash', deduct_for_absence: true,
      }, t);

      expect(parseFloat(result.payroll.attendance_deduction)).toBe(0);
      expect(parseFloat(result.payroll.net_pay)).toBeCloseTo(30000, 2);
    } finally {
      await t.rollback();
    }
  });

  maybe('without the flag, behaviour is unchanged even with absences marked — regression guard', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, employee } = setup;
      const month = lastMonth();

      for (const day of ['03', '04', '05']) {
        // eslint-disable-next-line no-await-in-loop
        await markAttendance(shopId, userId, `${month}-${day}`, [{ employee_id: employee.id, status: 'absent' }], t);
      }

      const result = await runGiveSalary(shopId, userId, employee.id, {
        month, bonus: 0, tax_deduction_percent: 0, method: 'cash',
      }, t);

      expect(parseFloat(result.payroll.attendance_deduction)).toBe(0);
      expect(result.payroll.absent_days).toBe(0);
      expect(parseFloat(result.payroll.net_pay)).toBeCloseTo(30000, 2);
    } finally {
      await t.rollback();
    }
  });

  maybe('a backdated salary run posts its voucher on that same date, not today', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, employee } = setup;
      const month = lastMonth();
      const payDate = `${month}-20`;

      const result = await runGiveSalary(shopId, userId, employee.id, {
        month, bonus: 0, tax_deduction_percent: 0, method: 'cash', date: payDate,
      }, t);

      const payoutTxn = await db.EmployeeTransaction.findByPk(result.transaction_id, { transaction: t });
      expect(new Date(payoutTxn.date).toISOString().slice(0, 10)).toBe(payDate);

      const voucher = await db.Voucher.findOne({ where: { shop_id: shopId }, order: [['id', 'DESC']], transaction: t });
      expect(String(voucher.voucher_date).slice(0, 10)).toBe(payDate);
    } finally {
      await t.rollback();
    }
  });

  maybe('net pay still cannot go negative once attendance deduction is included', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, employee } = setup;
      const month = lastMonth();
      const [year, mon] = month.split('-').map(Number);
      const daysInMonth = new Date(year, mon, 0).getDate();

      // Every day absent deducts the whole month's salary exactly (never
      // more, since there are no more days than that to be absent for) — so
      // pairing it with a tax deduction is what's needed to genuinely push
      // net pay negative and prove the existing guard still holds.
      for (let day = 1; day <= daysInMonth; day += 1) {
        // eslint-disable-next-line no-await-in-loop
        await markAttendance(shopId, userId, `${month}-${String(day).padStart(2, '0')}`,
          [{ employee_id: employee.id, status: 'absent' }], t);
      }

      await expect(runGiveSalary(shopId, userId, employee.id, {
        month, bonus: 0, tax_deduction_percent: 10, method: 'cash', deduct_for_absence: true,
      }, t)).rejects.toThrow(/exceed/i);
    } finally {
      await t.rollback();
    }
  });
});
