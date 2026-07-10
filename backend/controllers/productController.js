const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId, resolveBranchId } = require('../utils/shopScope');

const productIncludes = [
  { model: db.Category, attributes: ['id', 'name'] },
  { model: db.Stock, as: 'Stock', include: [{ model: db.Branch, attributes: ['id', 'name'] }] },
  { model: db.ProductSupplier, as: 'ProductSuppliers', include: [{ model: db.Supplier, attributes: ['id', 'company_name', 'supplier_code'] }] },
];

async function ensureStockRecord(productId, branchId, quantity, transaction) {
  const [stock] = await db.Stock.findOrCreate({
    where: { product_id: productId, branch_id: branchId },
    defaults: { quantity_on_hand: 0, quantity_reserved: 0 },
    transaction,
  });

  if (quantity > 0) {
    const newQty = stock.quantity_on_hand + quantity;
    await stock.update({ quantity_on_hand: newQty }, { transaction });
    await db.StockMovement.create({
      product_id: productId,
      branch_id: branchId,
      ref_type: 'purchase',
      ref_id: productId,
      quantity,
      balance_after: newQty,
    }, { transaction });
  }

  return stock;
}

exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.status && req.query.status !== 'all') where.status = req.query.status;
    if (req.query.category_id) where.category_id = req.query.category_id;
    if (req.query.search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${req.query.search}%` } },
        { sku: { [Op.like]: `%${req.query.search}%` } },
        { barcode: { [Op.like]: `%${req.query.search}%` } },
        { brand: { [Op.like]: `%${req.query.search}%` } },
      ];
    }

    const products = await db.Product.findAll({
      where,
      include: productIncludes,
      order: [['created_at', 'DESC']],
    });

    return res.json({ products });
  } catch (error) {
    console.error('listProducts error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const product = await db.Product.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: productIncludes,
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    return res.json({ product });
  } catch (error) {
    console.error('getProduct error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const {
      sku, barcode, name, category_id, brand, unit, tax_rate,
      reorder_level, cost_price, sale_price, status, image_url,
      supplier_id, initial_quantity, branch_id, purchase_price,
    } = req.body;

    if (!name || !category_id || cost_price === undefined || sale_price === undefined) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Name, category, cost price and sale price are required' });
    }

    const count = await db.Product.count({ where: { shop_id: shopId } });
    const productSku = sku || `SKU-${String(count + 1).padStart(5, '0')}`;

    const product = await db.Product.create({
      shop_id: shopId,
      sku: productSku,
      barcode,
      name,
      category_id,
      brand,
      unit: unit || 'Pcs',
      tax_rate: tax_rate || 0,
      reorder_level: reorder_level ?? 5,
      cost_price,
      sale_price,
      status: status || 'active',
      image_url,
    }, { transaction });

    let targetBranchId = branch_id || resolveBranchId(req);
    if (!targetBranchId) {
      const defaultBranch = await db.Branch.findOne({
        where: { shop_id: shopId, is_default: true },
        transaction,
      });
      targetBranchId = defaultBranch?.id;
    }

    if (targetBranchId && initial_quantity > 0) {
      await ensureStockRecord(product.id, targetBranchId, parseInt(initial_quantity, 10), transaction);
    } else if (targetBranchId) {
      await ensureStockRecord(product.id, targetBranchId, 0, transaction);
    }

    if (supplier_id) {
      await db.ProductSupplier.findOrCreate({
        where: { product_id: product.id, supplier_id },
        defaults: {
          purchase_price: purchase_price ?? cost_price,
          preferred_supplier: true,
          status: 'active',
        },
        transaction,
      });
    }

    await transaction.commit();

    const full = await db.Product.findByPk(product.id, { include: productIncludes });
    return res.status(201).json({ product: full });
  } catch (error) {
    await transaction.rollback();
    console.error('createProduct error:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'SKU or barcode already exists' });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const product = await db.Product.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const fields = [
      'barcode', 'name', 'category_id', 'brand', 'unit', 'tax_rate',
      'reorder_level', 'cost_price', 'sale_price', 'status', 'image_url',
    ];
    fields.forEach(f => { if (req.body[f] !== undefined) product[f] = req.body[f]; });
    await product.save();

    const full = await db.Product.findByPk(product.id, { include: productIncludes });
    return res.json({ product: full });
  } catch (error) {
    console.error('updateProduct error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const product = await db.Product.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    await product.update({ status: 'disabled' });
    return res.json({ message: 'Product disabled', product });
  } catch (error) {
    console.error('removeProduct error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
