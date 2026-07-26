const db = require('../models');
const { requireShopId } = require('../utils/shopScope');

exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const godowns = await db.Godown.findAll({
      where: { shop_id: shopId },
      include: [
        {
          model: db.Branch,
          as: 'Branches',
          attributes: ['id', 'name', 'address', 'is_default', 'status']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    return res.json({ godowns });
  } catch (error) {
    console.error('listGodowns error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const godown = await db.Godown.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: [
        {
          model: db.Branch,
          as: 'Branches',
          attributes: ['id', 'name', 'address', 'is_default', 'status']
        }
      ]
    });

    if (!godown) return res.status(404).json({ message: 'Godown not found' });
    return res.json({ godown });
  } catch (error) {
    console.error('getGodown error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { name, code, address, phone, status, branch_ids } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Godown name is required' });
    }

    const godown = await db.Godown.create({
      shop_id: shopId,
      name: name.trim(),
      code: code ? code.trim() : null,
      address: address ? address.trim() : null,
      phone: phone ? phone.trim() : null,
      status: status || 'active'
    });

    if (Array.isArray(branch_ids) && branch_ids.length > 0) {
      await db.Branch.update(
        { godown_id: godown.id },
        { where: { id: branch_ids, shop_id: shopId } }
      );
    }

    const fresh = await db.Godown.findByPk(godown.id, {
      include: [{ model: db.Branch, as: 'Branches', attributes: ['id', 'name', 'address', 'is_default', 'status'] }]
    });

    return res.status(201).json({ godown: fresh });
  } catch (error) {
    console.error('createGodown error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const godown = await db.Godown.findOne({
      where: { id: req.params.id, shop_id: shopId }
    });

    if (!godown) return res.status(404).json({ message: 'Godown not found' });

    const { name, code, address, phone, status, branch_ids } = req.body;

    await godown.update({
      name: name !== undefined ? name.trim() : godown.name,
      code: code !== undefined ? (code ? code.trim() : null) : godown.code,
      address: address !== undefined ? (address ? address.trim() : null) : godown.address,
      phone: phone !== undefined ? (phone ? phone.trim() : null) : godown.phone,
      status: status || godown.status
    });

    if (Array.isArray(branch_ids)) {
      // Clear previous linkages
      await db.Branch.update(
        { godown_id: null },
        { where: { godown_id: godown.id, shop_id: shopId } }
      );
      // Link selected branches
      if (branch_ids.length > 0) {
        await db.Branch.update(
          { godown_id: godown.id },
          { where: { id: branch_ids, shop_id: shopId } }
        );
      }
    }

    const fresh = await db.Godown.findByPk(godown.id, {
      include: [{ model: db.Branch, as: 'Branches', attributes: ['id', 'name', 'address', 'is_default', 'status'] }]
    });

    return res.json({ godown: fresh });
  } catch (error) {
    console.error('updateGodown error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.linkBranches = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const godown = await db.Godown.findOne({
      where: { id: req.params.id, shop_id: shopId }
    });

    if (!godown) return res.status(404).json({ message: 'Godown not found' });

    const { branch_ids } = req.body;
    if (!Array.isArray(branch_ids)) {
      return res.status(400).json({ message: 'branch_ids must be an array of branch IDs' });
    }

    // Reset old branches for this godown
    await db.Branch.update(
      { godown_id: null },
      { where: { godown_id: godown.id, shop_id: shopId } }
    );

    // Attach new ones
    if (branch_ids.length > 0) {
      await db.Branch.update(
        { godown_id: godown.id },
        { where: { id: branch_ids, shop_id: shopId } }
      );
    }

    const fresh = await db.Godown.findByPk(godown.id, {
      include: [{ model: db.Branch, as: 'Branches', attributes: ['id', 'name', 'address', 'is_default', 'status'] }]
    });

    return res.json({ godown: fresh, message: 'Branches linked successfully' });
  } catch (error) {
    console.error('linkBranches error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const godown = await db.Godown.findOne({
      where: { id: req.params.id, shop_id: shopId }
    });

    if (!godown) return res.status(404).json({ message: 'Godown not found' });

    // Unlink branches first
    await db.Branch.update(
      { godown_id: null },
      { where: { godown_id: godown.id, shop_id: shopId } }
    );

    await godown.destroy();

    return res.json({ message: 'Godown deleted successfully' });
  } catch (error) {
    console.error('removeGodown error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
