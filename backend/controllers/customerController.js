const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { requestOrAllowDelete } = require('../utils/deletionRequest');
const { assertCnicAvailable } = require('../utils/cnic');

exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.status && req.query.status !== 'all') where.status = req.query.status;
    if (req.query.customer_type && req.query.customer_type !== 'all') where.customer_type = req.query.customer_type;
    if (req.query.search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${req.query.search}%` } },
        { phone: { [Op.like]: `%${req.query.search}%` } },
        { cnic: { [Op.like]: `%${req.query.search}%` } },
      ];
    }

    const customers = await db.Customer.findAll({
      where,
      order: [['created_at', 'DESC']],
    });

    return res.json({ customers });
  } catch (error) {
    console.error('listCustomers error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const customer = await db.Customer.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: [{
        model: db.Sale,
        limit: 20,
        order: [['sale_date', 'DESC']],
        include: [{ model: db.SaleItem, as: 'SaleItems', include: [{ model: db.Product, attributes: ['name', 'sku'] }] }],
      }],
    });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    return res.json({ customer });
  } catch (error) {
    console.error('getCustomer error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { name, cnic, phone, address, status, customer_type } = req.body;
    if (!name) return res.status(400).json({ message: 'Customer name is required' });

    // NOTE: current_balance is NOT accepted from the client. A customer's balance
    // is a ledger value that may only change through sales / payments / returns.
    const preparedCnic = await assertCnicAvailable(shopId, cnic);

    const customer = await db.Customer.create({
      shop_id: shopId,
      name,
      cnic: preparedCnic.cnic,
      cnic_normalized: preparedCnic.cnic_normalized,
      phone,
      address,
      current_balance: 0,
      customer_type: customer_type || 'registered',
      status: status || 'active',
    });

    return res.status(201).json({ customer });
  } catch (error) {
    console.error('createCustomer error:', error);
    if (error.statusCode === 409) return res.status(409).json({ message: error.message });
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'CNIC already registered for another person' });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const customer = await db.Customer.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    // current_balance deliberately excluded — it is ledger-controlled, not client-editable.
    const fields = ['name', 'phone', 'address', 'status', 'customer_type'];
    fields.forEach(f => { if (req.body[f] !== undefined) customer[f] = req.body[f]; });

    if (req.body.cnic !== undefined) {
      const preparedCnic = await assertCnicAvailable(shopId, req.body.cnic, { customerId: customer.id });
      customer.cnic = preparedCnic.cnic;
      customer.cnic_normalized = preparedCnic.cnic_normalized;
    }

    await customer.save();

    return res.json({ customer });
  } catch (error) {
    console.error('updateCustomer error:', error);
    if (error.statusCode === 409) return res.status(409).json({ message: error.message });
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'CNIC already registered for another person' });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const customer = await db.Customer.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const { pending } = await requestOrAllowDelete({
      req, res, shopId, module: 'customers', entityId: customer.id, entityLabel: customer.name,
    });
    if (pending) return;

    await customer.update({ status: 'disabled' });
    return res.json({ message: 'Customer disabled', customer });
  } catch (error) {
    console.error('removeCustomer error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
