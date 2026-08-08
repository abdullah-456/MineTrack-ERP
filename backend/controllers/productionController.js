const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { productionTotals, todayWeekMonthRanges } = require('../utils/productionHelpers');

const ENTRY_INCLUDES = [
  { model: db.Branch, as: 'Mine', attributes: ['id', 'name', 'mine_code'] },
  { model: db.Pit, as: 'Pit', attributes: ['id', 'area_name'] },
  { model: db.Bench, as: 'Bench', attributes: ['id', 'bench_number'] },
  { model: db.Mineral, as: 'Mineral', attributes: ['id', 'name', 'unit'] },
  { model: db.Employee, as: 'Supervisor', attributes: ['id', 'name'] },
];

// Confirms mine/pit/bench form a real chain within this shop — otherwise a
// mismatched combination (e.g. a pit picked from a different mine) would
// silently attribute production to the wrong hierarchy.
async function assertHierarchy(shopId, mineId, pitId, benchId, transaction) {
  const mine = await db.Branch.findOne({ where: { id: mineId, shop_id: shopId }, transaction });
  if (!mine) { const e = new Error('Mine not found for this shop'); e.statusCode = 400; throw e; }

  const pit = await db.Pit.findOne({ where: { id: pitId, shop_id: shopId }, transaction });
  if (!pit) { const e = new Error('Pit not found for this shop'); e.statusCode = 400; throw e; }
  if (pit.mine_id !== parseInt(mineId, 10)) {
    const e = new Error('Selected pit does not belong to the selected mine'); e.statusCode = 400; throw e;
  }

  const bench = await db.Bench.findOne({ where: { id: benchId, shop_id: shopId }, transaction });
  if (!bench) { const e = new Error('Bench not found for this shop'); e.statusCode = 400; throw e; }
  if (bench.pit_id !== parseInt(pitId, 10)) {
    const e = new Error('Selected bench does not belong to the selected pit'); e.statusCode = 400; throw e;
  }
}

function parseFilters(query) {
  const f = {};
  if (query.mine_id) f.mineId = parseInt(query.mine_id, 10);
  if (query.pit_id) f.pitId = parseInt(query.pit_id, 10);
  if (query.bench_id) f.benchId = parseInt(query.bench_id, 10);
  if (query.mineral_id) f.mineralId = parseInt(query.mineral_id, 10);
  if (query.supervisor_id) f.supervisorId = parseInt(query.supervisor_id, 10);
  if (query.shift) f.shift = query.shift;
  if (query.from) f.from = query.from;
  if (query.to) f.to = query.to;
  return f;
}

// ── GET /api/production ──────────────────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { mineId, pitId, benchId, mineralId, supervisorId, shift, from, to } = parseFilters(req.query);
    const where = { shop_id: shopId };
    if (mineId) where.mine_id = mineId;
    if (pitId) where.pit_id = pitId;
    if (benchId) where.bench_id = benchId;
    if (mineralId) where.mineral_id = mineralId;
    if (supervisorId) where.supervisor_id = supervisorId;
    if (shift) where.shift = shift;
    if (from || to) {
      where.date = {};
      if (from) where.date[Op.gte] = from;
      if (to) where.date[Op.lte] = to;
    }

    const entries = await db.ProductionEntry.findAll({
      where,
      include: ENTRY_INCLUDES,
      order: [['date', 'DESC'], ['id', 'DESC']],
    });

    return res.json({ entries });
  } catch (error) {
    console.error('listProduction error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/production/stats — Today/Week/Month totals, same filters ──────
exports.stats = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { from: _from, to: _to, ...scopeFilters } = parseFilters(req.query);
    const { today, weekStart, monthStart } = todayWeekMonthRanges();

    const [todayTotals, weekTotals, monthTotals] = await Promise.all([
      productionTotals(shopId, { ...scopeFilters, from: today, to: today }),
      productionTotals(shopId, { ...scopeFilters, from: weekStart, to: today }),
      productionTotals(shopId, { ...scopeFilters, from: monthStart, to: today }),
    ]);

    return res.json({ today: todayTotals, week: weekTotals, month: monthTotals });
  } catch (error) {
    console.error('productionStats error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/production/:id ───────────────────────────────────────────────────
exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const entry = await db.ProductionEntry.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: ENTRY_INCLUDES,
    });
    if (!entry) return res.status(404).json({ message: 'Production entry not found' });
    return res.json({ entry });
  } catch (error) {
    console.error('getProduction error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/production ──────────────────────────────────────────────────────
exports.create = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { date, mine_id, pit_id, bench_id, shift, mineral_id, quantity, unit, supervisor_id, remarks } = req.body;
    if (!date) return res.status(400).json({ message: 'Date is required' });
    if (!mine_id || !pit_id || !bench_id || !supervisor_id) {
      return res.status(400).json({ message: 'Mine, Pit, Bench and Supervisor are all required' });
    }

    await assertHierarchy(shopId, mine_id, pit_id, bench_id);

    const entry = await db.ProductionEntry.create({
      shop_id: shopId,
      date,
      mine_id: parseInt(mine_id, 10),
      pit_id: parseInt(pit_id, 10),
      bench_id: parseInt(bench_id, 10),
      shift: shift || null,
      mineral_id: mineral_id ? parseInt(mineral_id, 10) : null,
      quantity: parseFloat(quantity) || 0,
      unit: unit?.trim() || 'kg',
      supervisor_id: parseInt(supervisor_id, 10),
      remarks: remarks || null,
    });

    return res.status(201).json({ entry });
  } catch (error) {
    console.error('createProduction error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PUT /api/production/:id ───────────────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const entry = await db.ProductionEntry.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!entry) return res.status(404).json({ message: 'Production entry not found' });

    const { date, mine_id, pit_id, bench_id, shift, mineral_id, quantity, unit, supervisor_id, remarks } = req.body;

    const nextMine = mine_id !== undefined ? mine_id : entry.mine_id;
    const nextPit = pit_id !== undefined ? pit_id : entry.pit_id;
    const nextBench = bench_id !== undefined ? bench_id : entry.bench_id;
    if (mine_id !== undefined || pit_id !== undefined || bench_id !== undefined) {
      await assertHierarchy(shopId, nextMine, nextPit, nextBench);
    }

    if (date !== undefined) entry.date = date;
    if (mine_id !== undefined) entry.mine_id = parseInt(mine_id, 10);
    if (pit_id !== undefined) entry.pit_id = parseInt(pit_id, 10);
    if (bench_id !== undefined) entry.bench_id = parseInt(bench_id, 10);
    if (shift !== undefined) entry.shift = shift || null;
    if (mineral_id !== undefined) entry.mineral_id = mineral_id ? parseInt(mineral_id, 10) : null;
    if (quantity !== undefined) entry.quantity = parseFloat(quantity) || 0;
    if (unit !== undefined) entry.unit = unit?.trim() || 'kg';
    if (supervisor_id !== undefined) {
      if (!supervisor_id) return res.status(400).json({ message: 'Supervisor is required' });
      entry.supervisor_id = parseInt(supervisor_id, 10);
    }
    if (remarks !== undefined) entry.remarks = remarks || null;
    await entry.save();

    return res.json({ entry });
  } catch (error) {
    console.error('updateProduction error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── DELETE /api/production/:id ────────────────────────────────────────────────
// Plain hard delete — a production entry is a log row nothing else
// references, unlike Mines/Pits/Benches which guard against removing the
// last active one.
exports.remove = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const entry = await db.ProductionEntry.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!entry) return res.status(404).json({ message: 'Production entry not found' });

    await entry.destroy();
    return res.json({ message: 'Production entry deleted' });
  } catch (error) {
    console.error('removeProduction error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
