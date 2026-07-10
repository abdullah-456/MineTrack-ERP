const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId, resolveBranchId } = require('../utils/shopScope');

const stockIncludes = [
  {
    model: db.Product,
    attributes: ['id', 'name', 'sku', 'brand', 'reorder_level', 'cost_price', 'sale_price', 'status'],
    include: [
      { model: db.Category, attributes: ['id', 'name'] },
      { model: db.ProductSupplier, as: 'ProductSuppliers', include: [{ model: db.Supplier, attributes: ['id', 'company_name', 'supplier_code'] }] },
    ],
  },
  { model: db.Branch, attributes: ['id', 'name'] },
];

exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const branchId = req.query.branch_id ? parseInt(req.query.branch_id, 10) : resolveBranchId(req);
    const role = req.user.Role?.name;

    const productWhere = { shop_id: shopId, status: 'active' };
    if (req.query.search) {
      productWhere[Op.or] = [
        { name: { [Op.like]: `%${req.query.search}%` } },
        { sku: { [Op.like]: `%${req.query.search}%` } },
      ];
    }

    const stockWhere = {};
    if (branchId && role !== 'super_admin' && role !== 'admin') {
      stockWhere.branch_id = branchId;
    } else if (req.query.branch_id) {
      stockWhere.branch_id = parseInt(req.query.branch_id, 10);
    }

    const stock = await db.Stock.findAll({
      where: stockWhere,
      include: [{
        model: db.Product,
        where: productWhere,
        include: [
          { model: db.Category, attributes: ['id', 'name'] },
          { model: db.ProductSupplier, as: 'ProductSuppliers', include: [{ model: db.Supplier, attributes: ['id', 'company_name'] }] },
        ],
      }, { model: db.Branch, attributes: ['id', 'name'] }],
      order: [[db.Product, 'name', 'ASC']],
    });

    return res.json({ inventory: stock });
  } catch (error) {
    console.error('listInventory error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.summary = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const products = await db.Product.findAll({
      where: { shop_id: shopId, status: 'active' },
      attributes: ['id', 'name', 'sku', 'reorder_level', 'cost_price', 'sale_price'],
      include: [
        { model: db.Stock, as: 'Stock', attributes: ['quantity_on_hand', 'branch_id'] },
        { model: db.Category, attributes: ['name'] },
      ],
    });

    // Fetch net sales (sales and returns) per product
    const saleMovements = await db.StockMovement.findAll({
      attributes: [
        'product_id',
        [db.sequelize.fn('SUM', db.sequelize.col('quantity')), 'net_sales']
      ],
      where: {
        ref_type: { [Op.in]: ['sale', 'sale_return'] }
      },
      group: ['product_id'],
      raw: true
    });

    const netSalesMap = {};
    saleMovements.forEach(m => {
      // Since sales are negative and returns are positive, net_sales will be negative.
      // We take the absolute value of net_sales if it is negative to represent positive net units sold.
      const val = parseInt(m.net_sales || 0, 10);
      netSalesMap[m.product_id] = val < 0 ? -val : 0;
    });

    const summary = products.map(p => {
      const stocks = p.Stock || [];
      const currentInventory = stocks.reduce((sum, s) => sum + s.quantity_on_hand, 0);
      const netSold = netSalesMap[p.id] || 0;
      const totalStock = currentInventory + netSold;

      return {
        product_id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.Category?.name,
        reorder_level: p.reorder_level,
        total_stock: totalStock,
        current_inventory: currentInventory,
        stock_value: currentInventory * parseFloat(p.cost_price),
        low_stock: currentInventory <= p.reorder_level,
        branches: stocks.length,
      };
    });

    const totals = {
      total_products: summary.length,
      total_units: summary.reduce((s, i) => s + i.current_inventory, 0),
      total_value: summary.reduce((s, i) => s + i.stock_value, 0),
      low_stock_count: summary.filter(i => i.low_stock).length,
      out_of_stock: summary.filter(i => i.current_inventory === 0).length,
    };

    return res.json({ summary, totals });
  } catch (error) {
    console.error('inventorySummary error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.adjust = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const { product_id, branch_id, quantity, direction, reason, notes } = req.body;
    if (!product_id || !branch_id || quantity === undefined || quantity === null || quantity === '') {
      await transaction.rollback();
      return res.status(400).json({ message: 'product_id, branch_id and quantity are required' });
    }
    if (!reason || !String(reason).trim()) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Reason is required for stock adjustment' });
    }

    const product = await db.Product.findOne({ where: { id: product_id, shop_id: shopId }, transaction });
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }

    const branchOk = await db.Branch.findOne({ where: { id: branch_id, shop_id: shopId }, transaction });
    if (!branchOk) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Invalid branch for this shop' });
    }

    const [stock] = await db.Stock.findOrCreate({
      where: { product_id, branch_id },
      defaults: { quantity_on_hand: 0, quantity_reserved: 0 },
      transaction,
    });

    const absQty = Math.abs(parseInt(quantity, 10));
    const delta = direction === 'decrease' ? -absQty : absQty;
    const newQty = Math.max(0, stock.quantity_on_hand + delta);
    await stock.update({ quantity_on_hand: newQty }, { transaction });

    // Record in stock_movements
    await db.StockMovement.create({
      product_id,
      branch_id,
      ref_type: 'adjustment',
      ref_id: stock.id,
      quantity: delta,
      balance_after: newQty,
    }, { transaction });

    // Record in stock_adjustments
    await db.StockAdjustment.create({
      product_id,
      branch_id,
      quantity_change: delta,
      reason: String(reason).trim(),
      approved_by: req.user?.id || null,
    }, { transaction });

    await transaction.commit();

    const updated = await db.Stock.findByPk(stock.id, { include: stockIncludes });
    return res.json({ stock: updated, message: 'Stock adjusted successfully' });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('adjustInventory error:', error);
    return res.status(500).json({ message: error.message || 'Internal server error' });
  }
};

exports.receiveStock = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const { product_id, branch_id, quantity, supplier_id, purchase_price, notes } = req.body;
    if (!product_id || !branch_id || !quantity) {
      await transaction.rollback();
      return res.status(400).json({ message: 'product_id, branch_id and quantity are required' });
    }

    const product = await db.Product.findOne({ where: { id: product_id, shop_id: shopId }, transaction });
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }

    const branchOk = await db.Branch.findOne({ where: { id: branch_id, shop_id: shopId }, transaction });
    if (!branchOk) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Invalid branch for this shop' });
    }

    if (supplier_id) {
      const supOk = await db.Supplier.findOne({ where: { id: parseInt(supplier_id, 10), shop_id: shopId }, transaction });
      if (!supOk) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Invalid supplier for this shop' });
      }
    }

    const [stock] = await db.Stock.findOrCreate({
      where: { product_id, branch_id },
      defaults: { quantity_on_hand: 0, quantity_reserved: 0 },
      transaction,
    });

    const qty = parseInt(quantity, 10);
    const newQty = stock.quantity_on_hand + qty;
    await stock.update({ quantity_on_hand: newQty }, { transaction });

    // Record in stock_movements
    await db.StockMovement.create({
      product_id,
      branch_id,
      ref_type: 'purchase',
      ref_id: supplier_id ? parseInt(supplier_id, 10) : 0,
      quantity: qty,
      balance_after: newQty,
    }, { transaction });

    // Update product cost price using WEIGHTED AVERAGE (not overwrite) so
    // historical valuation stays consistent.
    const unitCost = purchase_price ? parseFloat(purchase_price) : parseFloat(product.cost_price || 0);
    if (purchase_price) {
      const oldQty = stock.quantity_on_hand - qty; // qty already added above
      const oldCost = parseFloat(product.cost_price || 0);
      const denom = oldQty + qty;
      const avgCost = denom > 0
        ? Math.round(((oldQty * oldCost + qty * unitCost) / denom) * 100) / 100
        : unitCost;
      await product.update({ cost_price: avgCost }, { transaction });
    }

    if (supplier_id) {
      const [link] = await db.ProductSupplier.findOrCreate({
        where: { product_id, supplier_id: parseInt(supplier_id, 10) },
        defaults: { purchase_price: unitCost, status: 'active' },
        transaction,
      });
      await link.update({
        last_purchase_price: unitCost,
        last_purchase_date: new Date(),
        purchase_price: unitCost,
      }, { transaction });

      // Auto-create PurchaseInvoice for the stock receipt (grn_id is nullable now)
      const pinvCount = await db.PurchaseInvoice.count({ transaction });
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const invoice_number = `PINV-${dateStr}-${String(pinvCount + 1).padStart(4, '0')}`;
      const totalAmount = unitCost * qty;

      await db.PurchaseInvoice.create({
        supplier_id: parseInt(supplier_id, 10),
        grn_id: null,
        invoice_number,
        invoice_date: new Date(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
        amount: totalAmount,
        status: 'unpaid', // receiving goods does NOT mean the supplier has been paid
      }, { transaction });
    }

    await transaction.commit();
    const updated = await db.Stock.findByPk(stock.id, { include: stockIncludes });
    return res.json({ stock: updated, message: 'Stock received successfully' });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('receiveStock error:', error);
    return res.status(500).json({ message: error.message || 'Internal server error' });
  }
};

exports.movements = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = {};
    if (req.query.product_id) where.product_id = req.query.product_id;
    if (req.query.branch_id) where.branch_id = req.query.branch_id;

    const movements = await db.StockMovement.findAll({
      where,
      include: [
        { model: db.Product, where: { shop_id: shopId }, attributes: ['id', 'name', 'sku'] },
        { model: db.Branch, attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
      limit: 100,
    });

    return res.json({ movements });
  } catch (error) {
    console.error('movements error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
