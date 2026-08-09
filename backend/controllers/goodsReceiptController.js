const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { applySupplierStockPayment } = require('../utils/supplierPayment');
const {
  receiveProductStockLine,
  calcLineTotal,
  generateGrnNumber,
  refreshPurchaseOrderStatus,
  roundQty,
  round2,
} = require('../utils/stockReceipt');
const { resolveListDateRange, applyDateRangeToWhere } = require('../utils/fiscalYear');

const grnIncludes = [
  { model: db.Supplier, attributes: ['id', 'company_name', 'supplier_code', 'phone'] },
  { model: db.Branch, attributes: ['id', 'name'] },
  { model: db.PurchaseOrder, attributes: ['id', 'po_number', 'status'] },
  { model: db.User, as: 'Receiver', attributes: ['id', 'name'] },
  {
    model: db.GoodsReceiptNoteItem,
    as: 'GoodsReceiptNoteItems',
    include: [{ model: db.Product, attributes: ['id', 'name', 'sku', 'unit'] }],
  },
  {
    model: db.PurchaseInvoice,
    attributes: ['id', 'invoice_number', 'amount', 'status'],
    required: false,
  },
];

function normalizeGrnItems(rawItems, defaultBranchId) {
  if (!Array.isArray(rawItems) || !rawItems.length) {
    const err = new Error('At least one receipt line is required');
    err.statusCode = 400;
    throw err;
  }
  return rawItems.map((row, idx) => {
    const qty = roundQty(row.quantity_received ?? row.quantity);
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
      purchase_order_item_id: row.purchase_order_item_id ? parseInt(row.purchase_order_item_id, 10) : null,
      branch_id: parseInt(row.branch_id || defaultBranchId, 10),
      quantity_received: qty,
      unit_cost: unitCost,
      line_total: calcLineTotal(qty, unitCost),
    };
  });
}

async function validatePoReceiptLines(shopId, purchaseOrderId, items, transaction) {
  const po = await db.PurchaseOrder.findOne({
    where: { id: purchaseOrderId, shop_id: shopId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!po) {
    const err = new Error('Purchase order not found');
    err.statusCode = 404;
    throw err;
  }
  if (!['sent', 'partially_received'].includes(po.status)) {
    const err = new Error('Purchase order is not open for receiving');
    err.statusCode = 400;
    throw err;
  }

  const poItems = await db.PurchaseOrderItem.findAll({
    where: { purchase_order_id: purchaseOrderId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const poItemMap = new Map(poItems.map(i => [i.id, i]));
  for (const line of items) {
    if (!line.purchase_order_item_id) {
      const err = new Error('Each line must reference a purchase order item when receiving against a PO');
      err.statusCode = 400;
      throw err;
    }
    const poItem = poItemMap.get(line.purchase_order_item_id);
    if (!poItem || poItem.product_id !== line.product_id) {
      const err = new Error('Invalid purchase order line reference');
      err.statusCode = 400;
      throw err;
    }
    const pending = roundQty(parseFloat(poItem.quantity_ordered) - parseFloat(poItem.quantity_received));
    if (line.quantity_received > pending + 0.0001) {
      const err = new Error(`Cannot receive more than pending quantity for this PO line. Pending: ${pending}`);
      err.statusCode = 400;
      throw err;
    }
  }
  return po;
}

async function loadLockedGrnWithItems(grnId, shopId, transaction) {
  const receipt = await db.GoodsReceiptNote.findOne({
    where: { id: grnId, shop_id: shopId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!receipt) return null;

  const grnItems = await db.GoodsReceiptNoteItem.findAll({
    where: { goods_receipt_note_id: grnId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (grnItems.length) {
    const productIds = [...new Set(grnItems.map(i => i.product_id))];
    const products = await db.Product.findAll({
      where: { id: { [Op.in]: productIds } },
      attributes: ['id', 'name', 'unit'],
      transaction,
    });
    const productMap = new Map(products.map(p => [p.id, p]));
    for (const item of grnItems) {
      item.Product = productMap.get(item.product_id) || null;
    }
  }

  receipt.GoodsReceiptNoteItems = grnItems;
  return receipt;
}

exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.status && req.query.status !== 'all') where.status = req.query.status;
    if (req.query.supplier_id) where.supplier_id = parseInt(req.query.supplier_id, 10);
    if (req.query.purchase_order_id) where.purchase_order_id = parseInt(req.query.purchase_order_id, 10);

    // Scoped to the fiscal year being viewed — see purchaseOrderController.list.
    const range = await resolveListDateRange(req, shopId);
    applyDateRangeToWhere(where, 'receipt_date', range);

    if (req.query.search) {
      where[Op.or] = [
        { grn_number: { [Op.iLike]: `%${req.query.search}%` } },
        { supplier_invoice_number: { [Op.iLike]: `%${req.query.search}%` } },
        { '$Supplier.company_name$': { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    const receipts = await db.GoodsReceiptNote.findAll({
      where,
      include: grnIncludes,
      order: [['receipt_date', 'DESC'], ['id', 'DESC']],
      limit: 100,
      subQuery: false,
    });

    return res.json({ goods_receipts: receipts });
  } catch (error) {
    console.error('listGoodsReceipts error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const receipt = await db.GoodsReceiptNote.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: grnIncludes,
    });
    if (!receipt) return res.status(404).json({ message: 'Goods receipt not found' });
    return res.json({ goods_receipt: receipt });
  } catch (error) {
    console.error('getGoodsReceipt error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const {
      supplier_id, purchase_order_id, branch_id, receipt_date,
      supplier_invoice_number, notes, items,
    } = req.body;

    if (!supplier_id || !branch_id) {
      await transaction.rollback();
      return res.status(400).json({ message: 'supplier_id and branch_id are required' });
    }

    const supplier = await db.Supplier.findOne({
      where: { id: parseInt(supplier_id, 10), shop_id: shopId },
      transaction,
    });
    if (!supplier) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Invalid supplier for this shop' });
    }

    const branchOk = await db.Branch.findOne({ where: { id: branch_id, shop_id: shopId }, transaction });
    if (!branchOk) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Invalid branch for this shop' });
    }

    const normalizedItems = normalizeGrnItems(items, branch_id);

    if (purchase_order_id) {
      await validatePoReceiptLines(shopId, parseInt(purchase_order_id, 10), normalizedItems, transaction);
    }

    const subtotal = round2(normalizedItems.reduce((s, i) => s + i.line_total, 0));
    const grnNumber = await generateGrnNumber(shopId, transaction);

    const receipt = await db.GoodsReceiptNote.create({
      shop_id: shopId,
      supplier_id: supplier.id,
      purchase_order_id: purchase_order_id ? parseInt(purchase_order_id, 10) : null,
      branch_id,
      grn_number: grnNumber,
      receipt_date: receipt_date ? new Date(receipt_date) : new Date(),
      supplier_invoice_number: supplier_invoice_number?.trim() || null,
      subtotal,
      total: subtotal,
      status: 'draft',
      notes: notes?.trim() || null,
      received_by: req.user.id,
    }, { transaction });

    await db.GoodsReceiptNoteItem.bulkCreate(
      normalizedItems.map(row => ({ ...row, goods_receipt_note_id: receipt.id })),
      { transaction },
    );

    await transaction.commit();
    const created = await db.GoodsReceiptNote.findByPk(receipt.id, { include: grnIncludes });
    return res.status(201).json({ message: 'Goods receipt draft created', goods_receipt: created });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error('createGoodsReceipt error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const receipt = await db.GoodsReceiptNote.findOne({
      where: { id: req.params.id, shop_id: shopId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!receipt) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Goods receipt not found' });
    }
    if (receipt.status !== 'draft') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Only draft receipts can be edited' });
    }

    const { branch_id, receipt_date, supplier_invoice_number, notes, items } = req.body;
    const branchId = branch_id || receipt.branch_id;

    if (items) {
      const normalizedItems = normalizeGrnItems(items, branchId);
      if (receipt.purchase_order_id) {
        await validatePoReceiptLines(shopId, receipt.purchase_order_id, normalizedItems, transaction);
      }
      await db.GoodsReceiptNoteItem.destroy({ where: { goods_receipt_note_id: receipt.id }, transaction });
      await db.GoodsReceiptNoteItem.bulkCreate(
        normalizedItems.map(row => ({ ...row, goods_receipt_note_id: receipt.id })),
        { transaction },
      );
      const subtotal = round2(normalizedItems.reduce((s, i) => s + i.line_total, 0));
      await receipt.update({
        branch_id: branchId,
        receipt_date: receipt_date ? new Date(receipt_date) : receipt.receipt_date,
        supplier_invoice_number: supplier_invoice_number !== undefined ? (supplier_invoice_number?.trim() || null) : receipt.supplier_invoice_number,
        notes: notes !== undefined ? (notes?.trim() || null) : receipt.notes,
        subtotal,
        total: subtotal,
      }, { transaction });
    } else {
      await receipt.update({
        branch_id: branchId,
        receipt_date: receipt_date ? new Date(receipt_date) : receipt.receipt_date,
        supplier_invoice_number: supplier_invoice_number !== undefined ? (supplier_invoice_number?.trim() || null) : receipt.supplier_invoice_number,
        notes: notes !== undefined ? (notes?.trim() || null) : receipt.notes,
      }, { transaction });
    }

    await transaction.commit();
    const updated = await db.GoodsReceiptNote.findByPk(receipt.id, { include: grnIncludes });
    return res.json({ message: 'Goods receipt updated', goods_receipt: updated });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error('updateGoodsReceipt error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const receipt = await db.GoodsReceiptNote.findOne({
      where: { id: req.params.id, shop_id: shopId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!receipt) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Goods receipt not found' });
    }
    if (receipt.status !== 'draft') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Only draft receipts can be deleted' });
    }

    await db.GoodsReceiptNoteItem.destroy({ where: { goods_receipt_note_id: receipt.id }, transaction });
    await receipt.destroy({ transaction });
    await transaction.commit();
    return res.json({ message: 'Goods receipt deleted' });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('deleteGoodsReceipt error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

async function postGoodsReceiptInTransaction(receipt, shopId, body, userId, transaction) {
  const {
    payment_status, paid_amount, payment_method, bank_account_id, notes,
  } = body;

  if (receipt.status !== 'draft') {
    const err = new Error('This receipt has already been posted');
    err.statusCode = 400;
    throw err;
  }
  if (!receipt.GoodsReceiptNoteItems?.length) {
    const err = new Error('Add at least one line before posting');
    err.statusCode = 400;
    throw err;
  }

  const supplierRow = await db.Supplier.findOne({
    where: { id: receipt.supplier_id, shop_id: shopId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!supplierRow) {
    const err = new Error('Supplier not found');
    err.statusCode = 400;
    throw err;
  }

  if (receipt.purchase_order_id) {
    await validatePoReceiptLines(
      shopId,
      receipt.purchase_order_id,
      receipt.GoodsReceiptNoteItems.map(i => ({
        product_id: i.product_id,
        purchase_order_item_id: i.purchase_order_item_id,
        quantity_received: i.quantity_received,
      })),
      transaction,
    );
  }

  const invoiceItems = [];
  for (const line of receipt.GoodsReceiptNoteItems) {
    await receiveProductStockLine({
      shopId,
      productId: line.product_id,
      branchId: line.branch_id,
      quantity: line.quantity_received,
      unitCost: line.unit_cost,
      supplierId: supplierRow.id,
      refType: 'purchase',
      refId: receipt.id,
      transaction,
    });

    if (line.purchase_order_item_id) {
      const poItem = await db.PurchaseOrderItem.findByPk(line.purchase_order_item_id, { transaction, lock: transaction.LOCK.UPDATE });
      if (poItem) {
        const newReceived = roundQty(parseFloat(poItem.quantity_received) + parseFloat(line.quantity_received));
        await poItem.update({ quantity_received: newReceived }, { transaction });
      }
    }

    invoiceItems.push({
      product_id: line.product_id,
      description: line.Product?.name || `Product #${line.product_id}`,
      quantity: line.quantity_received,
      unit_cost: line.unit_cost,
      line_total: line.line_total,
    });
  }

  const totalAmount = round2(receipt.total);
  const stockNotes = `GRN ${receipt.grn_number}${receipt.supplier_invoice_number ? ` — Supplier inv ${receipt.supplier_invoice_number}` : ''}`;
  const finalNotes = notes?.trim() ? `${notes.trim()} — ${stockNotes}` : stockNotes;

  let paymentResult;
  try {
    paymentResult = await applySupplierStockPayment({
      shopId,
      supplierRow,
      totalAmount,
      paymentStatus: payment_status,
      paidAmountInput: paid_amount,
      paymentMethod: payment_method,
      bankAccountId: bank_account_id,
      notes: finalNotes,
      createdBy: userId,
      branchId: receipt.branch_id,
      grnId: receipt.id,
      invoiceItems,
    }, transaction);
  } catch (err) {
    err.statusCode = err.statusCode || 500;
    throw err;
  }

  await receipt.update({ status: 'posted', posted_at: new Date() }, { transaction });

  if (receipt.purchase_order_id) {
    await refreshPurchaseOrderStatus(receipt.purchase_order_id, transaction);
  }

  return paymentResult;
}

exports.post = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const receipt = await loadLockedGrnWithItems(req.params.id, shopId, transaction);
    if (!receipt) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Goods receipt not found' });
    }

    const paymentResult = await postGoodsReceiptInTransaction(receipt, shopId, req.body, req.user.id, transaction);
    await transaction.commit();

    const posted = await db.GoodsReceiptNote.findByPk(receipt.id, { include: grnIncludes });
    return res.json({
      message: 'Goods receipt posted — stock updated and supplier payable recorded',
      goods_receipt: posted,
      purchase_invoice: paymentResult.purchaseInvoice,
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error('postGoodsReceipt error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createFromPo = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const poId = parseInt(req.params.poId, 10);
    const { branch_id, receipt_date, supplier_invoice_number, notes, items } = req.body;

    const po = await db.PurchaseOrder.findOne({
      where: { id: poId, shop_id: shopId },
      include: [{ model: db.PurchaseOrderItem, as: 'PurchaseOrderItems', include: [{ model: db.Product }] }],
      transaction,
    });
    if (!po) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    if (!['sent', 'partially_received'].includes(po.status)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Purchase order is not open for receiving' });
    }

    const branchId = branch_id || po.branch_id;
    if (!branchId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'branch_id is required' });
    }

    let normalizedItems;
    if (items?.length) {
      normalizedItems = normalizeGrnItems(items, branchId);
    } else {
      normalizedItems = (po.PurchaseOrderItems || [])
        .map(item => {
          const pending = roundQty(parseFloat(item.quantity_ordered) - parseFloat(item.quantity_received));
          if (pending <= 0) return null;
          return {
            product_id: item.product_id,
            purchase_order_item_id: item.id,
            branch_id: branchId,
            quantity_received: pending,
            unit_cost: parseFloat(item.unit_cost),
            line_total: calcLineTotal(pending, item.unit_cost),
          };
        })
        .filter(Boolean);
    }

    if (!normalizedItems.length) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Nothing left to receive on this purchase order' });
    }

    await validatePoReceiptLines(shopId, poId, normalizedItems, transaction);

    const subtotal = round2(normalizedItems.reduce((s, i) => s + i.line_total, 0));
    const grnNumber = await generateGrnNumber(shopId, transaction);

    const receipt = await db.GoodsReceiptNote.create({
      shop_id: shopId,
      supplier_id: po.supplier_id,
      purchase_order_id: po.id,
      branch_id: branchId,
      grn_number: grnNumber,
      receipt_date: receipt_date ? new Date(receipt_date) : new Date(),
      supplier_invoice_number: supplier_invoice_number?.trim() || null,
      subtotal,
      total: subtotal,
      status: 'draft',
      notes: notes?.trim() || null,
      received_by: req.user.id,
    }, { transaction });

    await db.GoodsReceiptNoteItem.bulkCreate(
      normalizedItems.map(row => ({ ...row, goods_receipt_note_id: receipt.id })),
      { transaction },
    );

    await transaction.commit();
    const created = await db.GoodsReceiptNote.findByPk(receipt.id, { include: grnIncludes });
    return res.status(201).json({ message: 'Goods receipt draft created from PO', goods_receipt: created });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error('createGrnFromPo error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/** Receive stock against a PO in one step (creates & posts GRN internally). */
exports.receiveFromPo = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const poId = parseInt(req.params.id, 10);
    const {
      branch_id, receipt_date, supplier_invoice_number, notes, items,
      payment_status, paid_amount, payment_method, bank_account_id,
    } = req.body;

    const po = await db.PurchaseOrder.findOne({
      where: { id: poId, shop_id: shopId },
      include: [{ model: db.PurchaseOrderItem, as: 'PurchaseOrderItems', include: [{ model: db.Product }] }],
      transaction,
    });
    if (!po) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    if (!['sent', 'partially_received'].includes(po.status)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Purchase order is not open for receiving' });
    }

    const branchId = branch_id || po.branch_id;
    if (!branchId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'branch_id is required' });
    }

    let normalizedItems;
    if (items?.length) {
      normalizedItems = normalizeGrnItems(items, branchId).filter(i => i.quantity_received > 0);
    } else {
      normalizedItems = (po.PurchaseOrderItems || [])
        .map(item => {
          const pending = roundQty(parseFloat(item.quantity_ordered) - parseFloat(item.quantity_received));
          if (pending <= 0) return null;
          return {
            product_id: item.product_id,
            purchase_order_item_id: item.id,
            branch_id: branchId,
            quantity_received: pending,
            unit_cost: parseFloat(item.unit_cost),
            line_total: calcLineTotal(pending, item.unit_cost),
          };
        })
        .filter(Boolean);
    }

    if (!normalizedItems.length) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Nothing left to receive on this purchase order' });
    }

    await validatePoReceiptLines(shopId, poId, normalizedItems, transaction);

    const subtotal = round2(normalizedItems.reduce((s, i) => s + i.line_total, 0));
    const grnNumber = await generateGrnNumber(shopId, transaction);

    const receipt = await db.GoodsReceiptNote.create({
      shop_id: shopId,
      supplier_id: po.supplier_id,
      purchase_order_id: po.id,
      branch_id: branchId,
      grn_number: grnNumber,
      receipt_date: receipt_date ? new Date(receipt_date) : new Date(),
      supplier_invoice_number: supplier_invoice_number?.trim() || null,
      subtotal,
      total: subtotal,
      status: 'draft',
      notes: notes?.trim() || null,
      received_by: req.user.id,
    }, { transaction });

    await db.GoodsReceiptNoteItem.bulkCreate(
      normalizedItems.map(row => ({ ...row, goods_receipt_note_id: receipt.id })),
      { transaction },
    );

    const receiptWithLines = await loadLockedGrnWithItems(receipt.id, shopId, transaction);
    if (!receiptWithLines) {
      await transaction.rollback();
      return res.status(500).json({ message: 'Failed to load goods receipt for posting' });
    }

    const paymentResult = await postGoodsReceiptInTransaction(
      receiptWithLines,
      shopId,
      { payment_status, paid_amount, payment_method, bank_account_id, notes },
      req.user.id,
      transaction,
    );

    await transaction.commit();

    const posted = await db.GoodsReceiptNote.findByPk(receipt.id, { include: grnIncludes });
    return res.json({
      message: 'Stock received — inventory updated and supplier payable recorded',
      goods_receipt: posted,
      purchase_invoice: paymentResult.purchaseInvoice,
      purchase_order_id: po.id,
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error('receiveFromPo error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.postGoodsReceiptInTransaction = postGoodsReceiptInTransaction;
exports.loadLockedGrnWithItems = loadLockedGrnWithItems;
exports.normalizeGrnItems = normalizeGrnItems;
exports.validatePoReceiptLines = validatePoReceiptLines;
