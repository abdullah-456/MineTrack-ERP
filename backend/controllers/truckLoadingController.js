const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { calculateCommissionForMonth, getCommissionSituation } = require('../utils/commissionHelpers');

// ──────────────────────────────────────────────────────────────────────────────
// Truck commission — per-mine, per-month log of trucks AND tons loaded, plus
// which employees earn commission from it and on what terms.
//
// Two independent commission bases that STACK when both are enabled for an
// employee: trucks × truck_rate + tons × ton_rate, summed over only that
// employee's own credited days.
//
// The commission an employee earns is deliberately the FULL amount, not a share
// split between everyone eligible (confirmed with the user): three people
// eligible on the same mine/month each earn the full figure, not a third each.
// Nothing here divides by the eligible count.
// ──────────────────────────────────────────────────────────────────────────────

const EMPLOYEE_ROW_ATTRS = [
  'id', 'employee_id', 'credited_days',
  'truck_rate_enabled', 'truck_rate', 'ton_rate_enabled', 'ton_rate',
];

const LOG_INCLUDES = [
  { model: db.Branch, as: 'Mine', attributes: ['id', 'name', 'mine_code'] },
  { model: db.TruckLoadingDay, as: 'Days', attributes: ['id', 'date', 'trucks', 'tons', 'remarks'] },
  {
    model: db.TruckLoadingEmployee,
    as: 'EligibleEmployees',
    attributes: EMPLOYEE_ROW_ATTRS,
    include: [{ model: db.Employee, as: 'Employee', attributes: ['id', 'name', 'employment_id', 'designation'] }],
  },
];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function err(statusCode, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

function assertMonth(month) {
  if (!month || !MONTH_RE.test(month)) throw err(400, 'month is required in YYYY-MM format');
}

// A day must fall inside the log's own month — otherwise a stray date would be
// counted toward a month it doesn't belong to, and the per-employee credited-day
// list (which is just date strings) would silently pick it up.
function normalizeDays(rawDays, month) {
  if (rawDays === undefined) return undefined;
  if (!Array.isArray(rawDays)) throw err(400, 'days must be an array');

  const byDate = new Map();
  for (const d of rawDays) {
    const date = String(d?.date || '').slice(0, 10);
    if (!DATE_RE.test(date)) throw err(400, `"${d?.date}" is not a valid date`);
    if (date.slice(0, 7) !== month) throw err(400, `${date} is outside the log month ${month}`);
    const trucks = Math.max(0, parseInt(d?.trucks, 10) || 0);
    const tons = Math.max(0, round3(parseFloat(d?.tons)));
    // A day with neither a truck nor a ton on it carries no information and
    // would only pad the credited-day pickers with dead entries.
    if (!trucks && !tons) continue;
    // Last write wins on a duplicated date rather than inserting twice — the
    // (log_id, date) unique index would reject the second row anyway, and a
    // 500 from a constraint is a worse answer than just taking the later value.
    byDate.set(date, { date, trucks, tons, remarks: d?.remarks?.trim() || null });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// credited_days: null (or absent) means "every day logged on this log,
// including days entered later" — the default, and the common full-month case.
// An explicit array pins the employee to exactly those days; an explicit empty
// array credits nothing. See the model for the full contract.
function normalizeCreditedDays(raw, month) {
  if (raw === null || raw === undefined) return null;
  if (!Array.isArray(raw)) throw err(400, 'credited_days must be an array of YYYY-MM-DD strings or null');
  const days = new Set();
  for (const d of raw) {
    const date = String(d || '').slice(0, 10);
    if (!DATE_RE.test(date)) throw err(400, `"${d}" is not a valid credited day`);
    if (date.slice(0, 7) !== month) throw err(400, `Credited day ${date} is outside the log month ${month}`);
    days.add(date);
  }
  return [...days].sort();
}

async function assertMineInShop(shopId, mineId, transaction) {
  const mine = await db.Branch.findOne({ where: { id: mineId, shop_id: shopId }, transaction });
  if (!mine) throw err(400, 'Mine not found for this shop');
  return mine;
}

// Client-supplied employee ids are always re-intersected with this shop's own
// roster rather than trusted — same guard as attendanceController.markAttendance.
// Returns the full rows, since the caller also needs each employee's own
// commission defaults to fall back on.
async function resolveEmployees(shopId, ids, transaction) {
  const unique = [...new Set((ids || []).map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n)))];
  if (!unique.length) return [];
  const employees = await db.Employee.findAll({
    where: { id: { [Op.in]: unique }, shop_id: shopId },
    attributes: [
      'id',
      'commission_per_truck_enabled', 'commission_per_truck',
      'commission_per_ton_enabled', 'commission_per_ton',
    ],
    transaction,
  });
  const found = new Map(employees.map(e => [e.id, e]));
  const missing = unique.filter(id => !found.has(id));
  if (missing.length) throw err(400, `Employee ${missing[0]} not found for this shop`);
  return unique.map(id => found.get(id));
}

// What this employee earns on this log, resolved once and then snapshotted onto
// the row. Precedence, in order:
//   1. an explicit value sent from the Truck Commission page (the user typed it
//      for this mine/month),
//   2. the employee's own profile default,
//   3. the log's mine/month default.
//
// The profile flags are a DEFAULT, not a hard gate (confirmed with the user):
// the page can enable either basis for a mine/month even when the employee's
// profile has it switched off, which is why an explicit `enabled` from the
// client is honoured rather than intersected with the profile flag.
function resolveEmployeeRates(sent, employee, log) {
  const pick = (explicit, profile, logDefault) => {
    if (explicit !== undefined && explicit !== null && explicit !== '') return Math.max(0, parseFloat(explicit) || 0);
    const fromProfile = parseFloat(profile);
    if (Number.isFinite(fromProfile) && fromProfile > 0) return fromProfile;
    return Math.max(0, parseFloat(logDefault) || 0);
  };
  // With no explicit flag from the client, a basis is ON whenever we found a
  // rate for it at all. Deriving this from the resolved rate rather than from
  // the profile flag alone is what stops the quiet failure where someone types
  // a mine/month rate at the top of the page, ticks an employee who has
  // nothing configured on their profile, and they silently earn zero.
  //
  // The two can't contradict each other: employeeController nulls an amount
  // whenever its checkbox is off, so a profile rate > 0 always means enabled.
  const truckRate = pick(sent?.truck_rate, employee.commission_per_truck, log.rate);
  const tonRate = pick(sent?.ton_rate, employee.commission_per_ton, log.ton_rate);
  const flag = (explicit, rate) => (explicit === undefined || explicit === null ? rate > 0 : !!explicit);

  return {
    truck_rate_enabled: flag(sent?.truck_rate_enabled, truckRate),
    truck_rate: truckRate,
    ton_rate_enabled: flag(sent?.ton_rate_enabled, tonRate),
    ton_rate: tonRate,
  };
}

// calculateCommissionForMonth and getCommissionSituation (deferred/carried
// commission) now live in utils/commissionHelpers.js — moved there so that
// file has no dependency back on this one, avoiding a require cycle with
// employeeLedgerController.js (which needs both this controller's preview
// endpoint AND the commission-deferral logic). Re-exported below for the
// tests and any other existing caller that still imports it from here.

// ── GET /truck-loading?month=&mine_id= ──────────────────────────────────────
exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.month) {
      assertMonth(req.query.month);
      where.month = req.query.month;
    }
    if (req.query.mine_id) where.mine_id = parseInt(req.query.mine_id, 10);

    const logs = await db.TruckLoadingLog.findAll({
      where,
      include: LOG_INCLUDES,
      order: [['month', 'DESC'], ['id', 'DESC']],
    });

    return res.json({
      logs: logs.map(l => {
        const days = l.Days || [];
        const trucks = days.reduce((s, d) => s + (parseInt(d.trucks, 10) || 0), 0);
        const tons = round3(days.reduce((s, d) => s + (parseFloat(d.tons) || 0), 0));
        const rows = l.EligibleEmployees || [];
        // Each employee is on their own terms now, so there is no single
        // "commission for this log" — the total payable is the sum of what
        // every eligible person earns, and each of them earns theirs in FULL
        // (nothing here divides by the eligible count).
        const totalCommission = round2(rows.reduce((s, r) => {
          const t = r.truck_rate_enabled ? trucks * parseFloat(r.truck_rate || 0) : 0;
          const n = r.ton_rate_enabled ? tons * parseFloat(r.ton_rate || 0) : 0;
          return s + t + n;
        }, 0));
        return {
          id: l.id,
          month: l.month,
          mine_id: l.mine_id,
          mine_name: l.Mine?.name || null,
          rate: parseFloat(l.rate || 0),
          ton_rate: parseFloat(l.ton_rate || 0),
          remarks: l.remarks,
          total_trucks: trucks,
          total_tons: tons,
          days_logged: days.length,
          // Approximate: assumes every employee is credited for every logged
          // day. The per-employee figures on the detail view are exact.
          total_commission: totalCommission,
          eligible_count: rows.length,
        };
      }),
    });
  } catch (error) {
    console.error('listTruckLoading error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── GET /truck-loading/:id ──────────────────────────────────────────────────
exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const log = await db.TruckLoadingLog.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: LOG_INCLUDES,
      order: [[{ model: db.TruckLoadingDay, as: 'Days' }, 'date', 'ASC']],
    });
    if (!log) return res.status(404).json({ message: 'Truck loading log not found' });

    const days = (log.Days || [])
      .map(d => ({
        date: String(d.date).slice(0, 10),
        trucks: d.trucks,
        tons: parseFloat(d.tons || 0),
        remarks: d.remarks,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return res.json({
      log: {
        id: log.id,
        month: log.month,
        mine_id: log.mine_id,
        mine_name: log.Mine?.name || null,
        rate: parseFloat(log.rate || 0),
        ton_rate: parseFloat(log.ton_rate || 0),
        remarks: log.remarks,
        days,
        total_trucks: days.reduce((s, d) => s + (parseInt(d.trucks, 10) || 0), 0),
        total_tons: round3(days.reduce((s, d) => s + (parseFloat(d.tons) || 0), 0)),
        employees: (log.EligibleEmployees || []).map(link => {
          // Resolved server-side rather than left to the client so the UI never
          // has to re-implement the "null means every logged day" rule.
          const creditedSet = Array.isArray(link.credited_days) ? new Set(link.credited_days) : null;
          const creditedDays = creditedSet ? days.filter(d => creditedSet.has(d.date)) : days;
          const trucks = creditedDays.reduce((s, d) => s + (parseInt(d.trucks, 10) || 0), 0);
          const tons = round3(creditedDays.reduce((s, d) => s + (parseFloat(d.tons) || 0), 0));
          const truckAmount = link.truck_rate_enabled ? round2(trucks * parseFloat(link.truck_rate || 0)) : 0;
          const tonAmount = link.ton_rate_enabled ? round2(tons * parseFloat(link.ton_rate || 0)) : 0;
          return {
            id: link.id,
            employee_id: link.employee_id,
            name: link.Employee?.name || null,
            employment_id: link.Employee?.employment_id || null,
            designation: link.Employee?.designation || null,
            credited_days: link.credited_days, // null ⇒ all days, including ones added later
            credited_day_count: creditedDays.length,
            trucks,
            tons,
            truck_rate_enabled: link.truck_rate_enabled,
            truck_rate: parseFloat(link.truck_rate || 0),
            ton_rate_enabled: link.ton_rate_enabled,
            ton_rate: parseFloat(link.ton_rate || 0),
            truck_amount: truckAmount,
            ton_amount: tonAmount,
            // The two bases stack for an employee with both enabled.
            amount: round2(truckAmount + tonAmount),
          };
        }),
      },
    });
  } catch (error) {
    console.error('getTruckLoading error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// Replaces the whole day set and the whole eligible-employee set for a log in
// one shot — the frontend stages every edit locally and saves once (same
// pattern as the attendance grid), so a partial diff protocol would only add
// ways for the two sides to disagree.
async function writeChildren(log, body, transaction) {
  const days = normalizeDays(body.days, log.month);
  if (days !== undefined) {
    await db.TruckLoadingDay.destroy({ where: { log_id: log.id }, transaction });
    if (days.length) {
      await db.TruckLoadingDay.bulkCreate(
        days.map(d => ({ log_id: log.id, ...d })),
        { transaction },
      );
    }
  }

  if (body.employees !== undefined) {
    if (!Array.isArray(body.employees)) throw err(400, 'employees must be an array');
    const employees = await resolveEmployees(log.shop_id, body.employees.map(e => e?.employee_id ?? e), transaction);
    const byId = new Map();
    body.employees.forEach(e => {
      const id = parseInt(e?.employee_id ?? e, 10);
      if (!Number.isNaN(id)) byId.set(id, e);
    });

    await db.TruckLoadingEmployee.destroy({ where: { log_id: log.id }, transaction });
    if (employees.length) {
      await db.TruckLoadingEmployee.bulkCreate(
        employees.map(employee => {
          const sent = byId.get(employee.id);
          return {
            log_id: log.id,
            employee_id: employee.id,
            credited_days: normalizeCreditedDays(sent?.credited_days, log.month),
            // Snapshotted here and never re-read from the employee profile or
            // the log defaults afterwards — see resolveEmployeeRates.
            ...resolveEmployeeRates(sent, employee, log),
          };
        }),
        { transaction },
      );
    }
  }
}

// ── POST /truck-loading ─────────────────────────────────────────────────────
exports.create = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const { mine_id, month, rate, ton_rate, remarks } = req.body;
    assertMonth(month);
    if (!mine_id) throw err(400, 'mine_id is required');
    await assertMineInShop(shopId, mine_id, transaction);

    const duplicate = await db.TruckLoadingLog.findOne({
      where: { mine_id: parseInt(mine_id, 10), month }, transaction,
    });
    if (duplicate) {
      throw err(409, `A truck loading log already exists for this mine in ${month} — edit that one instead`);
    }

    const log = await db.TruckLoadingLog.create({
      shop_id: shopId,
      mine_id: parseInt(mine_id, 10),
      month,
      rate: Math.max(0, parseFloat(rate) || 0),
      ton_rate: Math.max(0, parseFloat(ton_rate) || 0),
      remarks: remarks?.trim() || null,
      created_by: req.user.id,
    }, { transaction });

    await writeChildren(log, req.body, transaction);
    await transaction.commit();
    return res.status(201).json({ log: { id: log.id } });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('createTruckLoading error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── PUT /truck-loading/:id ──────────────────────────────────────────────────
exports.update = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const log = await db.TruckLoadingLog.findOne({
      where: { id: req.params.id, shop_id: shopId }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!log) throw err(404, 'Truck loading log not found');

    // The mine and month identify the log (and its rate scope) — changing
    // either would silently move an already-credited month's commission onto a
    // different mine/month. Create a new log for a different mine/month instead.
    if (req.body.rate !== undefined) log.rate = Math.max(0, parseFloat(req.body.rate) || 0);
    if (req.body.ton_rate !== undefined) log.ton_rate = Math.max(0, parseFloat(req.body.ton_rate) || 0);
    if (req.body.remarks !== undefined) log.remarks = req.body.remarks?.trim() || null;
    // Saved BEFORE writeChildren so a rate typed on this same request is
    // available as the fallback default when an employee row is rebuilt below.
    await log.save({ transaction });

    await writeChildren(log, req.body, transaction);
    await transaction.commit();
    return res.json({ log: { id: log.id } });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('updateTruckLoading error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── DELETE /truck-loading/:id ───────────────────────────────────────────────
// Days and eligibility rows go with it (ON DELETE CASCADE). Commission already
// folded into a past payroll row is unaffected — it was snapshotted onto that
// row at the time of the run, never read back from here.
exports.remove = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const log = await db.TruckLoadingLog.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!log) return res.status(404).json({ message: 'Truck loading log not found' });

    await log.destroy();
    return res.json({ message: 'Truck loading log deleted' });
  } catch (error) {
    console.error('removeTruckLoading error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /truck-loading/employees ────────────────────────────────────────────
// Roster for the eligible-employee checklist, carrying each person's own
// commission defaults so the page can pre-fill their rates without a second
// request. Deliberately its own endpoint rather than GET /employees — truck
// loading is its own permission module, and a site clerk who logs trucks
// shouldn't need employees:read to do it (same reasoning as
// attendanceController.getRosterForReports).
exports.roster = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const employees = await db.Employee.findAll({
      where: { shop_id: shopId, status: { [Op.ne]: 'terminated' } },
      attributes: [
        'id', 'name', 'employment_id', 'designation',
        'commission_per_truck_enabled', 'commission_per_truck',
        'commission_per_ton_enabled', 'commission_per_ton',
      ],
      order: [['name', 'ASC']],
    });

    return res.json({
      employees: employees.map(e => ({
        id: e.id,
        name: e.name,
        employment_id: e.employment_id,
        designation: e.designation,
        commission_per_truck_enabled: e.commission_per_truck_enabled,
        commission_per_truck: e.commission_per_truck != null ? parseFloat(e.commission_per_truck) : null,
        commission_per_ton_enabled: e.commission_per_ton_enabled,
        commission_per_ton: e.commission_per_ton != null ? parseFloat(e.commission_per_ton) : null,
      })),
    });
  } catch (error) {
    console.error('truckLoadingRoster error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /truck-loading/commission?employee_id=&month= ───────────────────────
// Preview for the Give Salary modal — same function the actual payroll run
// uses, so the two can't disagree.
exports.commissionPreview = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const employeeId = parseInt(req.query.employee_id, 10);
    if (!employeeId) return res.status(400).json({ message: 'employee_id is required' });
    assertMonth(req.query.month);

    const employee = await db.Employee.findOne({
      where: { id: employeeId, shop_id: shopId }, attributes: ['id'],
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    // Full situation, not just this month's fresh figure — includes any
    // still-unpaid commission postponed from an earlier month so the Give
    // Salary modal can show both together (see utils/commissionHelpers.js).
    const result = await getCommissionSituation(shopId, employeeId, req.query.month);
    return res.json(result);
  } catch (error) {
    console.error('truckLoadingCommissionPreview error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

exports.calculateCommissionForMonth = calculateCommissionForMonth;
