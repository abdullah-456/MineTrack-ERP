const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { requestOrAllowDelete } = require('../utils/deletionRequest');
const { assertCnicAvailable } = require('../utils/cnic');

const supplierIncludes = [
  { model: db.ProductSupplier, as: 'ProductSuppliers', include: [{ model: db.Product, attributes: ['id', 'name', 'sku'] }] },
];

exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.status && req.query.status !== 'all') where.status = req.query.status;
    if (req.query.search) {
      where[Op.or] = [
        { company_name: { [Op.like]: `%${req.query.search}%` } },
        { supplier_code: { [Op.like]: `%${req.query.search}%` } },
        { contact_person: { [Op.like]: `%${req.query.search}%` } },
        { phone: { [Op.like]: `%${req.query.search}%` } },
      ];
    }

    const suppliers = await db.Supplier.findAll({
      where,
      include: supplierIncludes,
      order: [['created_at', 'DESC']],
    });

    return res.json({ suppliers });
  } catch (error) {
    console.error('listSuppliers error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const supplier = await db.Supplier.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: supplierIncludes,
    });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    return res.json({ supplier });
  } catch (error) {
    console.error('getSupplier error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const {
      company_name, contact_person, phone, email, address,
      tax_number, payment_terms, status, cnic,
    } = req.body;

    if (!company_name) {
      return res.status(400).json({ message: 'Company name is required' });
    }

    const count = await db.Supplier.count({ where: { shop_id: shopId } });
    const supplier_code = req.body.supplier_code || `SUP-${String(count + 1).padStart(4, '0')}`;

    const preparedCnic = await assertCnicAvailable(shopId, cnic);

    const supplier = await db.Supplier.create({
      shop_id: shopId,
      supplier_code,
      company_name,
      contact_person,
      phone,
      email,
      address,
      tax_number,
      payment_terms,
      cnic: preparedCnic.cnic,
      cnic_normalized: preparedCnic.cnic_normalized,
      status: status || 'active',
    });

    return res.status(201).json({ supplier });
  } catch (error) {
    console.error('createSupplier error:', error);
    if (error.statusCode === 409) return res.status(409).json({ message: error.message });
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Supplier code already exists' });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const supplier = await db.Supplier.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const fields = [
      'company_name', 'contact_person', 'phone', 'email', 'address',
      'tax_number', 'payment_terms', 'status',
    ];
    fields.forEach(f => { if (req.body[f] !== undefined) supplier[f] = req.body[f]; });

    if (req.body.cnic !== undefined) {
      const preparedCnic = await assertCnicAvailable(shopId, req.body.cnic, { supplierId: supplier.id });
      supplier.cnic = preparedCnic.cnic;
      supplier.cnic_normalized = preparedCnic.cnic_normalized;
    }

    await supplier.save();

    return res.json({ supplier });
  } catch (error) {
    console.error('updateSupplier error:', error);
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

    const supplier = await db.Supplier.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const { pending } = await requestOrAllowDelete({
      req, res, shopId, module: 'suppliers', entityId: supplier.id, entityLabel: supplier.company_name,
    });
    if (pending) return;

    await supplier.update({ status: 'disabled' });
    return res.json({ message: 'Supplier disabled', supplier });
  } catch (error) {
    console.error('removeSupplier error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.linkProduct = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { product_id, purchase_price, supplier_product_code, preferred_supplier } = req.body;
    if (!product_id || purchase_price === undefined) {
      return res.status(400).json({ message: 'product_id and purchase_price are required' });
    }

    const supplier = await db.Supplier.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const product = await db.Product.findOne({ where: { id: product_id, shop_id: shopId } });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const [link] = await db.ProductSupplier.findOrCreate({
      where: { product_id, supplier_id: supplier.id },
      defaults: {
        purchase_price,
        supplier_product_code,
        preferred_supplier: preferred_supplier || false,
        status: 'active',
      },
    });

    if (!link.isNewRecord) {
      await link.update({ purchase_price, supplier_product_code, preferred_supplier, status: 'active' });
    }

    return res.status(201).json({ productSupplier: link });
  } catch (error) {
    console.error('linkProduct error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
