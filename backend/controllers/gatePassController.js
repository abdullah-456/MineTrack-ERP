const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');

const GatePass     = db.GatePass;
const GatePassItem = db.GatePassItem;
const Branch       = db.Branch;
const Customer     = db.Customer;
const Sale         = db.Sale;
const User         = db.User;
const Product      = db.Product;
const Shop         = db.Shop;
const sequelize    = db.sequelize;

// Helper to generate a unique gate pass number: GP-{shop_id}-YYYYMMDD-XXXX
// The shop_id is embedded (matching generateInvoiceNumber's convention) because
// gate_pass_number has a shop-agnostic UNIQUE constraint at the DB level, and
// two different shops issuing their first gatepass of the day would otherwise
// both compute the same date-scoped sequence number and collide.
async function generateGatePassNumber(shop_id, transaction) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `GP-${shop_id}-${dateStr}-`;

  const lastRecord = await GatePass.findOne({
    where: {
      shop_id,
      gate_pass_number: { [Op.like]: `${prefix}%` }
    },
    order: [['id', 'DESC']],
    transaction
  });

  let seq = 1;
  if (lastRecord && lastRecord.gate_pass_number) {
    const parts = lastRecord.gate_pass_number.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) {
      seq = lastSeq + 1;
    }
  }

  const paddedSeq = String(seq).padStart(4, '0');
  return `${prefix}${paddedSeq}`;
}

exports.list = async (req, res) => {
  try {
    const shop_id = requireShopId(req, res);
    if (!shop_id) return;

    const { branch_id, search, type, status, from, to, page = 1, limit = 50 } = req.query;

    const where = { shop_id };

    if (branch_id) where.branch_id = branch_id;
    if (type)      where.type      = type;
    if (status)    where.status    = status;

    if (from || to) {
      where.gate_pass_date = {};
      if (from) where.gate_pass_date[Op.gte] = new Date(from);
      if (to) {
        const endDate = new Date(to);
        endDate.setHours(23, 59, 59, 999);
        where.gate_pass_date[Op.lte] = endDate;
      }
    }

    if (search) {
      where[Op.or] = [
        { gate_pass_number: { [Op.like]: `%${search}%` } },
        { customer_name:    { [Op.like]: `%${search}%` } },
        { vehicle_no:       { [Op.like]: `%${search}%` } },
        { driver_name:      { [Op.like]: `%${search}%` } },
      ];
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const { count, rows } = await GatePass.findAndCountAll({
      where,
      include: [
        { model: Branch,      attributes: ['id', 'name'] },
        { model: Customer,    attributes: ['id', 'name', 'phone'] },
        { model: Sale,        attributes: ['id', 'invoice_number', 'sale_date'], required: false },
        { model: User, as: 'Issuer', attributes: ['id', 'name'], required: false },
        {
          model: GatePassItem,
          as: 'GatePassItems',
          include: [{ model: Product, attributes: ['id', 'name', 'sku'], required: false }]
        }
      ],
      order: [['gate_pass_date', 'DESC'], ['id', 'DESC']],
      limit:  parseInt(limit, 10),
      offset: parseInt(offset, 10),
      distinct: true
    });

    return res.json({
      gate_passes: rows,
      total: count,
      page: parseInt(page, 10),
      totalPages: Math.ceil(count / parseInt(limit, 10))
    });
  } catch (error) {
    console.error('Error listing gate passes:', error);
    return res.status(500).json({ message: 'Error retrieving gate passes', error: error.message });
  }
};

exports.get = async (req, res) => {
  try {
    const shop_id = requireShopId(req, res);
    if (!shop_id) return;

    const { id } = req.params;

    const gatePass = await GatePass.findOne({
      where: { id, shop_id },
      include: [
        { model: Shop,     attributes: ['id', 'name', 'owner_name', 'email', 'phone', 'address', 'logo_url'] },
        { model: Branch,   attributes: ['id', 'name', 'address', 'phone'] },
        { model: Customer, attributes: ['id', 'name', 'phone', 'cnic', 'address'], required: false },
        { model: Sale,     attributes: ['id', 'invoice_number', 'sale_date', 'total'], required: false },
        { model: User, as: 'Issuer', attributes: ['id', 'name', 'email'], required: false },
        {
          model: GatePassItem,
          as: 'GatePassItems',
          include: [{ model: Product, attributes: ['id', 'name', 'sku'], required: false }]
        }
      ]
    });

    if (!gatePass) {
      return res.status(404).json({ message: 'Gate pass not found' });
    }

    return res.json({ gate_pass: gatePass });
  } catch (error) {
    console.error('Error fetching gate pass:', error);
    return res.status(500).json({ message: 'Error retrieving gate pass', error: error.message });
  }
};

exports.create = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const shop_id = requireShopId(req, res);
    if (!shop_id) { await t.rollback(); return; }

    const created_by = req.user ? req.user.id : null;
    const {
      branch_id,
      sale_id,
      customer_id,
      customer_name,
      customer_phone,
      gate_pass_date,
      type = 'sale_dispatch',
      vehicle_no,
      driver_name,
      driver_phone,
      remarks,
      items
    } = req.body;

    if (!branch_id) {
      await t.rollback();
      return res.status(400).json({ message: 'Branch is required' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: 'At least one item is required for a gate pass' });
    }

    let resolvedCustomerName  = customer_name;
    let resolvedCustomerPhone = customer_phone;

    if (customer_id) {
      const cust = await Customer.findOne({ where: { id: customer_id, shop_id }, transaction: t });
      if (cust) {
        if (!resolvedCustomerName)  resolvedCustomerName  = cust.name;
        if (!resolvedCustomerPhone) resolvedCustomerPhone = cust.phone;
      }
    }

    const gate_pass_number = await generateGatePassNumber(shop_id, t);
    const passDate = gate_pass_date ? new Date(gate_pass_date) : new Date();

    const gatePass = await GatePass.create({
      shop_id,
      branch_id,
      gate_pass_number,
      sale_id:        sale_id     || null,
      customer_id:    customer_id || null,
      customer_name:  resolvedCustomerName  || 'Walk-in / General Receiver',
      customer_phone: resolvedCustomerPhone || null,
      gate_pass_date: passDate,
      type,
      vehicle_no:   vehicle_no?.trim()   || null,
      driver_name:  driver_name?.trim()  || null,
      driver_phone: driver_phone?.trim() || null,
      remarks:      remarks?.trim()      || null,
      created_by,
      status: 'active'
    }, { transaction: t });

    const itemsToCreate = items.map(item => ({
      gate_pass_id: gatePass.id,
      product_id:   item.product_id   || null,
      product_name: item.product_name || 'Item',
      quantity:     parseFloat(item.quantity) || 1,
      unit:         item.unit  || 'kg',
      notes:        item.notes || null
    }));

    await GatePassItem.bulkCreate(itemsToCreate, { transaction: t });
    await t.commit();

    // Fetch complete created gate pass
    const completeGatePass = await GatePass.findOne({
      where: { id: gatePass.id },
      include: [
        { model: Branch,   attributes: ['id', 'name'] },
        { model: Customer, attributes: ['id', 'name', 'phone'], required: false },
        { model: Sale,     attributes: ['id', 'invoice_number'],   required: false },
        { model: User, as: 'Issuer', attributes: ['id', 'name'],   required: false },
        { model: GatePassItem, as: 'GatePassItems' }
      ]
    });

    return res.status(201).json({
      message: 'Gate pass created successfully',
      gate_pass: completeGatePass
    });
  } catch (error) {
    await t.rollback();
    console.error('Error creating gate pass:', error);
    return res.status(500).json({ message: 'Error creating gate pass', error: error.message });
  }
};

exports.remove = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const shop_id = requireShopId(req, res);
    if (!shop_id) { await t.rollback(); return; }

    const { id } = req.params;

    const gatePass = await GatePass.findOne({
      where: { id, shop_id },
      transaction: t
    });

    if (!gatePass) {
      await t.rollback();
      return res.status(404).json({ message: 'Gate pass not found' });
    }

    await GatePassItem.destroy({ where: { gate_pass_id: id }, transaction: t });
    await gatePass.destroy({ transaction: t });
    await t.commit();

    return res.json({ message: 'Gate pass deleted successfully' });
  } catch (error) {
    await t.rollback();
    console.error('Error deleting gate pass:', error);
    return res.status(500).json({ message: 'Error deleting gate pass', error: error.message });
  }
};
