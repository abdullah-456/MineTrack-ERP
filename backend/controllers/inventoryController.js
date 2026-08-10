const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId, resolveBranchId } = require('../utils/shopScope');
const { applySupplierStockPayment } = require('../utils/supplierPayment');
const { postVoucher } = require('../utils/postVoucher');
const { debitBankAccount, debitCashPayment, paymentAccountCode } = require('../utils/cashHelpers');
const { resolveListDateRange, applyDateRangeToWhere } = require('../utils/fiscalYear');
const { parseTransactionDate } = require('../utils/transactionDate');

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
        { name: { [Op.iLike]: `%${req.query.search}%` } },
        { sku: { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    const stockWhere = {};
    if (req.query.product_id) {
      stockWhere.product_id = parseInt(req.query.product_id, 10);
    }
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
      const val = parseFloat(m.net_sales || 0);
      netSalesMap[m.product_id] = val < 0 ? -val : 0;
    });

    const summary = products.map(p => {
      const stocks = p.Stock || [];
      const currentInventory = Math.round(stocks.reduce((sum, s) => sum + parseFloat(s.quantity_on_hand || 0), 0) * 1000) / 1000;
      const netSold = netSalesMap[p.id] || 0;
      const totalStock = Math.round((currentInventory + netSold) * 1000) / 1000;

      return {
        product_id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.Category?.name,
        reorder_level: p.reorder_level,
        total_stock: totalStock,
        current_inventory: currentInventory,
        stock_value: Math.round(currentInventory * parseFloat(p.cost_price) * 100) / 100,
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

    const absQty = Math.abs(parseFloat(quantity));
    const requestedDelta = direction === 'decrease' ? -absQty : absQty;
    const oldQty = parseFloat(stock.quantity_on_hand || 0);
    const newQty = Math.max(0, Math.round((oldQty + requestedDelta) * 1000) / 1000);
    // The floor-at-zero above can silently clamp a large decrease — log the
    // change actually applied, not the requested one, so the audit trail
    // (and anything built from it) doesn't disagree with quantity_on_hand.
    const actualDelta = Math.round((newQty - oldQty) * 1000) / 1000;
    await stock.update({ quantity_on_hand: newQty }, { transaction });

    // Record in stock_movements
    await db.StockMovement.create({
      product_id,
      branch_id,
      ref_type: 'adjustment',
      ref_id: stock.id,
      quantity: actualDelta,
      balance_after: newQty,
    }, { transaction });

    // Record in stock_adjustments
    await db.StockAdjustment.create({
      product_id,
      branch_id,
      quantity_change: actualDelta,
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

exports.transferStock = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const { product_id, from_branch_id, to_branch_id, quantity, notes } = req.body;
    if (!product_id || !from_branch_id || !to_branch_id || quantity === undefined || quantity === null || quantity === '') {
      await transaction.rollback();
      return res.status(400).json({ message: 'product_id, from_branch_id, to_branch_id and quantity are required' });
    }

    const fromBranchId = parseInt(from_branch_id, 10);
    const toBranchId = parseInt(to_branch_id, 10);
    if (fromBranchId === toBranchId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Source and destination branch must be different' });
    }

    const qty = parseFloat(quantity);
    if (!(qty > 0)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'quantity must be greater than 0' });
    }

    const product = await db.Product.findOne({ where: { id: product_id, shop_id: shopId }, transaction });
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }

    const fromBranch = await db.Branch.findOne({ where: { id: fromBranchId, shop_id: shopId }, transaction });
    const toBranch = await db.Branch.findOne({ where: { id: toBranchId, shop_id: shopId }, transaction });
    if (!fromBranch || !toBranch) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Invalid branch for this shop' });
    }

    const sourceStock = await db.Stock.findOne({
      where: { product_id, branch_id: fromBranchId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const available = parseFloat(sourceStock?.quantity_on_hand || 0);
    if (!sourceStock || available < qty) {
      await transaction.rollback();
      return res.status(400).json({
        message: `Insufficient stock at ${fromBranch.name}. Available: ${available}`,
      });
    }

    let destStock = await db.Stock.findOne({
      where: { product_id, branch_id: toBranchId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!destStock) {
      destStock = await db.Stock.create({
        product_id,
        branch_id: toBranchId,
        quantity_on_hand: 0,
        quantity_reserved: 0,
      }, { transaction });
    }

    const roundQty = (n) => Math.round(parseFloat(n) * 1000) / 1000;
    const newSourceQty = roundQty(available - qty);
    const newDestQty = roundQty(parseFloat(destStock.quantity_on_hand || 0) + qty);

    await sourceStock.update({ quantity_on_hand: newSourceQty }, { transaction });
    await destStock.update({ quantity_on_hand: newDestQty }, { transaction });

    const detail = notes?.trim()
      ? `${notes.trim()} — ${qty} ${product.unit || 'units'} of ${product.name}`
      : `${qty} ${product.unit || 'units'} of ${product.name}`;

    await db.StockMovement.create({
      product_id,
      branch_id: fromBranchId,
      ref_type: 'transfer',
      ref_id: toBranchId,
      quantity: -qty,
      balance_after: newSourceQty,
    }, { transaction });

    await db.StockMovement.create({
      product_id,
      branch_id: toBranchId,
      ref_type: 'transfer',
      ref_id: fromBranchId,
      quantity: qty,
      balance_after: newDestQty,
    }, { transaction });

    await db.StockAdjustment.create({
      product_id,
      branch_id: fromBranchId,
      quantity_change: -qty,
      reason: `Transfer to ${toBranch.name}`,
      approved_by: req.user?.id || null,
    }, { transaction });

    await db.StockAdjustment.create({
      product_id,
      branch_id: toBranchId,
      quantity_change: qty,
      reason: `Transfer from ${fromBranch.name}`,
      approved_by: req.user?.id || null,
    }, { transaction });

    await transaction.commit();

    const source = await db.Stock.findByPk(sourceStock.id, { include: stockIncludes });
    const dest = await db.Stock.findByPk(destStock.id, { include: stockIncludes });
    return res.json({
      message: 'Stock transferred successfully',
      detail,
      source,
      destination: dest,
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('transferStock error:', error);
    return res.status(500).json({ message: error.message || 'Internal server error' });
  }
};

exports.receiveStock = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const {
      product_id, branch_id, quantity, supplier_id, purchase_price, notes,
      payment_status, paid_amount, payment_method, bank_account_id, receipt_date,
    } = req.body;

    // Stock received before the software was in use needs its real date, or
    // migrated purchases all pile into the current fiscal year.
    const receiptDate = parseTransactionDate(receipt_date, 'receipt date');
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

    const [stock] = await db.Stock.findOrCreate({
      where: { product_id, branch_id },
      defaults: { quantity_on_hand: 0, quantity_reserved: 0 },
      transaction,
    });

    const qty = parseFloat(quantity);
    const newQty = Math.round((parseFloat(stock.quantity_on_hand || 0) + qty) * 1000) / 1000;
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
      const oldQty = newQty - qty; // qty already added above
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
        last_purchase_date: receiptDate,
        purchase_price: unitCost,
      }, { transaction });

      // Payment panel (Paid? Yes/No/Partial → amount, method) + PurchaseInvoice
      // + SupplierTransaction + GL voucher — shared with productController.create.
      const totalAmount = Math.round(unitCost * qty * 100) / 100;
      const stockNotes = `Received ${qty} ${product.unit || 'kg'} of ${product.name} at Rs. ${unitCost}/unit`;
      const finalNotes = notes?.trim() ? `${notes.trim()} — ${stockNotes}` : stockNotes;

      try {
        await applySupplierStockPayment({
          shopId,
          supplierRow,
          totalAmount,
          paymentStatus: payment_status,
          paidAmountInput: paid_amount,
          paymentMethod: payment_method,
          bankAccountId: bank_account_id,
          notes: finalNotes,
          createdBy: req.user.id,
          branchId: branch_id,
        }, transaction);
      } catch (err) {
        await transaction.rollback();
        return res.status(err.statusCode || 500).json({ message: err.message || 'Internal server error' });
      }
    } else {
      // No supplier attached — treat this as a direct cash/bank purchase of
      // stock: the buyer pays for it out of the shop's own cash or bank. Named
      // cash funds post to their own ledger sub-account; shared Cash in Hand
      // posts to 05-CASH and is tracked via the daily cash session.
      const stockValue = Math.round(unitCost * qty * 100) / 100;
      const stockNotes = `Received ${qty} ${product.unit || 'kg'} of ${product.name} at Rs. ${unitCost}/unit`;
      const finalNotes = notes?.trim() ? `${notes.trim()} — ${stockNotes}` : stockNotes;

      if (stockValue > 0) {
        const method = ['cash', 'bank'].includes(payment_method) ? payment_method : null;
        if (!method) {
          await transaction.rollback();
          return res.status(400).json({ message: 'payment_method (cash or bank) is required when receiving stock without a supplier' });
        }

        let bankAcc = null;
        if (method === 'bank') {
          bankAcc = await debitBankAccount(shopId, stockValue, transaction, bank_account_id);
        } else {
          bankAcc = await debitCashPayment(shopId, stockValue, transaction, bank_account_id);
        }

        await db.SupplierTransaction.create({
          shop_id: shopId,
          supplier_id: null,
          date: receiptDate,
          type: 'stock_received',
          total_amount: stockValue,
          paid_amount: stockValue,
          remaining_amount: 0,
          method,
          notes: finalNotes,
          created_by: req.user.id,
        }, { transaction });

        await postVoucher(shopId, {
          type: 'payment',
          date: receiptDate,
          narration: `Stock purchased (${method}) — ${finalNotes}`,
          createdBy: req.user.id,
          branchId: branch_id,
          lines: [
            { accountCode: '05-STOCK', debit: stockValue },
            { accountCode: paymentAccountCode(method, bankAcc), credit: stockValue },
          ],
        }, transaction);
      }
    }

    await transaction.commit();
    const updated = await db.Stock.findByPk(stock.id, { include: stockIncludes });
    return res.json({ stock: updated, message: 'Stock received successfully' });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('receiveStock error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

exports.movements = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = {};
    if (req.query.product_id) where.product_id = req.query.product_id;
    if (req.query.branch_id) where.branch_id = req.query.branch_id;

    // Stock movements carry no business date of their own, so the audit
    // timestamp is what scopes them to the fiscal year being viewed.
    const range = await resolveListDateRange(req, shopId);
    applyDateRangeToWhere(where, 'created_at', range);

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
