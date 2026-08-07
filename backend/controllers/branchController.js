const db = require('../models');
const { requireShopId } = require('../utils/shopScope');
const { productionTotals } = require('../utils/productionHelpers');

const ALLOWED_STATUS = ['active', 'under_development', 'suspended', 'closed', 'lease_expired'];

const MINE_FIELDS = [
  'company', 'province', 'district', 'gps_coordinates',
  'lease_number', 'lease_start_date', 'lease_expiry_date', 'area', 'remarks',
];

const BRANCH_ATTRIBUTES = [
  'id', 'name', 'address', 'is_default', 'status', 'godown_id',
  'mine_code', 'company', 'mineral_id', 'province', 'district', 'gps_coordinates',
  'lease_number', 'lease_start_date', 'lease_expiry_date', 'area', 'manager_id', 'remarks',
];

const BRANCH_INCLUDES = [
  { model: db.Godown, attributes: ['id', 'name', 'code'] },
  { model: db.Employee, as: 'Manager', attributes: ['id', 'name'] },
  { model: db.Mineral, as: 'Mineral', attributes: ['id', 'name'] },
];

// Sequential per-shop code, e.g. MN-3-0001. Mirrors employeeController's
// nextEmploymentId: the client only ever sees this as a read-only preview —
// the value actually persisted is always recomputed here, inside the create
// transaction, never trusted from the request body.
async function nextMineCode(shopId, transaction) {
  const count = await db.Branch.count({ where: { shop_id: shopId }, transaction });
  let seq = count + 1;
  let code;
  do {
    code = `MN-${shopId}-${String(seq).padStart(4, '0')}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await db.Branch.findOne({
      where: { shop_id: shopId, mine_code: code },
      transaction,
    });
    if (!exists) return code;
    seq += 1;
  } while (seq < count + 1000);
  return `MN-${shopId}-${Date.now()}`;
}

// ── GET /api/branches — List branches for a shop
// SuperAdmin: pass ?shop_id=X
// Admin: uses their own shop
// By default only 'active' branches are returned (this is what every branch
// dropdown across the app consumes); pass ?all=1 to also see disabled ones
// (used by the Branches management page).
exports.listBranches = async (req, res) => {
  try {
    let shopId;

    if (req.user.Role.name === 'super_admin') {
      shopId = req.query.shop_id ? parseInt(req.query.shop_id, 10) : null;
      if (!shopId) {
        return res.status(400).json({ message: 'shop_id is required' });
      }
    } else {
      shopId = req.user.shop_id;
      if (!shopId) {
        return res.status(403).json({ message: 'No shop context found for your account.' });
      }
    }

    const where = { shop_id: shopId };
    if (!req.query.all) where.status = 'active';

    const branches = await db.Branch.findAll({
      where,
      attributes: BRANCH_ATTRIBUTES,
      include: BRANCH_INCLUDES,
      order: [['is_default', 'DESC'], ['name', 'ASC']],
    });

    return res.json({ branches });
  } catch (error) {
    console.error('listBranches error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/branches/:id — Get a single mine ───────────────────────────────
exports.getBranch = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const branch = await db.Branch.findOne({
      where: { id: req.params.id, shop_id: shopId },
      attributes: BRANCH_ATTRIBUTES,
      include: [
        ...BRANCH_INCLUDES,
        { model: db.Pit, as: 'Pits', attributes: ['id', 'area_name', 'status', 'gps_coordinates'] },
      ],
    });
    if (!branch) return res.status(404).json({ message: 'Mine not found' });

    const production_total = await productionTotals(shopId, { mineId: branch.id });
    return res.json({ branch, production_total });
  } catch (error) {
    console.error('getBranch error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/branches/shops — List shops (SuperAdmin only, for user form picker)
exports.listShopsForPicker = async (req, res) => {
  try {
    if (req.user.Role.name !== 'super_admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const shops = await db.Shop.findAll({
      where: { status: { [db.Sequelize.Op.ne]: 'suspended' } },
      attributes: ['id', 'name', 'status'],
      order: [['name', 'ASC']],
    });

    return res.json({ shops });
  } catch (error) {
    console.error('listShopsForPicker error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/branches/next-code — Preview the next auto-generated mine code ──
exports.getNextMineCode = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const mine_code = await nextMineCode(shopId);
    return res.json({ mine_code });
  } catch (error) {
    console.error('getNextMineCode error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/branches — Create a branch ───────────────────────────────────
exports.createBranch = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await t.rollback(); return; }

    const { name, address, is_default, godown_id, status, manager_id, mineral_id } = req.body;
    if (!name) {
      await t.rollback();
      return res.status(400).json({ message: 'Mine name is required' });
    }

    const mineStatus = status || 'active';
    if (!ALLOWED_STATUS.includes(mineStatus)) {
      await t.rollback();
      return res.status(400).json({ message: `status must be one of: ${ALLOWED_STATUS.join(', ')}` });
    }

    if (is_default) {
      await db.Branch.update({ is_default: false }, { where: { shop_id: shopId }, transaction: t });
    }

    const mine_code = await nextMineCode(shopId, t);

    const branch = await db.Branch.create({
      shop_id: shopId,
      godown_id: godown_id ? parseInt(godown_id, 10) : null,
      manager_id: manager_id ? parseInt(manager_id, 10) : null,
      mineral_id: mineral_id ? parseInt(mineral_id, 10) : null,
      name,
      address: address || null,
      is_default: !!is_default,
      status: mineStatus,
      mine_code,
      ...Object.fromEntries(MINE_FIELDS.map(f => [f, req.body[f] || null])),
    }, { transaction: t });

    await t.commit();
    return res.status(201).json({ branch });
  } catch (error) {
    await t.rollback();
    console.error('createBranch error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PUT /api/branches/:id — Update a branch ─────────────────────────────────
exports.updateBranch = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await t.rollback(); return; }

    const branch = await db.Branch.findOne({ where: { id: req.params.id, shop_id: shopId }, transaction: t });
    if (!branch) {
      await t.rollback();
      return res.status(404).json({ message: 'Branch not found' });
    }

    const { name, address, is_default, status, godown_id, manager_id, mineral_id } = req.body;

    if (status !== undefined && !ALLOWED_STATUS.includes(status)) {
      await t.rollback();
      return res.status(400).json({ message: `status must be one of: ${ALLOWED_STATUS.join(', ')}` });
    }

    // Any transition out of Active — not just into a literal "closed" value —
    // needs the same "last active mine" guard, since all 5 statuses are now
    // reachable directly from the edit form's dropdown.
    const leavingActive = status !== undefined && status !== 'active' && branch.status === 'active';
    if (leavingActive) {
      const activeCount = await db.Branch.count({ where: { shop_id: shopId, status: 'active' }, transaction: t });
      if (activeCount <= 1) {
        await t.rollback();
        return res.status(400).json({ message: 'Cannot move the only active mine for this shop out of Active status' });
      }
    }

    if (is_default) {
      await db.Branch.update({ is_default: false }, { where: { shop_id: shopId }, transaction: t });
    }

    if (name !== undefined) branch.name = name;
    if (address !== undefined) branch.address = address;
    if (is_default !== undefined) branch.is_default = !!is_default;
    if (status !== undefined) branch.status = status;
    if (godown_id !== undefined) branch.godown_id = godown_id ? parseInt(godown_id, 10) : null;
    if (manager_id !== undefined) branch.manager_id = manager_id ? parseInt(manager_id, 10) : null;
    if (mineral_id !== undefined) branch.mineral_id = mineral_id ? parseInt(mineral_id, 10) : null;
    MINE_FIELDS.forEach((f) => { if (req.body[f] !== undefined) branch[f] = req.body[f] || null; });
    await branch.save({ transaction: t });

    // If the mine leaving Active was the default, promote another active mine to default.
    if (leavingActive && branch.is_default) {
      branch.is_default = false;
      await branch.save({ transaction: t });
      const replacement = await db.Branch.findOne({
        where: { shop_id: shopId, status: 'active' },
        order: [['name', 'ASC']],
        transaction: t,
      });
      if (replacement) {
        replacement.is_default = true;
        await replacement.save({ transaction: t });
      }
    }

    await t.commit();
    return res.json({ branch });
  } catch (error) {
    await t.rollback();
    console.error('updateBranch error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── DELETE /api/branches/:id — Disable a branch (soft delete) ──────────────
// Branches are referenced by users/employees/sales/stock/purchase orders/
// expenses across the whole app, so a hard delete would be destructive.
// Closing removes it from active dropdowns while preserving history.
exports.removeBranch = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await t.rollback(); return; }

    const branch = await db.Branch.findOne({ where: { id: req.params.id, shop_id: shopId }, transaction: t });
    if (!branch) {
      await t.rollback();
      return res.status(404).json({ message: 'Mine not found' });
    }
    if (branch.status === 'closed') {
      await t.rollback();
      return res.status(400).json({ message: 'Mine is already closed' });
    }

    const wasActive = branch.status === 'active';
    if (wasActive) {
      const activeCount = await db.Branch.count({ where: { shop_id: shopId, status: 'active' }, transaction: t });
      if (activeCount <= 1) {
        await t.rollback();
        return res.status(400).json({ message: 'Cannot close the only active mine for this shop' });
      }
    }

    const wasDefault = branch.is_default;
    branch.status = 'closed';
    branch.is_default = false;
    await branch.save({ transaction: t });

    if (wasDefault) {
      const replacement = await db.Branch.findOne({
        where: { shop_id: shopId, status: 'active' },
        order: [['name', 'ASC']],
        transaction: t,
      });
      if (replacement) {
        replacement.is_default = true;
        await replacement.save({ transaction: t });
      }
    }

    await t.commit();
    return res.json({ message: 'Mine closed', branch });
  } catch (error) {
    await t.rollback();
    console.error('removeBranch error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
