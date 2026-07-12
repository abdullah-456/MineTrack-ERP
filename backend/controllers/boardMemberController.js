const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { requestOrAllowDelete } = require('../utils/deletionRequest');

exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${req.query.search}%` } },
        { phone: { [Op.like]: `%${req.query.search}%` } },
        { cnic: { [Op.like]: `%${req.query.search}%` } },
      ];
    }

    const members = await db.BoardMember.findAll({ where, order: [['created_at', 'DESC']] });
    return res.json({ members });
  } catch (error) {
    console.error('listBoardMembers error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const member = await db.BoardMember.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!member) return res.status(404).json({ message: 'Board member not found' });
    return res.json({ member });
  } catch (error) {
    console.error('getBoardMember error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { name, phone, cnic, address } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });

    const member = await db.BoardMember.create({
      shop_id: shopId,
      name,
      phone: phone || null,
      cnic: cnic || null,
      address: address || null,
    });

    return res.status(201).json({ member });
  } catch (error) {
    console.error('createBoardMember error:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'A board member with this CNIC already exists' });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const member = await db.BoardMember.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!member) return res.status(404).json({ message: 'Board member not found' });

    const fields = ['name', 'phone', 'cnic', 'address'];
    fields.forEach(f => { if (req.body[f] !== undefined) member[f] = req.body[f]; });
    await member.save();

    return res.json({ member });
  } catch (error) {
    console.error('updateBoardMember error:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'A board member with this CNIC already exists' });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const member = await db.BoardMember.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!member) return res.status(404).json({ message: 'Board member not found' });

    const { pending } = await requestOrAllowDelete({
      req, res, shopId, module: 'board_directors', entityId: member.id, entityLabel: member.name,
    });
    if (pending) return;

    await member.destroy();
    return res.json({ message: 'Board member removed' });
  } catch (error) {
    console.error('removeBoardMember error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
