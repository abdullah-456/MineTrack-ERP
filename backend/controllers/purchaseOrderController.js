const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const {
  calcLineTotal, calcOrderTotals, generatePoNumber, refreshPurchaseOrderStatus, roundQty, round2,
} = require('../utils/stockReceipt');
const { resolveListDateRange, applyDateRangeToWhere } = require('../utils/fiscalYear');

const poIncludes = [
  { model: db.Shop, attributes: ['id', 'name', 'owner_name', 'email', 'phone', 'address', 'logo_url'] },
  { model: db.Supplier, attributes: ['id', 'company_name', 'supplier_code', 'phone', 'address'] },
  { model: db.Branch, attributes: ['id', 'name'] },
  { model: db.User, as: 'Creator', attributes: ['id', 'name'] },
  {
    model: db.PurchaseOrderItem,
    as: 'PurchaseOrderItems',
    include: [{ model: db.Product, attributes: ['id', 'name', 'sku', 'unit'] }],
  },
];

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) {
    const err = new Error('At least one line item is required');
    err.statusCode = 400;
    throw err;
  }
  return rawItems.map((row, idx) => {
    const qty = roundQty(row.quantity_ordered ?? row.quantity);
    const unitCost = round2(row.unit_cost ?? row.unit_price ?? 0);
    if (!row.product_id) {
      const err = new Error(`Line ${idx + 1}: product is required`);
      err.statusCode = 400;
      throw err;
    }
    if (!(qty > 0)) {
      const err = new Error(`Line ${idx + 1}: quantity must be greater than 0`);
      err.statusCode = 400;
      throw err;
    }
    return {
      product_id: parseInt(row.product_id, 10),
      quantity_ordered: qty,
      unit_cost: unitCost,
      line_total: calcLineTotal(qty, unitCost),
      notes: row.notes?.trim() || null,
    };
  });
}

exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.status && req.query.status !== 'all') where.status = req.query.status;
    if (req.query.supplier_id) where.supplier_id = parseInt(req.query.supplier_id, 10);

    // Scoped to the fiscal year being viewed, so a new year opens with an empty
    // list and picking a past year shows exactly that year's orders.
    const range = await resolveListDateRange(req, shopId);
    applyDateRangeToWhere(where, 'order_date', range);

    if (req.query.search) {
      where[Op.or] = [
        { po_number: { [Op.iLike]: `%${req.query.search}%` } },
        { '$Supplier.company_name$': { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    const orders = await db.PurchaseOrder.findAll({
      where,
      include: poIncludes,
      order: [['order_date', 'DESC'], ['id', 'DESC']],
      limit: 100,
      subQuery: false,
    });

    return res.json({ purchase_orders: orders });
  } catch (error) {
    console.error('listPurchaseOrders error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const order = await db.PurchaseOrder.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: [
        ...poIncludes,
        {
          model: db.GoodsReceiptNote,
          attributes: ['id', 'grn_number', 'receipt_date', 'status', 'total'],
          order: [['receipt_date', 'DESC']],
        },
      ],
    });
    if (!order) return res.status(404).json({ message: 'Purchase order not found' });
    return res.json({ purchase_order: order });
  } catch (error) {
    console.error('getPurchaseOrder error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getReceivable = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const order = await db.PurchaseOrder.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: [
        { model: db.Supplier, attributes: ['id', 'company_name', 'supplier_code'] },
        { model: db.Branch, attributes: ['id', 'name'] },
        {
          model: db.PurchaseOrderItem,
          as: 'PurchaseOrderItems',
          include: [{ model: db.Product, attributes: ['id', 'name', 'sku', 'unit', 'cost_price'] }],
        },
      ],
    });
    if (!order) return res.status(404).json({ message: 'Purchase order not found' });
    if (!['sent', 'partially_received'].includes(order.status)) {
      return res.status(400).json({ message: 'Only sent or partially received orders can be received against' });
    }

    const lines = (order.PurchaseOrderItems || []).map(item => {
      const ordered = roundQty(item.quantity_ordered);
      const received = roundQty(item.quantity_received);
      const pending = roundQty(Math.max(0, ordered - received));
      return {
        purchase_order_item_id: item.id,
        product_id: item.product_id,
        product: item.Product,
        quantity_ordered: ordered,
        quantity_received: received,
        quantity_pending: pending,
        unit_cost: parseFloat(item.unit_cost),
      };
    }).filter(l => l.quantity_pending > 0);

    return res.json({ purchase_order: order, receivable_lines: lines });
  } catch (error) {
    console.error('getReceivablePO error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const {
      supplier_id, branch_id, order_date, expected_date,
      discount, tax, notes, items, status,
    } = req.body;

    if (!supplier_id) {
      await transaction.rollback();
      return res.status(400).json({ message: 'supplier_id is required' });
    }

    const supplier = await db.Supplier.findOne({
      where: { id: parseInt(supplier_id, 10), shop_id: shopId },
      transaction,
    });
    if (!supplier) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Invalid supplier for this shop' });
    }

    if (branch_id) {
      const branchOk = await db.Branch.findOne({ where: { id: branch_id, shop_id: shopId }, transaction });
      if (!branchOk) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Invalid branch for this shop' });
      }
    }

    const normalizedItems = normalizeItems(items);
    const productIds = normalizedItems.map(i => i.product_id);
    const productCount = await db.Product.count({
      where: { id: { [Op.in]: productIds }, shop_id: shopId },
      transaction,
    });
    if (productCount !== productIds.length) {
      await transaction.rollback();
      return res.status(400).json({ message: 'One or more products are invalid for this shop' });
    }

    const totals = calcOrderTotals(normalizedItems, discount, tax);
    const poNumber = await generatePoNumber(shopId, transaction);
    const initialStatus = status === 'sent' ? 'sent' : 'draft';

    const order = await db.PurchaseOrder.create({
      shop_id: shopId,
      supplier_id: supplier.id,
      branch_id: branch_id || null,
      po_number: poNumber,
      order_date: order_date || new Date().toISOString().slice(0, 10),
      expected_date: expected_date || null,
      ...totals,
      status: initialStatus,
      notes: notes?.trim() || null,
      created_by: req.user.id,
    }, { transaction });

    await db.PurchaseOrderItem.bulkCreate(
      normalizedItems.map(row => ({ ...row, purchase_order_id: order.id })),
      { transaction },
    );

    await transaction.commit();

    const created = await db.PurchaseOrder.findByPk(order.id, { include: poIncludes });
    return res.status(201).json({ message: 'Purchase order created', purchase_order: created });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error('createPurchaseOrder error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const order = await db.PurchaseOrder.findOne({
      where: { id: req.params.id, shop_id: shopId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!order) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    if (order.status !== 'draft') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Only draft purchase orders can be edited' });
    }

    const {
      supplier_id, branch_id, order_date, expected_date,
      discount, tax, notes, items,
    } = req.body;

    if (supplier_id) {
      const supplier = await db.Supplier.findOne({
        where: { id: parseInt(supplier_id, 10), shop_id: shopId },
        transaction,
      });
      if (!supplier) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Invalid supplier for this shop' });
      }
    }

    let normalizedItems = null;
    if (items) {
      normalizedItems = normalizeItems(items);
      const productIds = normalizedItems.map(i => i.product_id);
      const productCount = await db.Product.count({
        where: { id: { [Op.in]: productIds }, shop_id: shopId },
        transaction,
      });
      if (productCount !== productIds.length) {
        await transaction.rollback();
        return res.status(400).json({ message: 'One or more products are invalid for this shop' });
      }
      await db.PurchaseOrderItem.destroy({ where: { purchase_order_id: order.id }, transaction });
      await db.PurchaseOrderItem.bulkCreate(
        normalizedItems.map(row => ({ ...row, purchase_order_id: order.id })),
        { transaction },
      );
    }

    const totals = normalizedItems
      ? calcOrderTotals(normalizedItems, discount ?? order.discount, tax ?? order.tax)
      : calcOrderTotals(
        (await db.PurchaseOrderItem.findAll({ where: { purchase_order_id: order.id }, transaction })).map(i => ({
          quantity_ordered: i.quantity_ordered,
          unit_cost: i.unit_cost,
        })),
        discount ?? order.discount,
        tax ?? order.tax,
      );

    await order.update({
      supplier_id: supplier_id ? parseInt(supplier_id, 10) : order.supplier_id,
      branch_id: branch_id !== undefined ? (branch_id || null) : order.branch_id,
      order_date: order_date || order.order_date,
      expected_date: expected_date !== undefined ? (expected_date || null) : order.expected_date,
      notes: notes !== undefined ? (notes?.trim() || null) : order.notes,
      ...totals,
    }, { transaction });

    await transaction.commit();
    const updated = await db.PurchaseOrder.findByPk(order.id, { include: poIncludes });
    return res.json({ message: 'Purchase order updated', purchase_order: updated });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error('updatePurchaseOrder error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.send = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const order = await db.PurchaseOrder.findOne({
      where: { id: req.params.id, shop_id: shopId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!order) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    if (order.status !== 'draft') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Only draft orders can be sent' });
    }
    const itemCount = await db.PurchaseOrderItem.count({
      where: { purchase_order_id: order.id },
      transaction,
    });
    if (!itemCount) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Add at least one line item before sending' });
    }

    await order.update({ status: 'sent' }, { transaction });
    await transaction.commit();

    const updated = await db.PurchaseOrder.findByPk(order.id, { include: poIncludes });
    return res.json({ message: 'Purchase order sent to supplier', purchase_order: updated });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('sendPurchaseOrder error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.cancel = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const order = await db.PurchaseOrder.findOne({
      where: { id: req.params.id, shop_id: shopId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!order) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    if (!['draft', 'sent'].includes(order.status)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Cannot cancel an order that has receipts' });
    }

    await order.update({ status: 'cancelled' }, { transaction });
    await transaction.commit();

    const updated = await db.PurchaseOrder.findByPk(order.id, { include: poIncludes });
    return res.json({ message: 'Purchase order cancelled', purchase_order: updated });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('cancelPurchaseOrder error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const order = await db.PurchaseOrder.findOne({
      where: { id: req.params.id, shop_id: shopId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!order) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    if (order.status !== 'draft') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Only draft purchase orders can be deleted' });
    }

    await db.PurchaseOrderItem.destroy({ where: { purchase_order_id: order.id }, transaction });
    await order.destroy({ transaction });
    await transaction.commit();
    return res.json({ message: 'Purchase order deleted' });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('deletePurchaseOrder error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Used internally when GRN is posted
exports.refreshPurchaseOrderStatus = refreshPurchaseOrderStatus;
