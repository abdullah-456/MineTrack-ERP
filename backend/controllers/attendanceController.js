const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId, resolveBranchId } = require('../utils/shopScope');
const { toBusinessDate, parseTransactionDate } = require('../utils/transactionDate');
const { getHolidayDatesForMonth } = require('../utils/holidayHelpers');

// Marking attendance for tomorrow makes no sense — you can't already know
// someone was present on a day that hasn't happened. Reuses the same 24h
// skew tolerance every other dated write in the app uses (parseTransactionDate),
// so a shop just past midnight in a timezone ahead of the server isn't blocked
// from marking today.
function assertNotFuture(dateOnly) {
  const today = toBusinessDate(new Date()).toISOString().slice(0, 10);
  if (dateOnly > today) {
    const e = new Error('Cannot mark attendance for a future date');
    e.statusCode = 400;
    throw e;
  }
}

function parseDateParam(value, fieldName) {
  const d = toBusinessDate(value);
  if (!d) {
    const e = new Error(`${fieldName} is not a valid date`);
    e.statusCode = 400;
    throw e;
  }
  return d.toISOString().slice(0, 10);
}

// ── GET /attendance?date=&branch_id= ─────────────────────────────────────────
// One day's roster: every active employee in scope, joined with that day's
// attendance row. An employee with no row yet reads as status: null (not
// "absent") — the grid needs to tell "not marked" apart from "marked absent".
exports.getDay = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const date = parseDateParam(req.query.date || new Date(), 'date');
    const branchId = req.query.branch_id ? parseInt(req.query.branch_id, 10) : resolveBranchId(req);

    const empWhere = { shop_id: shopId, status: 'active' };
    if (branchId) empWhere.branch_id = branchId;

    const employees = await db.Employee.findAll({
      where: empWhere,
      attributes: ['id', 'name', 'designation', 'employment_id', 'branch_id', 'shift'],
      include: [{ model: db.Branch, attributes: ['id', 'name'] }],
      order: [['name', 'ASC']],
    });

    const marks = await db.Attendance.findAll({
      where: { shop_id: shopId, date, employee_id: { [Op.in]: employees.map(e => e.id) } },
      raw: true,
    });
    const byEmployee = {};
    marks.forEach(m => { byEmployee[m.employee_id] = m; });

    return res.json({
      date,
      employees: employees.map(e => ({
        id: e.id,
        name: e.name,
        designation: e.designation,
        employment_id: e.employment_id,
        branch: e.Branch ? { id: e.Branch.id, name: e.Branch.name } : null,
        status: byEmployee[e.id]?.status || null,
        notes: byEmployee[e.id]?.notes || null,
        attendance_id: byEmployee[e.id]?.id || null,
        // Falls back to the employee's default shift when the day hasn't been
        // marked yet, so the Today view can pre-fill a sensible value.
        shift: byEmployee[e.id]?.shift || e.shift || null,
        overtime_hours: byEmployee[e.id]?.overtime_hours != null ? parseFloat(byEmployee[e.id].overtime_hours) : 0,
      })),
    });
  } catch (error) {
    console.error('getAttendanceDay error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── GET /attendance/month?month=YYYY-MM&branch_id= ──────────────────────────
// The whole roster crossed with every day of the month — one query, so the
// month grid doesn't fetch a day at a time.
//
// Core logic takes an explicit (optional) transaction, same reasoning as
// markAttendance/runGiveSalary — it's what lets a test mark attendance and
// read it back inside one transaction that then rolls back cleanly, rather
// than needing a real commit to verify a read endpoint.
async function buildMonthGrid(shopId, month, branchId, transaction) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    const e = new Error('month is required in YYYY-MM format');
    e.statusCode = 400;
    throw e;
  }

  const empWhere = { shop_id: shopId, status: 'active' };
  if (branchId) empWhere.branch_id = branchId;
  const employees = await db.Employee.findAll({
    where: empWhere,
    attributes: ['id', 'name', 'designation', 'employment_id'],
    order: [['name', 'ASC']],
    transaction,
  });

  const [year, mon] = month.split('-').map(Number);
  const from = `${month}-01`;
  const to = `${month}-${String(new Date(year, mon, 0).getDate()).padStart(2, '0')}`;

  const marks = await db.Attendance.findAll({
    where: {
      shop_id: shopId,
      employee_id: { [Op.in]: employees.map(e => e.id) },
      date: { [Op.between]: [from, to] },
    },
    attributes: ['employee_id', 'date', 'status', 'notes', 'shift'],
    raw: true,
    transaction,
  });

  // Keyed by day-of-month ("05"), not the full date string Sequelize returns
  // for `date` — the frontend's month grid is built as a plain array of
  // 2-digit days and looks entries up the same way. Keying by the full date
  // here meant the lookup on the frontend never matched anything, so every
  // freshly-fetched grid — including right after a save — rendered as if
  // nothing had ever been marked, even though the row was saved correctly.
  const byEmployee = {};
  marks.forEach(m => {
    const key = m.employee_id;
    const day = String(m.date).slice(8, 10);
    (byEmployee[key] = byEmployee[key] || {})[day] = { status: m.status, notes: m.notes, shift: m.shift };
  });

  return {
    month,
    from,
    to,
    employees: employees.map(e => ({
      id: e.id,
      name: e.name,
      designation: e.designation,
      employment_id: e.employment_id,
      days: byEmployee[e.id] || {},
    })),
  };
}

exports.getMonth = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const branchId = req.query.branch_id ? parseInt(req.query.branch_id, 10) : resolveBranchId(req);
    const result = await buildMonthGrid(shopId, req.query.month, branchId);
    return res.json(result);
  } catch (error) {
    console.error('getAttendanceMonth error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── GET /attendance/summary?employee_id=&month=YYYY-MM ──────────────────────
// Present/absent/leave counts for one employee/month — what the payroll
// preview and the absence deduction both read.
exports.getSummary = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const employeeId = parseInt(req.query.employee_id, 10);
    const month = req.query.month;
    if (!employeeId) return res.status(400).json({ message: 'employee_id is required' });
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: 'month is required in YYYY-MM format' });
    }

    const employee = await db.Employee.findOne({ where: { id: employeeId, shop_id: shopId }, attributes: ['id'] });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const [summary, overtime] = await Promise.all([
      getAttendanceSummaryForMonth(shopId, employeeId, month),
      getOvertimeSummaryForMonth(shopId, employeeId, month),
    ]);
    return res.json({ ...summary, overtime_hours: overtime.overtime_hours });
  } catch (error) {
    console.error('getAttendanceSummary error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// Shared with employeeLedgerController.giveSalary — one definition of "how
// many present/absent/leave days did this employee have in this month",
// counted straight off the marked rows so the payroll preview and the actual
// deduction can never disagree.
//
// `transaction` is optional but matters: giveSalary calls this from inside its
// own open transaction, and a query with no transaction runs on a separate
// connection that cannot see uncommitted rows from that transaction — a
// payroll run in the same request that just marked attendance would silently
// see zero absences without this being threaded through.
async function getAttendanceSummaryForMonth(shopId, employeeId, month, transaction) {
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth).padStart(2, '0')}`;

  // Holidays are never counted as absent/unmarked, and the daily rate used
  // for the absence deduction is based on working days — a fixed monthly
  // salary is meant to cover those, not calendar days off (confirmed with
  // the user). A day explicitly marked 'absent' that also happens to be a
  // holiday is still excluded here, protecting against a stray/mistaken mark.
  const [rows, holidayDates] = await Promise.all([
    db.Attendance.findAll({
      where: { shop_id: shopId, employee_id: employeeId, date: { [Op.between]: [from, to] } },
      attributes: ['status', 'date'],
      raw: true,
      transaction,
    }),
    getHolidayDatesForMonth(shopId, month, transaction),
  ]);

  const counts = { present: 0, absent: 0, leave: 0 };
  rows.forEach(r => {
    const dateKey = String(r.date).slice(0, 10);
    if (holidayDates.has(dateKey)) return;
    if (counts[r.status] !== undefined) counts[r.status] += 1;
  });

  return {
    month,
    days_in_month: Math.max(0, daysInMonth - holidayDates.size),
    present_days: counts.present,
    absent_days: counts.absent,
    leave_days: counts.leave,
    marked_days: rows.length,
    holiday_days: holidayDates.size,
  };
}

// Sibling to getAttendanceSummaryForMonth, same transaction-threading reasoning
// — giveSalary calls this from inside its own open transaction when the "Add
// overtime pay" checkbox is on, so a same-request attendance edit is visible.
async function getOvertimeSummaryForMonth(shopId, employeeId, month, transaction) {
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth).padStart(2, '0')}`;

  const rows = await db.Attendance.findAll({
    where: { shop_id: shopId, employee_id: employeeId, date: { [Op.between]: [from, to] } },
    attributes: ['overtime_hours'],
    raw: true,
    transaction,
  });

  const totalHours = rows.reduce((s, r) => s + (parseFloat(r.overtime_hours) || 0), 0);
  return { month, overtime_hours: Math.round(totalHours * 100) / 100 };
}

// ── Shared employee-scope resolver for reports ───────────────────────────────
// employee_ids (comma-separated) is client-supplied — always re-intersected
// with this shop's (and branch's) active roster here rather than trusted
// directly, mirroring the employeeById.has(id) guard in markAttendance below.
// Omitting employee_ids falls back to the full active roster ("All Employees").
async function resolveEmployeeScope(shopId, branchId, employeeIdsParam, transaction) {
  const empWhere = { shop_id: shopId, status: 'active' };
  if (branchId) empWhere.branch_id = branchId;
  if (employeeIdsParam) {
    const ids = String(employeeIdsParam).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n));
    if (ids.length) empWhere.id = { [Op.in]: ids };
  }
  return db.Employee.findAll({
    where: empWhere,
    attributes: ['id', 'name', 'designation', 'employment_id', 'branch_id'],
    include: [{ model: db.Branch, attributes: ['id', 'name'] }],
    order: [['name', 'ASC']],
    transaction,
  });
}

// ── GET /attendance/employees?branch_id= ─────────────────────────────────────
// Plain active-employee roster for the report employee-picker — deliberately
// its own endpoint (not GET /employees) since attendance is its own permission
// module and shouldn't require `employees` read access too.
exports.getRosterForReports = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const branchId = req.query.branch_id ? parseInt(req.query.branch_id, 10) : resolveBranchId(req);
    const employees = await resolveEmployeeScope(shopId, branchId, null);
    return res.json({
      employees: employees.map(e => ({
        id: e.id,
        name: e.name,
        designation: e.designation,
        employment_id: e.employment_id,
        branch_id: e.branch_id,
        branch_name: e.Branch?.name || null,
      })),
    });
  } catch (error) {
    console.error('getAttendanceRoster error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── GET /attendance/report/daily?date=&branch_id=&employee_ids= ─────────────
// Same roster/marks join as getDay, but scoped to an optional employee subset
// and with totals computed server-side. `unmarked` (status: null) is kept as
// its own bucket, distinct from `absent` — matches getDay's semantics, so a
// report never silently counts "not yet marked" as "marked absent".
exports.getDailyReport = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const date = parseDateParam(req.query.date || new Date(), 'date');
    const branchId = req.query.branch_id ? parseInt(req.query.branch_id, 10) : resolveBranchId(req);
    const employees = await resolveEmployeeScope(shopId, branchId, req.query.employee_ids);

    const marks = await db.Attendance.findAll({
      where: { shop_id: shopId, date, employee_id: { [Op.in]: employees.map(e => e.id) } },
      raw: true,
    });
    const byEmployee = {};
    marks.forEach(m => { byEmployee[m.employee_id] = m; });

    const totals = { total_employees: employees.length, present: 0, absent: 0, leave: 0, unmarked: 0 };
    const employeeRows = employees.map(e => {
      const status = byEmployee[e.id]?.status || null;
      if (status && totals[status] !== undefined) totals[status] += 1;
      else totals.unmarked += 1;
      return {
        id: e.id,
        name: e.name,
        designation: e.designation,
        employment_id: e.employment_id,
        branch: e.Branch ? { id: e.Branch.id, name: e.Branch.name } : null,
        status,
        notes: byEmployee[e.id]?.notes || null,
      };
    });

    return res.json({ date, branch_id: branchId || null, totals, employees: employeeRows });
  } catch (error) {
    console.error('getAttendanceDailyReport error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── buildRangeGrid / GET /attendance/report/range?from=&to=&branch_id=&employee_ids= ──
// Generalizes buildMonthGrid to an arbitrary date range with an optional
// employee subset. Keyed by full ISO date (not the 2-digit day buildMonthGrid
// uses) since a range can cross a month boundary. Serves both the Monthly
// report tab (from/to = first/last day of the chosen month) and the Date
// Range tab (arbitrary from/to) — a calendar month is just a range whose span
// happens to equal days_in_month.
const MAX_REPORT_RANGE_DAYS = 366;

async function buildRangeGrid(shopId, rawFrom, rawTo, branchId, employeeIdsParam, transaction) {
  const from = parseDateParam(rawFrom, 'from');
  const to = parseDateParam(rawTo, 'to');
  if (from > to) {
    const e = new Error('from must not be after to');
    e.statusCode = 400;
    throw e;
  }
  const spanDays = Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000) + 1;
  if (spanDays > MAX_REPORT_RANGE_DAYS) {
    const e = new Error(`Date range cannot exceed ${MAX_REPORT_RANGE_DAYS} days`);
    e.statusCode = 400;
    throw e;
  }

  const employees = await resolveEmployeeScope(shopId, branchId, employeeIdsParam, transaction);

  const marks = await db.Attendance.findAll({
    where: {
      shop_id: shopId,
      employee_id: { [Op.in]: employees.map(e => e.id) },
      date: { [Op.between]: [from, to] },
    },
    attributes: ['employee_id', 'date', 'status', 'notes'],
    raw: true,
    transaction,
  });

  const byEmployee = {};
  marks.forEach(m => {
    (byEmployee[m.employee_id] = byEmployee[m.employee_id] || {})[String(m.date)] = { status: m.status, notes: m.notes };
  });

  return {
    from,
    to,
    days_in_range: spanDays,
    employees: employees.map(e => {
      const days = byEmployee[e.id] || {};
      const counts = { present: 0, absent: 0, leave: 0 };
      Object.values(days).forEach(d => { if (counts[d.status] !== undefined) counts[d.status] += 1; });
      const marked_days = counts.present + counts.absent + counts.leave;
      return {
        id: e.id,
        name: e.name,
        designation: e.designation,
        employment_id: e.employment_id,
        days,
        summary: {
          present_days: counts.present,
          absent_days: counts.absent,
          leave_days: counts.leave,
          unmarked_days: spanDays - marked_days,
          marked_days,
          days_in_range: spanDays,
          // Percentage of MARKED days that were present — mirrors
          // getAttendanceSummaryForMonth's marked_days concept, so gaps in
          // marking don't drag the percentage down.
          percentage: marked_days ? Math.round((counts.present / marked_days) * 1000) / 10 : 0,
        },
      };
    }),
  };
}

exports.getRangeReport = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const branchId = req.query.branch_id ? parseInt(req.query.branch_id, 10) : resolveBranchId(req);
    const result = await buildRangeGrid(shopId, req.query.from, req.query.to, branchId, req.query.employee_ids);
    return res.json({ ...result, branch_id: branchId || null });
  } catch (error) {
    console.error('getAttendanceRangeReport error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── markAttendance ───────────────────────────────────────────────────────────
// Bulk upsert: entries = [{ employee_id, status, notes? }]. Re-marking an
// employee for the same day updates rather than duplicates, via the
// (employee_id, date) unique index.
//
// The core logic is separated from the Express handler below and takes an
// explicit transaction, mirroring closeFiscalYear in
// services/fiscalYearClose.js — this is what lets a test drive a real write
// and then roll it back, instead of the handler committing on its own with no
// way to undo it.
async function markAttendance(shopId, userId, rawDate, entries, transaction) {
  if (!Array.isArray(entries) || !entries.length) {
    const e = new Error('entries must be a non-empty array');
    e.statusCode = 400;
    throw e;
  }

  const date = parseDateParam(parseTransactionDate(rawDate, 'date'), 'date');
  assertNotFuture(date);

  const validStatuses = new Set(['present', 'absent', 'leave']);
  const validShifts = new Set(['morning', 'evening', 'night']);
  for (const entry of entries) {
    if (!entry.employee_id || !validStatuses.has(entry.status)) {
      const e = new Error('Every entry needs employee_id and a valid status');
      e.statusCode = 400;
      throw e;
    }
    if (entry.shift && !validShifts.has(entry.shift)) {
      const e = new Error(`shift must be one of: ${[...validShifts].join(', ')}`);
      e.statusCode = 400;
      throw e;
    }
  }

  const employeeIds = entries.map(e => parseInt(e.employee_id, 10));
  const employees = await db.Employee.findAll({
    where: { id: { [Op.in]: employeeIds }, shop_id: shopId },
    attributes: ['id', 'branch_id', 'shift'],
    transaction,
  });
  const employeeById = new Map(employees.map(e => [e.id, e]));
  for (const id of employeeIds) {
    if (!employeeById.has(id)) {
      const e = new Error(`Employee ${id} not found for this shop`);
      e.statusCode = 400;
      throw e;
    }
  }

  const results = [];
  for (const entry of entries) {
    const employeeId = parseInt(entry.employee_id, 10);
    const employee = employeeById.get(employeeId);
    const fields = {
      status: entry.status,
      notes: entry.notes?.trim() || null,
      marked_by: userId,
      // Stamped on every write, not just creation, so a row from before an
      // employee's branch transfer stays consistent with where they are now.
      shop_id: shopId,
      branch_id: employee.branch_id,
      // Falls back to the employee's default shift when the entry doesn't
      // specify one, so bulk-marking a whole roster still records a shift
      // without every row needing an explicit selection.
      shift: entry.shift || employee.shift || null,
      overtime_hours: entry.overtime_hours != null ? Math.max(0, parseFloat(entry.overtime_hours) || 0) : 0,
      // Only meaningful on a 'leave' day; cleared whenever the status is
      // anything else so a day that stops being leave doesn't keep pointing
      // at a stale leave type.
      leave_type_id: entry.status === 'leave' ? (entry.leave_type_id || null) : null,
    };
    const [row, created] = await db.Attendance.findOrCreate({
      where: { employee_id: employeeId, date },
      defaults: { employee_id: employeeId, date, ...fields },
      transaction,
    });
    if (!created) await row.update(fields, { transaction });
    results.push(row);
  }

  return { date, marked: results.length };
}

// ── POST /attendance/mark ────────────────────────────────────────────────────
exports.mark = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const result = await markAttendance(shopId, req.user.id, req.body.date, req.body.entries, transaction);
    await transaction.commit();
    return res.json(result);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('markAttendance error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

exports.getAttendanceSummaryForMonth = getAttendanceSummaryForMonth;
exports.getOvertimeSummaryForMonth = getOvertimeSummaryForMonth;
exports.markAttendance = markAttendance;
exports.markAttendance = markAttendance;
exports.buildMonthGrid = buildMonthGrid;
