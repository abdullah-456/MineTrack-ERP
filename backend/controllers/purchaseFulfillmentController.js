const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const {
  calcLineTotal, calcOrderTotals, generatePoNumber, generateGrnNumber, roundQty, round2,
} = require('../utils/stockReceipt');
const { resolveListDateRange, applyDateRangeToWhere } = require('../utils/fiscalYear');
const {
  postGoodsReceiptInTransaction,
  loadLockedGrnWithItems,
  validatePoReceiptLines,
} = require('./goodsReceiptController');
const { relativeFilePath, deleteFileQuiet, absoluteFilePath } = require('../utils/fulfillmentUploads');

const workflowPoIncludes = [
  { model: db.Shop, attributes: ['id', 'name', 'owner_name', 'email', 'phone', 'address', 'logo_url'] },
  { model: db.Supplier, attributes: ['id', 'company_name', 'supplier_code', 'phone', 'address'] },
  { model: db.Branch, attributes: ['id', 'name', 'mine_code'] },
  { model: db.User, as: 'Creator', attributes: ['id', 'name'] },
  {
    model: db.PurchaseRequisition,
    attributes: ['id', 'pr_number', 'requisition_date', 'required_date', 'department', 'purpose', 'total', 'status'],
    include: [
      { model: db.Employee, as: 'Requester', attributes: ['id', 'name'] },
      { model: db.DepartmentalApproval, attributes: ['id', 'da_number', 'decision', 'approval_date'] },
    ],
  },
  {
    model: db.PurchaseOrderItem,
    as: 'PurchaseOrderItems',
    include: [{ model: db.Product, attributes: ['id', 'name', 'sku', 'unit'] }],
  },
  {
    model: db.GoodsReceiptNote,
    attributes: [
      'id', 'grn_number', 'receipt_date', 'status', 'total', 'supplier_invoice_number',
      'grn_document_path', 'grn_document_name', 'grn_document_description',
      'invoice_document_path', 'invoice_document_name', 'invoice_document_description',
    ],
    include: [{ model: db.PurchaseInvoice, attributes: ['id', 'invoice_number', 'amount', 'status'] }],
  },
];

function parseItems(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function normalizePoItems(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) {
    const err = new Error('At least one line item is required');
    err.statusCode = 400;
    throw err;
  }
  return rawItems.map((row, idx) => {
    const qty = roundQty(row.quantity_ordered ?? row.quantity);
    const unitCost = round2(row.unit_cost ?? row.estimated_unit_cost ?? 0);
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

exports.listEligibleRequisitions = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const linkedIds = (await db.PurchaseOrder.findAll({
      where: { shop_id: shopId, purchase_requisition_id: { [Op.ne]: null } },
      attributes: ['purchase_requisition_id'],
    })).map(o => o.purchase_requisition_id);

    const where = { shop_id: shopId, status: 'approved' };
    if (linkedIds.length) where.id = { [Op.notIn]: linkedIds };

    const requisitions = await db.PurchaseRequisition.findAll({
      where,
      attributes: ['id', 'pr_number', 'requisition_date', 'required_date', 'department', 'priority', 'purpose', 'notes', 'total', 'branch_id'],
      include: [
        { model: db.Branch, attributes: ['id', 'name'] },
        { model: db.Employee, as: 'Requester', attributes: ['id', 'name'] },
        {
          model: db.PurchaseRequisitionItem,
          as: 'PurchaseRequisitionItems',
          include: [{ model: db.Product, attributes: ['id', 'name', 'sku', 'unit', 'cost_price'] }],
        },
        { model: db.DepartmentalApproval, attributes: ['id', 'da_number', 'decision'] },
      ],
      order: [['requisition_date', 'DESC']],
      limit: 200,
    });

    return res.json({ purchase_requisitions: requisitions });
  } catch (error) {
    console.error('listEligibleForWorkflow error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId, purchase_requisition_id: { [Op.ne]: null } };
    if (req.query.status && req.query.status !== 'all') where.status = req.query.status;

    const range = await resolveListDateRange(req, shopId);
    applyDateRangeToWhere(where, 'order_date', range);

    if (req.query.search) {
      where[Op.or] = [
        { po_number: { [Op.iLike]: `%${req.query.search}%` } },
        { '$Supplier.company_name$': { [Op.iLike]: `%${req.query.search}%` } },
        { '$PurchaseRequisition.pr_number$': { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    const orders = await db.PurchaseOrder.findAll({
      where,
      include: workflowPoIncludes,
      order: [['order_date', 'DESC'], ['id', 'DESC']],
      limit: 200,
      subQuery: false,
    });

    return res.json({ purchase_orders: orders });
  } catch (error) {
    console.error('listWorkflowOrders error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const order = await db.PurchaseOrder.findOne({
      where: { id: req.params.id, shop_id: shopId, purchase_requisition_id: { [Op.ne]: null } },
      include: workflowPoIncludes,
    });
    if (!order) return res.status(404).json({ message: 'Workflow purchase order not found' });
    return res.json({ purchase_order: order });
  } catch (error) {
    console.error('getWorkflowOrder error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.execute = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  const uploadedFiles = [];
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const {
      purchase_requisition_id, supplier_id, branch_id,
      order_date, expected_date, discount, tax, notes,
      receipt_date, supplier_invoice_number, grn_notes,
      payment_status, paid_amount, payment_method, bank_account_id,
      grn_document_description, invoice_document_description,
    } = req.body;

    const items = parseItems(req.body.items);
    if (!purchase_requisition_id) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Purchase requisition is required' });
    }
    if (!supplier_id) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Supplier is required' });
    }

    const prId = parseInt(purchase_requisition_id, 10);
    const requisition = await db.PurchaseRequisition.findOne({
      where: { id: prId, shop_id: shopId, status: 'approved' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!requisition) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Approved purchase requisition not found' });
    }

    const existingPo = await db.PurchaseOrder.findOne({
      where: { shop_id: shopId, purchase_requisition_id: prId },
      transaction,
    });
    if (existingPo) {
      await transaction.rollback();
      return res.status(400).json({ message: 'A purchase order already exists for this requisition' });
    }

    const supplier = await db.Supplier.findOne({
      where: { id: parseInt(supplier_id, 10), shop_id: shopId },
      transaction,
    });
    if (!supplier) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Invalid supplier for this shop' });
    }

    const branchId = branch_id ? parseInt(branch_id, 10) : requisition.branch_id;
    if (!branchId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Mine / branch is required' });
    }
    const branchOk = await db.Branch.findOne({ where: { id: branchId, shop_id: shopId }, transaction });
    if (!branchOk) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Invalid branch for this shop' });
    }

    const normalizedPoItems = normalizePoItems(items);
    const productIds = normalizedPoItems.map(i => i.product_id);
    const productCount = await db.Product.count({
      where: { id: { [Op.in]: productIds }, shop_id: shopId },
      transaction,
    });
    if (productCount !== productIds.length) {
      await transaction.rollback();
      return res.status(400).json({ message: 'One or more products are invalid for this shop' });
    }

    const totals = calcOrderTotals(normalizedPoItems, discount, tax);
    const poNumber = await generatePoNumber(shopId, transaction);

    const order = await db.PurchaseOrder.create({
      shop_id: shopId,
      supplier_id: supplier.id,
      branch_id: branchId,
      purchase_requisition_id: prId,
      po_number: poNumber,
      order_date: order_date || new Date().toISOString().slice(0, 10),
      expected_date: expected_date || requisition.required_date || null,
      ...totals,
      status: 'sent',
      notes: notes?.trim() || requisition.purpose || null,
      created_by: req.user.id,
    }, { transaction });

    const poItems = await db.PurchaseOrderItem.bulkCreate(
      normalizedPoItems.map(row => ({ ...row, purchase_order_id: order.id })),
      { transaction },
    );

    const savedPoItems = await db.PurchaseOrderItem.findAll({
      where: { purchase_order_id: order.id },
      transaction,
    });

    const grnItems = savedPoItems.map(item => ({
      product_id: item.product_id,
      purchase_order_item_id: item.id,
      branch_id: branchId,
      quantity_received: item.quantity_ordered,
      unit_cost: item.unit_cost,
      line_total: item.line_total,
    }));

    await validatePoReceiptLines(shopId, order.id, grnItems, transaction);

    const grnSubtotal = round2(grnItems.reduce((s, i) => s + i.line_total, 0));
    const grnNumber = await generateGrnNumber(shopId, transaction);

    const docFields = {};
    if (req.files?.grn_document?.[0]) {
      const f = req.files.grn_document[0];
      uploadedFiles.push(f.path);
      docFields.grn_document_path = relativeFilePath(shopId, f.filename);
      docFields.grn_document_name = f.originalname;
      docFields.grn_document_mime = f.mimetype;
      docFields.grn_document_description = grn_document_description?.trim() || null;
    }
    if (req.files?.invoice_document?.[0]) {
      const f = req.files.invoice_document[0];
      uploadedFiles.push(f.path);
      docFields.invoice_document_path = relativeFilePath(shopId, f.filename);
      docFields.invoice_document_name = f.originalname;
      docFields.invoice_document_mime = f.mimetype;
      docFields.invoice_document_description = invoice_document_description?.trim() || null;
    }

    const receipt = await db.GoodsReceiptNote.create({
      shop_id: shopId,
      supplier_id: supplier.id,
      purchase_order_id: order.id,
      branch_id: branchId,
      grn_number: grnNumber,
      receipt_date: receipt_date ? new Date(receipt_date) : new Date(),
      supplier_invoice_number: supplier_invoice_number?.trim() || null,
      subtotal: grnSubtotal,
      total: grnSubtotal,
      status: 'draft',
      notes: grn_notes?.trim() || null,
      received_by: req.user.id,
      ...docFields,
    }, { transaction });

    await db.GoodsReceiptNoteItem.bulkCreate(
      grnItems.map(row => ({ ...row, goods_receipt_note_id: receipt.id })),
      { transaction },
    );

    const receiptWithLines = await loadLockedGrnWithItems(receipt.id, shopId, transaction);
    const paymentResult = await postGoodsReceiptInTransaction(
      receiptWithLines,
      shopId,
      { payment_status, paid_amount, payment_method, bank_account_id, notes: grn_notes },
      req.user.id,
      transaction,
    );

    await requisition.update({ status: 'closed' }, { transaction });

    await transaction.commit();

    const created = await db.PurchaseOrder.findByPk(order.id, { include: workflowPoIncludes });
    return res.status(201).json({
      message: 'Purchase order created, stock received, and payment recorded',
      purchase_order: created,
      goods_receipt: await db.GoodsReceiptNote.findByPk(receipt.id, { include: [{ model: db.PurchaseInvoice }] }),
      purchase_invoice: paymentResult.purchaseInvoice,
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    uploadedFiles.forEach(deleteFileQuiet);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error('executeWorkflowOrder error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getDocument = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { docType } = req.params;
    if (!['grn', 'invoice'].includes(docType)) {
      return res.status(400).json({ message: 'Invalid document type' });
    }

    const grn = await db.GoodsReceiptNote.findOne({
      where: { purchase_order_id: req.params.id, shop_id: shopId },
      order: [['id', 'DESC']],
    });
    if (!grn) return res.status(404).json({ message: 'Goods receipt not found' });

    const pathKey = docType === 'grn' ? 'grn_document_path' : 'invoice_document_path';
    const mimeKey = docType === 'grn' ? 'grn_document_mime' : 'invoice_document_mime';
    if (!grn[pathKey]) return res.status(404).json({ message: 'Document not found' });

    return res.sendFile(absoluteFilePath(grn[pathKey]), {
      headers: { 'Content-Type': grn[mimeKey] || 'application/octet-stream' },
    }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ message: 'Document file not found' });
    });
  } catch (error) {
    console.error('getWorkflowDocument error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
