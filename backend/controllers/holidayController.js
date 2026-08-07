const db = require('../models');
const { requireShopId } = require('../utils/shopScope');

exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.year) {
      const year = req.query.year;
      where[db.Sequelize.Op.or] = [
        { date: { [db.Sequelize.Op.between]: [`${year}-01-01`, `${year}-12-31`] } },
        { is_recurring_yearly: true },
      ];
    }

    const holidays = await db.Holiday.findAll({ where, order: [['date', 'ASC']] });
    return res.json({ holidays });
  } catch (error) {
    console.error('listHolidays error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const { date, name, is_recurring_yearly } = req.body;
    if (!date) return res.status(400).json({ message: 'Date is required' });
    if (!name?.trim()) return res.status(400).json({ message: 'Holiday name is required' });

    const holiday = await db.Holiday.create({
      shop_id: shopId,
      date,
      name: name.trim(),
      is_recurring_yearly: !!is_recurring_yearly,
    });
    return res.status(201).json({ holiday });
  } catch (error) {
    console.error('createHoliday error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const holiday = await db.Holiday.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!holiday) return res.status(404).json({ message: 'Holiday not found' });

    const { date, name, is_recurring_yearly } = req.body;
    if (date !== undefined) holiday.date = date;
    if (name !== undefined) holiday.name = name.trim();
    if (is_recurring_yearly !== undefined) holiday.is_recurring_yearly = !!is_recurring_yearly;
    await holiday.save();
    return res.json({ holiday });
  } catch (error) {
    console.error('updateHoliday error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const holiday = await db.Holiday.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!holiday) return res.status(404).json({ message: 'Holiday not found' });

    await holiday.destroy();
    return res.json({ message: 'Holiday deleted' });
  } catch (error) {
    console.error('removeHoliday error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
