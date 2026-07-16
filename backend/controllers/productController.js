const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId, resolveBranchId } = require('../utils/shopScope');
const { applySupplierStockPayment, applyDirectStockPayment } = require('../utils/supplierPayment');
const { requestOrAllowDelete } = require('../utils/deletionRequest');

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
    const newQty = Math.round((parseFloat(stock.quantity_on_hand || 0) + quantity) * 1000) / 1000;
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
      payment_status, paid_amount, payment_method, notes,
    } = req.body;

    if (!name || !category_id || sale_price === undefined) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Name, category and sale price are required' });
    }

    const initialQty = parseFloat(initial_quantity) || 0;

    let supplierRow = null;
    if (supplier_id) {
      supplierRow = await db.Supplier.findOne({
        where: { id: parseInt(supplier_id, 10), shop_id: shopId },
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!supplierRow) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Invalid supplier for this shop' });
      }
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
      cost_price: parseFloat(cost_price) || 0,
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

    if (targetBranchId && initialQty > 0) {
      await ensureStockRecord(product.id, targetBranchId, initialQty, transaction);
    } else if (targetBranchId) {
      await ensureStockRecord(product.id, targetBranchId, 0, transaction);
    }

    let voucherId = null;

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

      // Bringing in initial stock tied to a supplier goes through the same
      // payable/payment path as inventoryController.receiveStock, so it
      // always hits the supplier ledger + GL — not just a silent stock bump.
      if (initialQty > 0) {
        const stockNotes = `Initial stock: ${initialQty} ${unit || 'Pcs'} of ${name} at Rs. ${cost_price}/unit`;
        const finalNotes = notes?.trim() ? `${notes.trim()} — ${stockNotes}` : stockNotes;
        try {
          const { voucher } = await applySupplierStockPayment({
            shopId,
            supplierRow,
            totalAmount: (parseFloat(cost_price) || 0) * initialQty,
            paymentStatus: payment_status,
            paidAmountInput: paid_amount,
            paymentMethod: payment_method,
            notes: finalNotes,
            createdBy: req.user.id,
          }, transaction);
          voucherId = voucher.id;
        } catch (err) {
          await transaction.rollback();
          return res.status(err.statusCode || 500).json({ message: err.message || 'Internal server error' });
        }
      }
    } else if (initialQty > 0) {
      const stockValue = Math.round((parseFloat(cost_price) || 0) * initialQty * 100) / 100;
      if (stockValue > 0) {
        const stockNotes = `Initial stock: ${initialQty} ${unit || 'Pcs'} of ${name} at Rs. ${cost_price}/unit`;
        const finalNotes = notes?.trim() ? `${notes.trim()} — ${stockNotes}` : stockNotes;
        try {
          const { voucher } = await applyDirectStockPayment({
            shopId,
            totalAmount: stockValue,
            paymentStatus: payment_status,
            paidAmountInput: paid_amount,
            paymentMethod: payment_method,
            notes: finalNotes,
            createdBy: req.user.id,
          }, transaction);
          voucherId = voucher.id;
        } catch (err) {
          await transaction.rollback();
          return res.status(err.statusCode || 500).json({ message: err.message || 'Internal server error' });
        }
      }
    }

    await transaction.commit();

    const full = await db.Product.findByPk(product.id, { include: productIncludes });
    return res.status(201).json({ product: full, voucher_id: voucherId });
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

    const { pending } = await requestOrAllowDelete({
      req, res, shopId, module: 'products', entityId: product.id, entityLabel: product.name,
    });
    if (pending) return;

    await product.update({ status: 'disabled' });
    return res.json({ message: 'Product disabled', product });
  } catch (error) {
    console.error('removeProduct error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
