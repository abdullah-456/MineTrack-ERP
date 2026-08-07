const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');

const ALLOWED_CATEGORY = ['metallic', 'non_metallic', 'precious', 'energy_fuel', 'industrial', 'construction'];
const ALLOWED_ROYALTY_TYPE = ['percentage', 'fixed_per_unit'];

exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.search) {
      where.name = { [Op.iLike]: `%${req.query.search}%` };
    }

    const minerals = await db.Mineral.findAll({
      where,
      order: [['name', 'ASC']],
    });

    // One grouped query for every mineral's production total, rather than an
    // N+1 lookup per row. Grouped by unit too, same as productionHelpers'
    // productionTotals, in case a mineral was ever logged under more than
    // one unit.
    const totalsRows = await db.ProductionEntry.findAll({
      where: { shop_id: shopId, mineral_id: { [Op.ne]: null } },
      attributes: [
        'mineral_id', 'unit',
        [db.sequelize.fn('SUM', db.sequelize.col('quantity')), 'total'],
      ],
      group: ['mineral_id', 'unit'],
      raw: true,
    });
    const totalsByMineral = {};
    totalsRows.forEach((r) => {
      const list = totalsByMineral[r.mineral_id] || (totalsByMineral[r.mineral_id] = []);
      list.push({ unit: r.unit, total: Math.round((parseFloat(r.total) || 0) * 1000) / 1000 });
    });
    const mineralsWithTotals = minerals.map((m) => ({
      ...m.toJSON(),
      production_total: totalsByMineral[m.id] || [],
    }));

    return res.json({ minerals: mineralsWithTotals });
  } catch (error) {
    console.error('listMinerals error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { name, category, unit, default_price, royalty_type, royalty_rate, quality_parameters } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Mineral name is required' });
    if (category && !ALLOWED_CATEGORY.includes(category)) {
      return res.status(400).json({ message: `category must be one of: ${ALLOWED_CATEGORY.join(', ')}` });
    }
    const royaltyType = royalty_type || 'percentage';
    if (!ALLOWED_ROYALTY_TYPE.includes(royaltyType)) {
      return res.status(400).json({ message: `royalty_type must be one of: ${ALLOWED_ROYALTY_TYPE.join(', ')}` });
    }

    const mineral = await db.Mineral.create({
      shop_id: shopId,
      name: name.trim(),
      category: category || null,
      unit: unit?.trim() || 'kg',
      default_price: parseFloat(default_price) || 0,
      royalty_type: royaltyType,
      royalty_rate: parseFloat(royalty_rate) || 0,
      quality_parameters: Array.isArray(quality_parameters) ? quality_parameters : [],
    });
    return res.status(201).json({ mineral });
  } catch (error) {
    console.error('createMineral error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const mineral = await db.Mineral.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!mineral) return res.status(404).json({ message: 'Mineral not found' });

    const { name, category, unit, default_price, royalty_type, royalty_rate, quality_parameters } = req.body;

    if (category !== undefined && category && !ALLOWED_CATEGORY.includes(category)) {
      return res.status(400).json({ message: `category must be one of: ${ALLOWED_CATEGORY.join(', ')}` });
    }
    if (royalty_type !== undefined && !ALLOWED_ROYALTY_TYPE.includes(royalty_type)) {
      return res.status(400).json({ message: `royalty_type must be one of: ${ALLOWED_ROYALTY_TYPE.join(', ')}` });
    }

    if (name !== undefined) mineral.name = name.trim();
    if (category !== undefined) mineral.category = category || null;
    if (unit !== undefined) mineral.unit = unit?.trim() || 'kg';
    if (default_price !== undefined) mineral.default_price = parseFloat(default_price) || 0;
    if (royalty_type !== undefined) mineral.royalty_type = royalty_type;
    if (royalty_rate !== undefined) mineral.royalty_rate = parseFloat(royalty_rate) || 0;
    if (quality_parameters !== undefined) mineral.quality_parameters = Array.isArray(quality_parameters) ? quality_parameters : [];
    await mineral.save();

    return res.json({ mineral });
  } catch (error) {
    console.error('updateMineral error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const mineral = await db.Mineral.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!mineral) return res.status(404).json({ message: 'Mineral not found' });

    const mineCount = await db.Branch.count({ where: { mineral_id: mineral.id, shop_id: shopId } });
    if (mineCount > 0) {
      return res.status(400).json({ message: 'Cannot delete mineral with linked mines' });
    }

    await mineral.destroy();
    return res.json({ message: 'Mineral deleted' });
  } catch (error) {
    console.error('removeMineral error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
