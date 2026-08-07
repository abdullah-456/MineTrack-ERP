const db = require('../models');
const { requireShopId } = require('../utils/shopScope');
const { productionTotals } = require('../utils/productionHelpers');

const ALLOWED_STATUS = ['active', 'under_development', 'suspended', 'closed', 'lease_expired'];

const PIT_ATTRIBUTES = ['id', 'shop_id', 'mine_id', 'area_name', 'status', 'gps_coordinates', 'notes'];

// ── GET /api/pits — List pits for a shop, optionally scoped to one mine ─────
// By default only non-closed pits are returned (matches branches' listBranches
// convention); pass ?all=1 to also see closed ones (used by the Pits page).
exports.listPits = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (!req.query.all) where.status = 'active';
    if (req.query.mine_id) where.mine_id = parseInt(req.query.mine_id, 10);

    const pits = await db.Pit.findAll({
      where,
      attributes: PIT_ATTRIBUTES,
      include: [{ model: db.Branch, as: 'Mine', attributes: ['id', 'name', 'mine_code'] }],
      order: [['area_name', 'ASC']],
    });

    return res.json({ pits });
  } catch (error) {
    console.error('listPits error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/pits/:id — Get a single pit, with its Benches ──────────────────
exports.getPit = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const pit = await db.Pit.findOne({
      where: { id: req.params.id, shop_id: shopId },
      attributes: PIT_ATTRIBUTES,
      include: [
        { model: db.Branch, as: 'Mine', attributes: ['id', 'name', 'mine_code'] },
        { model: db.Bench, as: 'Benches', attributes: ['id', 'bench_number', 'elevation', 'status'] },
      ],
    });
    if (!pit) return res.status(404).json({ message: 'Pit not found' });

    const production_total = await productionTotals(shopId, { pitId: pit.id });
    return res.json({ pit, production_total });
  } catch (error) {
    console.error('getPit error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// A pit's mine must exist and belong to the same shop — otherwise a shop could
// attach a pit to another tenant's mine by guessing an id.
async function assertMineInShop(mineId, shopId, transaction) {
  const mine = await db.Branch.findOne({ where: { id: mineId, shop_id: shopId }, transaction });
  if (!mine) {
    const err = new Error('Mine not found for this shop');
    err.statusCode = 400;
    throw err;
  }
}

// ── POST /api/pits ───────────────────────────────────────────────────────────
exports.createPit = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { mine_id, area_name, status, gps_coordinates, notes } = req.body;
    if (!mine_id) return res.status(400).json({ message: 'mine_id is required' });
    if (!area_name?.trim()) return res.status(400).json({ message: 'Area name is required' });

    const pitStatus = status || 'active';
    if (!ALLOWED_STATUS.includes(pitStatus)) {
      return res.status(400).json({ message: `status must be one of: ${ALLOWED_STATUS.join(', ')}` });
    }

    await assertMineInShop(mine_id, shopId);

    const pit = await db.Pit.create({
      shop_id: shopId,
      mine_id: parseInt(mine_id, 10),
      area_name: area_name.trim(),
      status: pitStatus,
      gps_coordinates: gps_coordinates || null,
      notes: notes || null,
    });

    return res.status(201).json({ pit });
  } catch (error) {
    console.error('createPit error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PUT /api/pits/:id ─────────────────────────────────────────────────────────
exports.updatePit = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const pit = await db.Pit.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!pit) return res.status(404).json({ message: 'Pit not found' });

    const { mine_id, area_name, status, gps_coordinates, notes } = req.body;

    if (status !== undefined && !ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${ALLOWED_STATUS.join(', ')}` });
    }
    if (mine_id !== undefined) await assertMineInShop(mine_id, shopId);

    if (mine_id !== undefined) pit.mine_id = parseInt(mine_id, 10);
    if (area_name !== undefined) pit.area_name = area_name.trim();
    if (status !== undefined) pit.status = status;
    if (gps_coordinates !== undefined) pit.gps_coordinates = gps_coordinates || null;
    if (notes !== undefined) pit.notes = notes || null;
    await pit.save();

    return res.json({ pit });
  } catch (error) {
    console.error('updatePit error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── DELETE /api/pits/:id — Close a pit (soft delete) ─────────────────────────
// No "last active" guard here (unlike branches) — nothing else depends on a
// shop always having at least one active pit.
exports.removePit = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const pit = await db.Pit.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!pit) return res.status(404).json({ message: 'Pit not found' });
    if (pit.status === 'closed') return res.status(400).json({ message: 'Pit is already closed' });

    pit.status = 'closed';
    await pit.save();

    return res.json({ message: 'Pit closed', pit });
  } catch (error) {
    console.error('removePit error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
