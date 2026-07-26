const db = require('../models');
const { requireShopId } = require('../utils/shopScope');

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
      attributes: ['id', 'name', 'address', 'is_default', 'status', 'godown_id'],
      include: [{ model: db.Godown, attributes: ['id', 'name', 'code'] }],
      order: [['is_default', 'DESC'], ['name', 'ASC']],
    });

    return res.json({ branches });
  } catch (error) {
    console.error('listBranches error:', error);
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

// ── POST /api/branches — Create a branch ───────────────────────────────────
exports.createBranch = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await t.rollback(); return; }

    const { name, address, is_default, godown_id } = req.body;
    if (!name) {
      await t.rollback();
      return res.status(400).json({ message: 'Branch name is required' });
    }

    if (is_default) {
      await db.Branch.update({ is_default: false }, { where: { shop_id: shopId }, transaction: t });
    }

    const branch = await db.Branch.create({
      shop_id: shopId,
      godown_id: godown_id ? parseInt(godown_id, 10) : null,
      name,
      address: address || null,
      is_default: !!is_default,
      status: 'active',
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

    const { name, address, is_default, status, godown_id } = req.body;

    if (status === 'disabled' && branch.status !== 'disabled') {
      const activeCount = await db.Branch.count({ where: { shop_id: shopId, status: 'active' }, transaction: t });
      if (activeCount <= 1) {
        await t.rollback();
        return res.status(400).json({ message: 'Cannot disable the only active branch for this shop' });
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
    await branch.save({ transaction: t });

    // If the branch being disabled was the default, promote another active branch to default.
    if (status === 'disabled' && branch.is_default) {
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
// Disabling removes it from active dropdowns while preserving history.
exports.removeBranch = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await t.rollback(); return; }

    const branch = await db.Branch.findOne({ where: { id: req.params.id, shop_id: shopId }, transaction: t });
    if (!branch) {
      await t.rollback();
      return res.status(404).json({ message: 'Branch not found' });
    }
    if (branch.status === 'disabled') {
      await t.rollback();
      return res.status(400).json({ message: 'Branch is already disabled' });
    }

    const activeCount = await db.Branch.count({ where: { shop_id: shopId, status: 'active' }, transaction: t });
    if (activeCount <= 1) {
      await t.rollback();
      return res.status(400).json({ message: 'Cannot disable the only active branch for this shop' });
    }

    const wasDefault = branch.is_default;
    branch.status = 'disabled';
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
    return res.json({ message: 'Branch disabled', branch });
  } catch (error) {
    await t.rollback();
    console.error('removeBranch error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
