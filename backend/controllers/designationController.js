const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');

exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.search) {
      where.name = { [Op.iLike]: `%${req.query.search}%` };
    }

    const designations = await db.Designation.findAll({
      where,
      order: [['name', 'ASC']],
    });

    return res.json({ designations });
  } catch (error) {
    console.error('listDesignations error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Designation name is required' });

    // Idempotent: if a designation with this name (case-insensitive) already
    // exists, hand it back instead of erroring — the inline "add" flow on the
    // employee form should never trip over a duplicate-name collision.
    const existing = await db.Designation.findOne({
      where: { shop_id: shopId, name: { [Op.iLike]: name } },
    });
    if (existing) return res.status(200).json({ designation: existing });

    const designation = await db.Designation.create({ shop_id: shopId, name });
    return res.status(201).json({ designation });
  } catch (error) {
    console.error('createDesignation error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const designation = await db.Designation.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!designation) return res.status(404).json({ message: 'Designation not found' });

    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Designation name is required' });

    const dup = await db.Designation.findOne({
      where: { shop_id: shopId, name: { [Op.iLike]: name }, id: { [Op.ne]: designation.id } },
    });
    if (dup) return res.status(409).json({ message: 'A designation with this name already exists' });

    designation.name = name;
    await designation.save();

    return res.json({ designation });
  } catch (error) {
    console.error('updateDesignation error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const designation = await db.Designation.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!designation) return res.status(404).json({ message: 'Designation not found' });

    const employeeCount = await db.Employee.count({ where: { designation_id: designation.id, shop_id: shopId } });
    if (employeeCount > 0) {
      return res.status(400).json({ message: 'Cannot delete designation assigned to employees' });
    }

    await designation.destroy();
    return res.json({ message: 'Designation deleted' });
  } catch (error) {
    console.error('removeDesignation error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
