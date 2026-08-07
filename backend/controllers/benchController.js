const db = require('../models');
const { requireShopId } = require('../utils/shopScope');
const { productionTotals } = require('../utils/productionHelpers');

const ALLOWED_STATUS = ['active', 'under_development', 'suspended', 'closed', 'lease_expired'];

const BENCH_ATTRIBUTES = ['id', 'shop_id', 'pit_id', 'bench_number', 'elevation', 'status'];

// A fresh array/object per call — listBenches conditionally adds a `where` to
// the Pit include depending on ?mine_id=, and mutating a shared module-level
// constant would leak that filter across concurrent requests.
function benchIncludes(mineId) {
  return [
    {
      model: db.Pit,
      as: 'Pit',
      attributes: ['id', 'area_name', 'mine_id'],
      include: [{ model: db.Branch, as: 'Mine', attributes: ['id', 'name', 'mine_code'] }],
      ...(mineId ? { where: { mine_id: mineId } } : {}),
    },
  ];
}

// ── GET /api/benches — List benches, optionally scoped to a pit or a mine ───
// ?pit_id= filters directly; ?mine_id= joins through Pit for the Benches
// page's Mine -> Pit cascading filter.
exports.listBenches = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (!req.query.all) where.status = 'active';
    if (req.query.pit_id) where.pit_id = parseInt(req.query.pit_id, 10);

    const mineId = req.query.mine_id ? parseInt(req.query.mine_id, 10) : null;

    const benches = await db.Bench.findAll({
      where,
      attributes: BENCH_ATTRIBUTES,
      include: benchIncludes(mineId),
      order: [['bench_number', 'ASC']],
    });

    return res.json({ benches });
  } catch (error) {
    console.error('listBenches error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/benches/:id ──────────────────────────────────────────────────────
exports.getBench = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const bench = await db.Bench.findOne({
      where: { id: req.params.id, shop_id: shopId },
      attributes: BENCH_ATTRIBUTES,
      include: [
        ...benchIncludes(null),
        {
          model: db.ProductionEntry,
          as: 'ProductionEntries',
          attributes: ['id', 'date', 'shift', 'mineral_id', 'quantity', 'unit'],
          include: [{ model: db.Mineral, as: 'Mineral', attributes: ['id', 'name'] }],
          order: [['date', 'DESC']],
          separate: true,
        },
      ],
    });
    if (!bench) return res.status(404).json({ message: 'Bench not found' });

    const production_total = await productionTotals(shopId, { benchId: bench.id });
    return res.json({ bench, production_total });
  } catch (error) {
    console.error('getBench error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// A bench's pit must exist and belong to the same shop.
async function assertPitInShop(pitId, shopId) {
  const pit = await db.Pit.findOne({ where: { id: pitId, shop_id: shopId } });
  if (!pit) {
    const err = new Error('Pit not found for this shop');
    err.statusCode = 400;
    throw err;
  }
}

// ── POST /api/benches ─────────────────────────────────────────────────────────
exports.createBench = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { pit_id, bench_number, elevation, status } = req.body;
    if (!pit_id) return res.status(400).json({ message: 'pit_id is required' });
    if (!bench_number?.trim()) return res.status(400).json({ message: 'Bench number is required' });

    const benchStatus = status || 'active';
    if (!ALLOWED_STATUS.includes(benchStatus)) {
      return res.status(400).json({ message: `status must be one of: ${ALLOWED_STATUS.join(', ')}` });
    }

    await assertPitInShop(pit_id, shopId);

    const bench = await db.Bench.create({
      shop_id: shopId,
      pit_id: parseInt(pit_id, 10),
      bench_number: bench_number.trim(),
      elevation: elevation || null,
      status: benchStatus,
    });

    return res.status(201).json({ bench });
  } catch (error) {
    console.error('createBench error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PUT /api/benches/:id ───────────────────────────────────────────────────────
exports.updateBench = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const bench = await db.Bench.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!bench) return res.status(404).json({ message: 'Bench not found' });

    const { pit_id, bench_number, elevation, status } = req.body;

    if (status !== undefined && !ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${ALLOWED_STATUS.join(', ')}` });
    }
    if (pit_id !== undefined) await assertPitInShop(pit_id, shopId);

    if (pit_id !== undefined) bench.pit_id = parseInt(pit_id, 10);
    if (bench_number !== undefined) bench.bench_number = bench_number.trim();
    if (elevation !== undefined) bench.elevation = elevation || null;
    if (status !== undefined) bench.status = status;
    await bench.save();

    return res.json({ bench });
  } catch (error) {
    console.error('updateBench error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── DELETE /api/benches/:id — Close a bench (soft delete) ────────────────────
exports.removeBench = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const bench = await db.Bench.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!bench) return res.status(404).json({ message: 'Bench not found' });
    if (bench.status === 'closed') return res.status(400).json({ message: 'Bench is already closed' });

    bench.status = 'closed';
    await bench.save();

    return res.json({ message: 'Bench closed', bench });
  } catch (error) {
    console.error('removeBench error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
