const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const {
  calcLineTotal, generatePrNumber, roundQty, round2,
} = require('../utils/stockReceipt');
const { resolveListDateRange, applyDateRangeToWhere } = require('../utils/fiscalYear');

const prIncludes = [
  { model: db.Shop, attributes: ['id', 'name', 'owner_name', 'email', 'phone', 'address', 'logo_url'] },
  { model: db.Branch, attributes: ['id', 'name', 'mine_code'] },
  { model: db.Employee, as: 'Requester', attributes: ['id', 'name', 'employment_id', 'designation', 'phone'], include: [{ model: db.Designation, as: 'Designation', attributes: ['id', 'name'] }] },
  { model: db.User, as: 'Creator', attributes: ['id', 'name'] },
  {
    model: db.PurchaseRequisitionItem,
    as: 'PurchaseRequisitionItems',
    include: [{ model: db.Product, attributes: ['id', 'name', 'sku', 'unit'] }],
  },
];

function calcRequisitionTotals(items) {
  const subtotal = round2(items.reduce((s, i) => s + calcLineTotal(i.quantity, i.estimated_unit_cost), 0));
  return { subtotal, total: subtotal };
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) {
    const err = new Error('At least one line item is required');
    err.statusCode = 400;
    throw err;
  }
  return rawItems.map((row, idx) => {
    const qty = roundQty(row.quantity);
    const unitCost = round2(row.estimated_unit_cost ?? row.unit_cost ?? 0);
    const description = (row.description || '').trim();
    if (!description && !row.product_id) {
      const err = new Error(`Line ${idx + 1}: description or product is required`);
      err.statusCode = 400;
      throw err;
    }
    if (!(qty > 0)) {
      const err = new Error(`Line ${idx + 1}: quantity must be greater than 0`);
      err.statusCode = 400;
      throw err;
    }
    return {
      product_id: row.product_id ? parseInt(row.product_id, 10) : null,
      description,
      quantity: qty,
      unit: row.unit?.trim() || null,
      estimated_unit_cost: unitCost,
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

    const range = await resolveListDateRange(req, shopId);
    applyDateRangeToWhere(where, 'requisition_date', range);

    if (req.query.search) {
      where[Op.or] = [
        { pr_number: { [Op.iLike]: `%${req.query.search}%` } },
        { department: { [Op.iLike]: `%${req.query.search}%` } },
        { '$Requester.name$': { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    const requisitions = await db.PurchaseRequisition.findAll({
      where,
      include: prIncludes,
      order: [['requisition_date', 'DESC'], ['id', 'DESC']],
      limit: 200,
      subQuery: false,
    });

    return res.json({ purchase_requisitions: requisitions });
  } catch (error) {
    console.error('listPurchaseRequisitions error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const requisition = await db.PurchaseRequisition.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: prIncludes,
    });
    if (!requisition) return res.status(404).json({ message: 'Purchase requisition not found' });
    return res.json({ purchase_requisition: requisition });
  } catch (error) {
    console.error('getPurchaseRequisition error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const {
      branch_id, requested_by, requisition_date, required_date,
      department, priority, purpose, notes, items, status,
    } = req.body;

    if (branch_id) {
      const branchOk = await db.Branch.findOne({ where: { id: branch_id, shop_id: shopId }, transaction });
      if (!branchOk) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Invalid branch for this shop' });
      }
    }

    if (requested_by) {
      const empOk = await db.Employee.findOne({ where: { id: requested_by, shop_id: shopId }, transaction });
      if (!empOk) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Invalid employee for this shop' });
      }
    }

    const normalizedItems = normalizeItems(items);

    const productIds = normalizedItems.filter(i => i.product_id).map(i => i.product_id);
    if (productIds.length) {
      const productCount = await db.Product.count({
        where: { id: { [Op.in]: productIds }, shop_id: shopId },
        transaction,
      });
      if (productCount !== productIds.length) {
        await transaction.rollback();
        return res.status(400).json({ message: 'One or more products are invalid for this shop' });
      }

      for (const item of normalizedItems) {
        if (item.product_id && !item.description) {
          const product = await db.Product.findByPk(item.product_id, { transaction });
          item.description = product?.name || 'Item';
          if (!item.unit && product?.unit) item.unit = product.unit;
        }
      }
    }

    const totals = calcRequisitionTotals(normalizedItems);
    const prNumber = await generatePrNumber(shopId, transaction);
    const initialStatus = status === 'submitted' ? 'submitted' : 'draft';

    const requisition = await db.PurchaseRequisition.create({
      shop_id: shopId,
      branch_id: branch_id || null,
      requested_by: requested_by || null,
      pr_number: prNumber,
      requisition_date: requisition_date || new Date().toISOString().slice(0, 10),
      required_date: required_date || null,
      department: department?.trim() || null,
      priority: priority === 'urgent' ? 'urgent' : 'normal',
      purpose: purpose?.trim() || null,
      ...totals,
      status: initialStatus,
      notes: notes?.trim() || null,
      created_by: req.user.id,
    }, { transaction });

    await db.PurchaseRequisitionItem.bulkCreate(
      normalizedItems.map(row => ({ ...row, purchase_requisition_id: requisition.id })),
      { transaction },
    );

    await transaction.commit();

    const created = await db.PurchaseRequisition.findByPk(requisition.id, { include: prIncludes });
    return res.status(201).json({ message: 'Purchase requisition created', purchase_requisition: created });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error('createPurchaseRequisition error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const requisition = await db.PurchaseRequisition.findOne({
      where: { id: req.params.id, shop_id: shopId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!requisition) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Purchase requisition not found' });
    }
    if (requisition.status !== 'draft') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Only draft requisitions can be edited' });
    }

    const {
      branch_id, requested_by, requisition_date, required_date,
      department, priority, purpose, notes, items,
    } = req.body;

    if (branch_id) {
      const branchOk = await db.Branch.findOne({ where: { id: branch_id, shop_id: shopId }, transaction });
      if (!branchOk) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Invalid branch for this shop' });
      }
    }

    if (requested_by) {
      const empOk = await db.Employee.findOne({ where: { id: requested_by, shop_id: shopId }, transaction });
      if (!empOk) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Invalid employee for this shop' });
      }
    }

    let normalizedItems = null;
    if (items) {
      normalizedItems = normalizeItems(items);
      const productIds = normalizedItems.filter(i => i.product_id).map(i => i.product_id);
      if (productIds.length) {
        const productCount = await db.Product.count({
          where: { id: { [Op.in]: productIds }, shop_id: shopId },
          transaction,
        });
        if (productCount !== productIds.length) {
          await transaction.rollback();
          return res.status(400).json({ message: 'One or more products are invalid for this shop' });
        }
        for (const item of normalizedItems) {
          if (item.product_id && !item.description) {
            const product = await db.Product.findByPk(item.product_id, { transaction });
            item.description = product?.name || 'Item';
            if (!item.unit && product?.unit) item.unit = product.unit;
          }
        }
      }
      await db.PurchaseRequisitionItem.destroy({ where: { purchase_requisition_id: requisition.id }, transaction });
      await db.PurchaseRequisitionItem.bulkCreate(
        normalizedItems.map(row => ({ ...row, purchase_requisition_id: requisition.id })),
        { transaction },
      );
    }

    const totals = normalizedItems
      ? calcRequisitionTotals(normalizedItems)
      : calcRequisitionTotals(await db.PurchaseRequisitionItem.findAll({
        where: { purchase_requisition_id: requisition.id },
        transaction,
      }));

    await requisition.update({
      branch_id: branch_id !== undefined ? (branch_id || null) : requisition.branch_id,
      requested_by: requested_by !== undefined ? (requested_by || null) : requisition.requested_by,
      requisition_date: requisition_date || requisition.requisition_date,
      required_date: required_date !== undefined ? (required_date || null) : requisition.required_date,
      department: department !== undefined ? (department?.trim() || null) : requisition.department,
      priority: priority === 'urgent' ? 'urgent' : (priority === 'normal' ? 'normal' : requisition.priority),
      purpose: purpose !== undefined ? (purpose?.trim() || null) : requisition.purpose,
      notes: notes !== undefined ? (notes?.trim() || null) : requisition.notes,
      ...totals,
    }, { transaction });

    await transaction.commit();

    const updated = await db.PurchaseRequisition.findByPk(requisition.id, { include: prIncludes });
    return res.json({ message: 'Purchase requisition updated', purchase_requisition: updated });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error('updatePurchaseRequisition error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const requisition = await db.PurchaseRequisition.findOne({
      where: { id: req.params.id, shop_id: shopId },
    });
    if (!requisition) return res.status(404).json({ message: 'Purchase requisition not found' });
    if (requisition.status !== 'draft') {
      return res.status(400).json({ message: 'Only draft requisitions can be deleted' });
    }

    await requisition.destroy();
    return res.json({ message: 'Purchase requisition deleted' });
  } catch (error) {
    console.error('removePurchaseRequisition error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.submit = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const requisition = await db.PurchaseRequisition.findOne({
      where: { id: req.params.id, shop_id: shopId },
    });
    if (!requisition) return res.status(404).json({ message: 'Purchase requisition not found' });
    if (requisition.status !== 'draft') {
      return res.status(400).json({ message: 'Only draft requisitions can be submitted' });
    }

    await requisition.update({ status: 'submitted' });
    const updated = await db.PurchaseRequisition.findByPk(requisition.id, { include: prIncludes });
    return res.json({ message: 'Purchase requisition submitted', purchase_requisition: updated });
  } catch (error) {
    console.error('submitPurchaseRequisition error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
