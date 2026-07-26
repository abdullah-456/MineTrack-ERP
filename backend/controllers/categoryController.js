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

    const categories = await db.Category.findAll({
      where,
      include: [{ model: db.Category, as: 'Parent', attributes: ['id', 'name'] }],
      order: [['name', 'ASC']],
    });

    return res.json({ categories });
  } catch (error) {
    console.error('listCategories error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { name, parent_category_id } = req.body;
    if (!name) return res.status(400).json({ message: 'Category name is required' });

    // If a parent is given it must belong to the same shop.
    if (parent_category_id) {
      const parent = await db.Category.findOne({ where: { id: parent_category_id, shop_id: shopId } });
      if (!parent) return res.status(400).json({ message: 'Parent category not found in this shop' });
    }

    const category = await db.Category.create({
      shop_id: shopId,
      name,
      parent_category_id: parent_category_id || null,
    });
    return res.status(201).json({ category });
  } catch (error) {
    console.error('createCategory error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const category = await db.Category.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!category) return res.status(404).json({ message: 'Category not found' });

    if (req.body.name !== undefined) category.name = req.body.name;
    if (req.body.parent_category_id !== undefined) {
      if (req.body.parent_category_id) {
        const parent = await db.Category.findOne({ where: { id: req.body.parent_category_id, shop_id: shopId } });
        if (!parent) return res.status(400).json({ message: 'Parent category not found in this shop' });
      }
      category.parent_category_id = req.body.parent_category_id || null;
    }
    await category.save();

    return res.json({ category });
  } catch (error) {
    console.error('updateCategory error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const category = await db.Category.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!category) return res.status(404).json({ message: 'Category not found' });

    const productCount = await db.Product.count({ where: { category_id: category.id, shop_id: shopId } });
    if (productCount > 0) {
      return res.status(400).json({ message: 'Cannot delete category with linked products' });
    }

    await category.destroy();
    return res.json({ message: 'Category deleted' });
  } catch (error) {
    console.error('removeCategory error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
