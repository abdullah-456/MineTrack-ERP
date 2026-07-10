const db = require('../models');

// ── GET /api/branches — List branches for a shop
// SuperAdmin: pass ?shop_id=X
// Admin: uses their own shop
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

    const branches = await db.Branch.findAll({
      where: { shop_id: shopId },
      attributes: ['id', 'name', 'address', 'is_default', 'status'],
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
