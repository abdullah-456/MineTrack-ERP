'use strict';

const db = require('../models');

// ──────────────────────────────────────────────────────────────────────────────
// Truck-loading commission: the live calculation, plus deferral (postponing a
// month's commission to a later payroll run instead of losing track of it).
//
// This file has no dependency on truckLoadingController.js or
// employeeLedgerController.js — both of those depend on THIS file instead, so
// there's no risk of a require cycle between "compute commission" and
// "decide what to do with it".
// ──────────────────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
const MONTH_RE = /^\d{4}-\d{2}$/;

function err(statusCode, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

function assertMonth(month) {
  if (!month || !MONTH_RE.test(month)) throw err(400, 'month is required in YYYY-MM format');
}

// ── calculateCommissionForMonth ─────────────────────────────────────────────
// Exported and used by the truck-loading preview endpoint, by
// getCommissionSituation below, and by employeeLedgerController.runGiveSalary
// (indirectly, through getCommissionSituation) — so the number the user sees
// in the Give Salary modal and the number actually written to the payroll row
// can never drift apart. Never re-implement this formula anywhere else.
//
// For each log this employee is eligible on in `month`: sum the trucks and the
// tons on only THEIR credited days, apply THEIR OWN rates snapshotted on that
// row, and add the two bases together. Then sum across every mine they're on.
//
// Rates come off the join row, never off the employee or the log — those are
// only defaults used at the moment the row is created, and reading them live
// here would let a later profile edit rewrite an already-paid month.
async function calculateCommissionForMonth(shopId, employeeId, month, transaction) {
  assertMonth(month);

  const links = await db.TruckLoadingEmployee.findAll({
    where: { employee_id: employeeId },
    include: [{
      model: db.TruckLoadingLog,
      as: 'Log',
      where: { shop_id: shopId, month },
      required: true,
      include: [
        { model: db.TruckLoadingDay, as: 'Days', attributes: ['date', 'trucks', 'tons'] },
        { model: db.Branch, as: 'Mine', attributes: ['id', 'name'] },
      ],
    }],
    transaction,
  });

  const breakdown = [];
  let total = 0;

  for (const link of links) {
    const log = link.Log;
    const credited = link.credited_days; // null ⇒ all logged days
    const creditedSet = Array.isArray(credited) ? new Set(credited) : null;

    let trucks = 0;
    let tons = 0;
    let daysCounted = 0;
    for (const day of (log.Days || [])) {
      const date = String(day.date).slice(0, 10);
      if (creditedSet && !creditedSet.has(date)) continue;
      trucks += parseInt(day.trucks, 10) || 0;
      tons += parseFloat(day.tons) || 0;
      daysCounted += 1;
    }
    tons = round3(tons);

    const truckRate = link.truck_rate_enabled ? parseFloat(link.truck_rate || 0) : 0;
    const tonRate = link.ton_rate_enabled ? parseFloat(link.ton_rate || 0) : 0;
    const truckAmount = round2(trucks * truckRate);
    const tonAmount = round2(tons * tonRate);
    const amount = round2(truckAmount + tonAmount);

    // Nothing earned here at all — keep the breakdown (and the payslip note)
    // clean rather than listing a mine that contributed zero.
    if (amount === 0) continue;

    total = round2(total + amount);
    breakdown.push({
      log_id: log.id,
      mine_id: log.mine_id,
      mine_name: log.Mine?.name || null,
      trucks,
      tons,
      truck_rate: link.truck_rate_enabled ? parseFloat(link.truck_rate || 0) : null,
      ton_rate: link.ton_rate_enabled ? parseFloat(link.ton_rate || 0) : null,
      truck_amount: truckAmount,
      ton_amount: tonAmount,
      days_counted: daysCounted,
      all_days: creditedSet === null,
      amount,
    });
  }

  // Compact enough to store on the payroll row (STRING(255)) so a payslip can
  // explain the figure without re-reading tables that may have changed since.
  const note = breakdown
    .map(b => {
      const parts = [];
      if (b.truck_amount > 0) parts.push(`${b.trucks}t × ${b.truck_rate}`);
      if (b.ton_amount > 0) parts.push(`${b.tons}T × ${b.ton_rate}`);
      return `${b.mine_name || `Mine ${b.mine_id}`}: ${parts.join(' + ')}`;
    })
    .join('; ')
    .slice(0, 255) || null;

  return { month, amount: total, note, breakdown };
}

// ── getCommissionSituation ──────────────────────────────────────────────────
// Everything relevant to deciding what happens to an employee's commission on
// a given month's payroll run:
//
//   current — this month's freshly-computed commission, or null if this month
//             was ALREADY resolved before (either paid, or already deferred —
//             see below). Never recomputed once resolved: a deferral or a
//             payment freezes the figure at that moment, so a later change to
//             truck-loading data can't silently move a promise already made.
//   carried — every still-unpaid deferred row for this employee, oldest
//             first, from ANY earlier month (however many months back it's
//             been postponed) — including THIS month's own row if it was
//             deferred earlier and payroll is only being run for it now.
//   total_amount — current.amount (if any) + the sum of every carried row.
//                  This is the figure "pay commission now" would add to
//                  gross, and the reason a month that was postponed once and
//                  then earns MORE the following month shows both, combined,
//                  the next time the company can afford it.
async function getCommissionSituation(shopId, employeeId, month, transaction) {
  assertMonth(month);

  const deferredRows = await db.EmployeeCommission.findAll({
    where: { shop_id: shopId, employee_id: employeeId, status: 'deferred' },
    order: [['earned_month', 'ASC']],
    transaction,
  });

  const alreadyDeferredThisMonth = deferredRows.some(r => r.earned_month === month);

  const current = alreadyDeferredThisMonth
    ? null
    : await calculateCommissionForMonth(shopId, employeeId, month, transaction);

  const carried = deferredRows.map(r => ({
    id: r.id,
    month: r.earned_month,
    amount: parseFloat(r.amount),
    note: r.note,
  }));

  const carriedAmount = round2(carried.reduce((s, c) => s + c.amount, 0));
  const currentAmount = current ? current.amount : 0;

  return {
    month,
    current,
    carried,
    total_amount: round2(currentAmount + carriedAmount),
  };
}

// ── deferCommission ──────────────────────────────────────────────────────────
// Postpones THIS month's commission — freezes calculateCommissionForMonth's
// current figure into a new 'deferred' row, leaving it for a later payroll run
// to pick up via getCommissionSituation's `carried` list. A no-op (returns
// null) when there's nothing to defer: no commission earned this month, or
// this exact month was already resolved one way or the other — re-deferring
// it would either double-count it later or silently overwrite a figure an
// earlier decision already froze.
//
// Rows for EARLIER months that are already deferred are untouched here on
// purpose — deferring again only ever concerns the current month; whatever
// was postponed before stays postponed until it's explicitly paid.
async function deferCommission(shopId, employeeId, month, userId, transaction) {
  assertMonth(month);

  const existing = await db.EmployeeCommission.findOne({
    where: { shop_id: shopId, employee_id: employeeId, earned_month: month },
    transaction,
  });
  if (existing) return null;

  const computed = await calculateCommissionForMonth(shopId, employeeId, month, transaction);
  if (computed.amount <= 0) return null;

  return db.EmployeeCommission.create({
    shop_id: shopId,
    employee_id: employeeId,
    earned_month: month,
    amount: computed.amount,
    note: computed.note,
    status: 'deferred',
    created_by: userId || null,
  }, { transaction });
}

// ── resolveCommissionPaid ───────────────────────────────────────────────────
// Marks every given deferred row as paid, linked to the payroll run that
// finally included them. Called after the Payroll row for a "pay commission
// now" run has been created — never before, so paid_payroll_id always points
// at a real row.
async function resolveCommissionPaid(rowIds, payrollId, month, transaction) {
  if (!rowIds.length) return;
  await db.EmployeeCommission.update(
    { status: 'paid', paid_payroll_id: payrollId, paid_month: month },
    { where: { id: rowIds }, transaction },
  );
}

module.exports = {
  calculateCommissionForMonth,
  getCommissionSituation,
  deferCommission,
  resolveCommissionPaid,
};
