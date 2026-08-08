'use strict';

const db = require('../models');

const round3 = (n) => Math.round((parseFloat(n) || 0) * 1000) / 1000;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Local-calendar-day bounds — mirrors moduleReportsController.js's rangeDates,
// so a shop in Pakistan doesn't lose its early-morning entries to a UTC
// midnight cutoff.
function localDayBounds(dateStr) {
  return {
    fromDate: new Date(`${dateStr}T00:00:00.000`),
    toDate: new Date(`${dateStr}T23:59:59.999`),
  };
}

// Today / this week (Mon-based) / this month, as YYYY-MM-DD strings.
function todayWeekMonthRanges() {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);

  const dow = today.getDay(); // 0=Sun..6=Sat
  const diffToMonday = (dow + 6) % 7;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - diffToMonday);
  const weekStartKey = weekStart.toISOString().slice(0, 10);

  const monthStartKey = `${todayKey.slice(0, 7)}-01`;

  return { today: todayKey, weekStart: weekStartKey, monthStart: monthStartKey };
}

// ── productionTotals ─────────────────────────────────────────────────────────
// Sums quantity for the given scope, GROUPED BY UNIT — a mine/pit/bench can in
// principle log more than one mineral with a different unit (kg vs tons vs
// carats), and blindly summing across units would produce a meaningless
// number. Returns [{ unit, total }], sorted by total desc.
async function productionTotals(shopId, { mineId, pitId, benchId, mineralId, supervisorId, shift, from, to } = {}, transaction) {
  const where = { shop_id: shopId };
  if (mineId) where.mine_id = mineId;
  if (pitId) where.pit_id = pitId;
  if (benchId) where.bench_id = benchId;
  if (mineralId) where.mineral_id = mineralId;
  if (supervisorId) where.supervisor_id = supervisorId;
  if (shift) where.shift = shift;
  if (from || to) {
    const { fromDate } = localDayBounds(from || '1970-01-01');
    const { toDate } = localDayBounds(to || todayStr());
    where.date = { [db.Sequelize.Op.between]: [fromDate, toDate] };
  }

  const rows = await db.ProductionEntry.findAll({
    where,
    attributes: [
      'unit',
      [db.sequelize.fn('SUM', db.sequelize.col('quantity')), 'total'],
    ],
    group: ['unit'],
    raw: true,
    transaction,
  });

  return rows
    .map(r => ({ unit: r.unit, total: round3(r.total) }))
    .sort((a, b) => b.total - a.total);
}

module.exports = { productionTotals, todayWeekMonthRanges, localDayBounds, todayStr };
