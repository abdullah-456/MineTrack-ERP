'use strict';

/**
 * Attendance marking, and the two payroll paths it feeds:
 *  - the absence deduction for SALARIED employees:
 *    monthly salary / a FIXED 26 days × absent (and optionally leave) days,
 *    folded into giveSalary's existing deduction total;
 *  - the base pay for DAILY-WAGE employees: daily_wage × paid days, where
 *    present/half day/short leave each count as a full day.
 *
 * Plus the truck-loading commission that both pay types can have added on top.
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
const { calculateCommissionForMonth } = require('../controllers/truckLoadingController');
const { getCommissionSituation } = require('../utils/commissionHelpers');
const { SALARY_DAYS_PER_MONTH } = require('../utils/attendanceStatus');

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

// One calendar month after the given 'YYYY-MM' — used to test something that
// spans two consecutive payroll runs (e.g. commission deferred in one month,
// paid off in the next) without ever landing in the future.
function monthAfter(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

// `overrides` lets a test create a daily-wage employee instead of the default
// salaried one, without a second near-identical helper.
async function makeIsolatedEmployee(transaction, overrides = {}) {
  const shop = await db.Shop.findOne({ where: { setup_completed: true }, transaction, raw: true });
  if (!shop) return null;
  const branch = await db.Branch.findOne({ where: { shop_id: shop.id }, transaction, raw: true });
  if (!branch) return null;
  const user = await db.User.findOne({ where: { shop_id: shop.id }, attributes: ['id'], transaction, raw: true });
  if (!user) return null;

  const employee = await db.Employee.create({
    shop_id: shop.id,
    branch_id: branch.id,
    name: `__attendance_test_employee_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    employment_type: 'salary',
    basic_salary: 30000,
    status: 'active',
    ...overrides,
  }, { transaction });

  return { shopId: shop.id, userId: user.id, branchId: branch.id, employee };
}

// A truck commission log for one mine/month.
//
// `days` maps a date to either a plain truck count or { trucks, tons }.
// `employees.list` entries carry their own rates — that's where the rate lives
// now, since two people on the same mine can be on different terms. Omitting a
// rate on an entry falls back to the log-level default in `employees.rate` /
// `employees.tonRate`, mirroring what the controller does.
// `credited_days`: undefined/null means "every day logged", an array pins them.
async function makeTruckLoadingLog(shopId, mineId, month, days, employees, transaction) {
  const log = await db.TruckLoadingLog.create({
    shop_id: shopId, mine_id: mineId, month,
    rate: employees.rate ?? 0,
    ton_rate: employees.tonRate ?? 0,
  }, { transaction });
  await db.TruckLoadingDay.bulkCreate(
    Object.entries(days).map(([date, v]) => ({
      log_id: log.id,
      date,
      trucks: typeof v === 'object' ? (v.trucks || 0) : v,
      tons: typeof v === 'object' ? (v.tons || 0) : 0,
    })),
    { transaction },
  );
  await db.TruckLoadingEmployee.bulkCreate(
    (employees.list || []).map(e => {
      const truckRate = e.truck_rate ?? employees.rate ?? 0;
      const tonRate = e.ton_rate ?? employees.tonRate ?? 0;
      return {
        log_id: log.id,
        employee_id: e.employee_id,
        credited_days: e.credited_days ?? null,
        truck_rate_enabled: e.truck_rate_enabled ?? truckRate > 0,
        truck_rate: truckRate,
        ton_rate_enabled: e.ton_rate_enabled ?? tonRate > 0,
        ton_rate: tonRate,
      };
    }),
    { transaction },
  );
  return log;
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

      // Matched on the fields this test is about rather than the whole object:
      // buildMonthGrid also carries `shift` per day, and asserting deep
      // equality made an unrelated field addition look like a grid-keying bug.
      expect(row.days['05']).toMatchObject({ status: 'absent', notes: null });
      expect(row.days['14']).toMatchObject({ status: 'leave', notes: null });
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
  maybe('deducts exactly dailyRate × absentDays, using the FIXED 26-day divisor', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, employee } = setup;
      const month = lastMonth();
      // Deliberately NOT new Date(year, mon, 0).getDate(): the divisor is a
      // fixed 26 regardless of how long the month is, so the same absence costs
      // the same fraction of salary in February as in August.
      const dailyRate = 30000 / SALARY_DAYS_PER_MONTH;

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
      const dailyRate = 30000 / SALARY_DAYS_PER_MONTH;

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

      // With the fixed 26-day divisor, being absent every calendar day of a
      // 28–31 day month already deducts MORE than the month's salary — the
      // guard has to reject that outright.
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

describe('half day / short leave', () => {
  maybe('are accepted as statuses and counted in their own summary buckets', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, employee } = setup;
      const month = lastMonth();

      for (const [day, status] of [['02', 'present'], ['03', 'half_day'], ['04', 'short_leave'], ['05', 'absent']]) {
        // eslint-disable-next-line no-await-in-loop
        await markAttendance(shopId, userId, `${month}-${day}`, [{ employee_id: employee.id, status }], t);
      }

      const summary = await getAttendanceSummaryForMonth(shopId, employee.id, month, t);
      expect(summary.present_days).toBe(1);
      expect(summary.half_day_days).toBe(1);
      expect(summary.short_leave_days).toBe(1);
      expect(summary.absent_days).toBe(1);
      // present + half day + short leave all count as a full paid day; absent
      // earns nothing.
      expect(summary.paid_days).toBe(3);
    } finally {
      await t.rollback();
    }
  });

  // The business decision, worth pinning: for a SALARIED employee these two
  // statuses are informational only and must never move the deduction.
  maybe('never affect a salaried employee’s absence deduction', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, employee } = setup;
      const month = lastMonth();

      await markAttendance(shopId, userId, `${month}-03`, [{ employee_id: employee.id, status: 'half_day' }], t);
      await markAttendance(shopId, userId, `${month}-04`, [{ employee_id: employee.id, status: 'short_leave' }], t);

      const result = await runGiveSalary(shopId, userId, employee.id, {
        month, bonus: 0, tax_deduction_percent: 0, method: 'cash',
        deduct_for_absence: true, count_leave_as_absence: true,
      }, t);

      expect(parseFloat(result.payroll.attendance_deduction)).toBe(0);
      expect(parseFloat(result.payroll.net_pay)).toBeCloseTo(30000, 2);
    } finally {
      await t.rollback();
    }
  });
});

describe('daily-wage pay', () => {
  maybe('pays daily_wage × paid days, snapshotting both onto the payroll row', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t, {
        employment_type: 'daily_wage', basic_salary: null, daily_wage: 1200,
      });
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, employee } = setup;
      const month = lastMonth();

      // 3 paid days (present + half day + short leave), 2 unpaid (absent, leave).
      for (const [day, status] of [
        ['02', 'present'], ['03', 'half_day'], ['04', 'short_leave'], ['05', 'absent'], ['06', 'leave'],
      ]) {
        // eslint-disable-next-line no-await-in-loop
        await markAttendance(shopId, userId, `${month}-${day}`, [{ employee_id: employee.id, status }], t);
      }

      const result = await runGiveSalary(shopId, userId, employee.id, {
        month, bonus: 0, tax_deduction_percent: 0, method: 'cash',
      }, t);

      expect(result.payroll.employment_type).toBe('daily_wage');
      expect(parseFloat(result.payroll.wage_days_paid)).toBe(3);
      expect(parseFloat(result.payroll.daily_wage_rate)).toBe(1200);
      expect(parseFloat(result.payroll.basic_salary)).toBeCloseTo(3600, 2);
      expect(parseFloat(result.payroll.net_pay)).toBeCloseTo(3600, 2);
    } finally {
      await t.rollback();
    }
  });

  // Their base pay already excludes unworked days — deducting again would
  // penalize the same absence twice.
  maybe('skips the absence deduction even when the flag is on', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t, {
        employment_type: 'daily_wage', basic_salary: null, daily_wage: 1000,
      });
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, employee } = setup;
      const month = lastMonth();

      await markAttendance(shopId, userId, `${month}-02`, [{ employee_id: employee.id, status: 'present' }], t);
      await markAttendance(shopId, userId, `${month}-03`, [{ employee_id: employee.id, status: 'absent' }], t);

      const result = await runGiveSalary(shopId, userId, employee.id, {
        month, bonus: 0, tax_deduction_percent: 0, method: 'cash',
        deduct_for_absence: true, count_leave_as_absence: true,
      }, t);

      expect(parseFloat(result.payroll.attendance_deduction)).toBe(0);
      expect(result.payroll.absent_days).toBe(0);
      expect(parseFloat(result.payroll.net_pay)).toBeCloseTo(1000, 2);
    } finally {
      await t.rollback();
    }
  });

  maybe('a salaried run leaves the wage snapshot fields at zero — regression guard', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, employee } = setup;

      const result = await runGiveSalary(shopId, userId, employee.id, {
        month: lastMonth(), bonus: 0, tax_deduction_percent: 0, method: 'cash',
      }, t);

      expect(result.payroll.employment_type).toBe('salary');
      expect(parseFloat(result.payroll.wage_days_paid)).toBe(0);
      expect(parseFloat(result.payroll.daily_wage_rate)).toBe(0);
      expect(parseFloat(result.payroll.basic_salary)).toBeCloseTo(30000, 2);
    } finally {
      await t.rollback();
    }
  });
});

describe('truck-loading commission', () => {
  maybe('sums trucks × that month’s rate, and pays the FULL amount to each eligible employee', async () => {
    const t = await db.sequelize.transaction();
    try {
      const a = await makeIsolatedEmployee(t);
      if (!a) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const b = await makeIsolatedEmployee(t);
      const { shopId, branchId } = a;
      const month = lastMonth();

      await makeTruckLoadingLog(shopId, branchId, month,
        { [`${month}-02`]: 10, [`${month}-03`]: 15 },
        { rate: 50, list: [{ employee_id: a.employee.id }, { employee_id: b.employee.id }] },
        t);

      const forA = await calculateCommissionForMonth(shopId, a.employee.id, month, t);
      const forB = await calculateCommissionForMonth(shopId, b.employee.id, month, t);

      // 25 trucks × 50 = 1250 — each, NOT 625 each. This is the split-vs-full
      // decision; if it ever silently changes, this is what catches it.
      expect(forA.amount).toBeCloseTo(1250, 2);
      expect(forB.amount).toBeCloseTo(1250, 2);
    } finally {
      await t.rollback();
    }
  });

  maybe('credits only an employee’s own days when they have an explicit day list', async () => {
    const t = await db.sequelize.transaction();
    try {
      const a = await makeIsolatedEmployee(t);
      if (!a) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const b = await makeIsolatedEmployee(t);
      const { shopId, branchId } = a;
      const month = lastMonth();

      await makeTruckLoadingLog(shopId, branchId, month,
        { [`${month}-02`]: 10, [`${month}-03`]: 15, [`${month}-04`]: 5 },
        {
          rate: 100,
          list: [
            // null → every logged day, including any added later.
            { employee_id: a.employee.id, credited_days: null },
            // Joined mid-month: only these two days count for them.
            { employee_id: b.employee.id, credited_days: [`${month}-03`, `${month}-04`] },
          ],
        },
        t);

      const forA = await calculateCommissionForMonth(shopId, a.employee.id, month, t);
      const forB = await calculateCommissionForMonth(shopId, b.employee.id, month, t);

      expect(forA.amount).toBeCloseTo(30 * 100, 2); // all three days
      expect(forB.amount).toBeCloseTo(20 * 100, 2); // 15 + 5 only
    } finally {
      await t.rollback();
    }
  });

  maybe('is added to gross pay and snapshotted onto the payroll row only when asked for', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, branchId, employee } = setup;
      const month = lastMonth();

      await makeTruckLoadingLog(shopId, branchId, month,
        { [`${month}-02`]: 20 },
        { rate: 25, list: [{ employee_id: employee.id }] },
        t);

      const withCommission = await runGiveSalary(shopId, userId, employee.id, {
        month, bonus: 0, tax_deduction_percent: 0, method: 'cash', commission_action: 'pay',
      }, t);

      expect(parseFloat(withCommission.payroll.commission)).toBeCloseTo(500, 2);
      expect(withCommission.payroll.commission_note).toMatch(/20t × 25/);
      expect(parseFloat(withCommission.payroll.net_pay)).toBeCloseTo(30500, 2);

      // Same log, a different employee, without the flag — nothing added.
      const other = await makeIsolatedEmployee(t);
      const noCommission = await runGiveSalary(shopId, userId, other.employee.id, {
        month, bonus: 0, tax_deduction_percent: 0, method: 'cash',
      }, t);
      expect(parseFloat(noCommission.payroll.commission)).toBe(0);
      expect(parseFloat(noCommission.payroll.net_pay)).toBeCloseTo(30000, 2);
    } finally {
      await t.rollback();
    }
  });

  // The postponement feature: a month's commission that isn't paid must not
  // be lost — it has to still be there, combined with whatever the FOLLOWING
  // month earns, the next time the company can afford to pay it.
  maybe('a deferred month’s commission carries forward and combines with the next month’s', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, branchId, employee } = setup;
      const monthA = lastMonth();
      const monthB = monthAfter(monthA);

      await makeTruckLoadingLog(shopId, branchId, monthA,
        { [`${monthA}-02`]: 10 }, // 10 trucks × 25 = 250
        { rate: 25, list: [{ employee_id: employee.id }] }, t);
      await makeTruckLoadingLog(shopId, branchId, monthB,
        { [`${monthB}-02`]: 12 }, // 12 trucks × 25 = 300
        { rate: 25, list: [{ employee_id: employee.id }] }, t);

      // Month A: out of budget — give salary, but postpone the commission.
      const runA = await runGiveSalary(shopId, userId, employee.id, {
        month: monthA, bonus: 0, tax_deduction_percent: 0, method: 'cash', commission_action: 'defer',
      }, t);
      expect(parseFloat(runA.payroll.commission)).toBe(0);
      expect(parseFloat(runA.payroll.net_pay)).toBeCloseTo(30000, 2); // basic only, nothing added

      const deferredRow = await db.EmployeeCommission.findOne({
        where: { employee_id: employee.id, earned_month: monthA }, transaction: t,
      });
      expect(deferredRow).not.toBeNull();
      expect(deferredRow.status).toBe('deferred');
      expect(parseFloat(deferredRow.amount)).toBeCloseTo(250, 2);

      // Between the two runs: the preview for month B must show BOTH figures,
      // separately, and the combined total — this is what the Give Salary
      // modal itself reads to render "current" vs "carried".
      const situation = await getCommissionSituation(shopId, employee.id, monthB, t);
      expect(situation.current.amount).toBeCloseTo(300, 2);
      expect(situation.carried).toHaveLength(1);
      expect(situation.carried[0].month).toBe(monthA);
      expect(situation.carried[0].amount).toBeCloseTo(250, 2);
      expect(situation.total_amount).toBeCloseTo(550, 2);

      // Month B: now pay it — both A's postponed 250 and B's fresh 300 land
      // on the SAME payslip, combined.
      const runB = await runGiveSalary(shopId, userId, employee.id, {
        month: monthB, bonus: 0, tax_deduction_percent: 0, method: 'cash', commission_action: 'pay',
      }, t);
      expect(parseFloat(runB.payroll.commission)).toBeCloseTo(550, 2);
      expect(runB.payroll.commission_note).toMatch(/10t × 25/); // B's own breakdown
      expect(runB.payroll.commission_note).toMatch(new RegExp(`\\[${monthA} carried\\]`)); // A's, labelled
      expect(parseFloat(runB.payroll.net_pay)).toBeCloseTo(30550, 2);

      // The deferred row from month A is now resolved — never counted again.
      const resolved = await db.EmployeeCommission.findByPk(deferredRow.id, { transaction: t });
      expect(resolved.status).toBe('paid');
      expect(resolved.paid_payroll_id).toBe(runB.payroll.id);
      expect(resolved.paid_month).toBe(monthB);

      const nothingLeftOwed = await getCommissionSituation(shopId, employee.id, monthAfter(monthB), t);
      expect(nothingLeftOwed.carried).toHaveLength(0);
    } finally {
      await t.rollback();
    }
  });

  // Deferring must be idempotent per month: opening the Give Salary modal,
  // deferring, then somehow triggering the same defer action again for the
  // SAME month must not create a second row that would double-count the
  // amount once it's eventually paid.
  maybe('deferring the same month twice does not create a duplicate', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, branchId, employee } = setup;
      const month = lastMonth();

      await makeTruckLoadingLog(shopId, branchId, month,
        { [`${month}-02`]: 5 }, { rate: 25, list: [{ employee_id: employee.id }] }, t);

      const { deferCommission } = require('../utils/commissionHelpers');
      const first = await deferCommission(shopId, employee.id, month, userId, t);
      expect(first).not.toBeNull();
      const second = await deferCommission(shopId, employee.id, month, userId, t);
      expect(second).toBeNull(); // no-op — a row already exists for this month

      const rows = await db.EmployeeCommission.findAll({
        where: { employee_id: employee.id, earned_month: month }, transaction: t,
      });
      expect(rows).toHaveLength(1);
    } finally {
      await t.rollback();
    }
  });

  // Rates are snapshotted onto the employee's row precisely so this can't happen.
  maybe('editing the log’s default rate does not change an already-paid month', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, branchId, employee } = setup;
      const month = lastMonth();

      const log = await makeTruckLoadingLog(shopId, branchId, month,
        { [`${month}-02`]: 10 },
        { rate: 30, list: [{ employee_id: employee.id }] },
        t);

      const result = await runGiveSalary(shopId, userId, employee.id, {
        month, bonus: 0, tax_deduction_percent: 0, method: 'cash', commission_action: 'pay',
      }, t);
      expect(parseFloat(result.payroll.commission)).toBeCloseTo(300, 2);

      await log.update({ rate: 999 }, { transaction: t });
      const reread = await db.Payroll.findByPk(result.payroll.id, { transaction: t });
      expect(parseFloat(reread.commission)).toBeCloseTo(300, 2);
    } finally {
      await t.rollback();
    }
  });

  maybe('adds the per-ton basis on top of the per-truck one when both are enabled', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, branchId, employee } = setup;
      const month = lastMonth();

      await makeTruckLoadingLog(shopId, branchId, month,
        {
          [`${month}-02`]: { trucks: 10, tons: 120.5 },
          [`${month}-03`]: { trucks: 4, tons: 40 },
        },
        {
          list: [{
            employee_id: employee.id,
            truck_rate_enabled: true, truck_rate: 50,
            ton_rate_enabled: true, ton_rate: 8,
          }],
        },
        t);

      const c = await calculateCommissionForMonth(shopId, employee.id, month, t);
      // 14 trucks × 50 = 700, plus 160.5 tons × 8 = 1284 → 1984 stacked.
      expect(c.amount).toBeCloseTo(1984, 2);
      expect(c.breakdown[0].trucks).toBe(14);
      expect(c.breakdown[0].tons).toBeCloseTo(160.5, 3);
    } finally {
      await t.rollback();
    }
  });

  maybe('pays only the enabled basis when one of the two is switched off', async () => {
    const t = await db.sequelize.transaction();
    try {
      const a = await makeIsolatedEmployee(t);
      if (!a) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const b = await makeIsolatedEmployee(t);
      const { shopId, branchId } = a;
      const month = lastMonth();

      await makeTruckLoadingLog(shopId, branchId, month,
        { [`${month}-02`]: { trucks: 10, tons: 100 } },
        {
          list: [
            // Truck basis only — the ton rate is present but switched off, and
            // must contribute nothing.
            {
              employee_id: a.employee.id,
              truck_rate_enabled: true, truck_rate: 50,
              ton_rate_enabled: false, ton_rate: 8,
            },
            // Ton basis only.
            {
              employee_id: b.employee.id,
              truck_rate_enabled: false, truck_rate: 50,
              ton_rate_enabled: true, ton_rate: 8,
            },
          ],
        },
        t);

      expect((await calculateCommissionForMonth(shopId, a.employee.id, month, t)).amount).toBeCloseTo(500, 2);
      expect((await calculateCommissionForMonth(shopId, b.employee.id, month, t)).amount).toBeCloseTo(800, 2);
    } finally {
      await t.rollback();
    }
  });

  // Two people, same mine, same month, different terms — the whole reason the
  // rate moved off the log and onto the employee row.
  maybe('lets two employees on the same log earn at different rates', async () => {
    const t = await db.sequelize.transaction();
    try {
      const a = await makeIsolatedEmployee(t);
      if (!a) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const b = await makeIsolatedEmployee(t);
      const { shopId, branchId } = a;
      const month = lastMonth();

      await makeTruckLoadingLog(shopId, branchId, month,
        { [`${month}-02`]: { trucks: 10, tons: 0 } },
        {
          list: [
            { employee_id: a.employee.id, truck_rate_enabled: true, truck_rate: 50 },
            { employee_id: b.employee.id, truck_rate_enabled: true, truck_rate: 120 },
          ],
        },
        t);

      expect((await calculateCommissionForMonth(shopId, a.employee.id, month, t)).amount).toBeCloseTo(500, 2);
      expect((await calculateCommissionForMonth(shopId, b.employee.id, month, t)).amount).toBeCloseTo(1200, 2);
    } finally {
      await t.rollback();
    }
  });

  maybe('credited days gate tons as well as trucks', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, branchId, employee } = setup;
      const month = lastMonth();

      await makeTruckLoadingLog(shopId, branchId, month,
        {
          [`${month}-02`]: { trucks: 10, tons: 100 },
          [`${month}-03`]: { trucks: 5, tons: 50 },
        },
        {
          list: [{
            employee_id: employee.id,
            credited_days: [`${month}-03`], // joined mid-month
            truck_rate_enabled: true, truck_rate: 10,
            ton_rate_enabled: true, ton_rate: 2,
          }],
        },
        t);

      const c = await calculateCommissionForMonth(shopId, employee.id, month, t);
      // Only the 3rd counts: 5 × 10 + 50 × 2 = 150. Not 15 × 10 + 150 × 2.
      expect(c.amount).toBeCloseTo(150, 2);
    } finally {
      await t.rollback();
    }
  });
});

describe('employee commission defaults', () => {
  // The profile flags are a DEFAULT, not a hard gate (confirmed with the user):
  // resolveEmployeeRates pre-fills from the profile, and an explicit value sent
  // from the Truck Commission page wins over it.
  maybe('pre-fill an employee’s row, and the page can still override them', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t, {
        commission_per_truck_enabled: true, commission_per_truck: 75,
        commission_per_ton_enabled: false, commission_per_ton: null,
      });
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, branchId, employee } = setup;
      const month = lastMonth();

      const reread = await db.Employee.findByPk(employee.id, { transaction: t });
      expect(reread.commission_per_truck_enabled).toBe(true);
      expect(parseFloat(reread.commission_per_truck)).toBe(75);

      // Row created with the profile default for trucks, but with the ton basis
      // switched ON for this mine/month even though the profile has it off.
      await makeTruckLoadingLog(shopId, branchId, month,
        { [`${month}-02`]: { trucks: 4, tons: 10 } },
        {
          list: [{
            employee_id: employee.id,
            truck_rate_enabled: true, truck_rate: 75,
            ton_rate_enabled: true, ton_rate: 20,
          }],
        },
        t);

      const c = await calculateCommissionForMonth(shopId, employee.id, month, t);
      expect(c.amount).toBeCloseTo(4 * 75 + 10 * 20, 2);
    } finally {
      await t.rollback();
    }
  });
});

describe('temporary allowance label', () => {
  maybe('is stored alongside the amount, trimmed and capped at 60 characters', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, employee } = setup;

      const result = await runGiveSalary(shopId, userId, employee.id, {
        month: lastMonth(), bonus: 0, tax_deduction_percent: 0, method: 'cash',
        temp_allowance: 5000, temp_allowance_label: `  ${'E'.repeat(80)}  `,
      }, t);

      expect(parseFloat(result.payroll.temp_allowance)).toBeCloseTo(5000, 2);
      expect(result.payroll.temp_allowance_label).toHaveLength(60);
    } finally {
      await t.rollback();
    }
  });

  // A label with no amount behind it would print a named line item worth
  // nothing on the payslip.
  maybe('is dropped when the allowance amount is zero', async () => {
    const t = await db.sequelize.transaction();
    try {
      const setup = await makeIsolatedEmployee(t);
      if (!setup) { console.warn('  skipped: no shop to attach a test employee to'); return; }
      const { shopId, userId, employee } = setup;

      const result = await runGiveSalary(shopId, userId, employee.id, {
        month: lastMonth(), bonus: 0, tax_deduction_percent: 0, method: 'cash',
        temp_allowance: 0, temp_allowance_label: 'Eid Bonus',
      }, t);

      expect(result.payroll.temp_allowance_label).toBeNull();
    } finally {
      await t.rollback();
    }
  });
});
