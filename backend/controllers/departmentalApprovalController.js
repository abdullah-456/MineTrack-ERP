const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { generateDaNumber } = require('../utils/stockReceipt');
const { resolveListDateRange, applyDateRangeToWhere } = require('../utils/fiscalYear');
const {
  deleteFileQuiet, relativeFilePath, absoluteFilePath,
} = require('../utils/approvalUploads');

const prSummaryInclude = {
  model: db.PurchaseRequisition,
  include: [
    { model: db.Branch, attributes: ['id', 'name', 'mine_code'] },
    { model: db.Employee, as: 'Requester', attributes: ['id', 'name', 'employment_id'] },
    {
      model: db.PurchaseRequisitionItem,
      as: 'PurchaseRequisitionItems',
      include: [{ model: db.Product, attributes: ['id', 'name', 'sku', 'unit'] }],
    },
  ],
};

const daIncludes = [
  { model: db.Shop, attributes: ['id', 'name', 'owner_name', 'email', 'phone', 'address', 'logo_url'] },
  { model: db.User, as: 'Creator', attributes: ['id', 'name'] },
  prSummaryInclude,
];

exports.listEligibleRequisitions = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const existingIds = (await db.DepartmentalApproval.findAll({
      where: { shop_id: shopId },
      attributes: ['purchase_requisition_id'],
    })).map(a => a.purchase_requisition_id);

    const where = {
      shop_id: shopId,
      status: 'submitted',
    };
    if (existingIds.length) {
      where.id = { [Op.notIn]: existingIds };
    }

    const requisitions = await db.PurchaseRequisition.findAll({
      where,
      attributes: ['id', 'pr_number', 'requisition_date', 'required_date', 'department', 'priority', 'total', 'status'],
      include: [
        { model: db.Branch, attributes: ['id', 'name'] },
        { model: db.Employee, as: 'Requester', attributes: ['id', 'name'] },
      ],
      order: [['requisition_date', 'DESC'], ['id', 'DESC']],
      limit: 200,
    });

    return res.json({ purchase_requisitions: requisitions });
  } catch (error) {
    console.error('listEligibleRequisitions error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.decision && req.query.decision !== 'all') where.decision = req.query.decision;

    const range = await resolveListDateRange(req, shopId);
    applyDateRangeToWhere(where, 'approval_date', range);

    if (req.query.search) {
      where[Op.or] = [
        { da_number: { [Op.iLike]: `%${req.query.search}%` } },
        { remarks: { [Op.iLike]: `%${req.query.search}%` } },
        { '$PurchaseRequisition.pr_number$': { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    const approvals = await db.DepartmentalApproval.findAll({
      where,
      include: daIncludes,
      order: [['approval_date', 'DESC'], ['id', 'DESC']],
      limit: 200,
      subQuery: false,
    });

    return res.json({ departmental_approvals: approvals });
  } catch (error) {
    console.error('listDepartmentalApprovals error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const approval = await db.DepartmentalApproval.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: daIncludes,
    });
    if (!approval) return res.status(404).json({ message: 'Departmental approval not found' });
    return res.json({ departmental_approval: approval });
  } catch (error) {
    console.error('getDepartmentalApproval error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const { purchase_requisition_id, approval_date, decision, remarks } = req.body;

    if (!purchase_requisition_id) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Purchase requisition is required' });
    }
    if (!['approved', 'rejected'].includes(decision)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Decision must be approved or rejected' });
    }

    const prId = parseInt(purchase_requisition_id, 10);
    const requisition = await db.PurchaseRequisition.findOne({
      where: { id: prId, shop_id: shopId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!requisition) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Invalid purchase requisition for this shop' });
    }
    if (requisition.status !== 'submitted') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Only submitted purchase requisitions can be approved' });
    }

    const existing = await db.DepartmentalApproval.findOne({
      where: { purchase_requisition_id: prId, shop_id: shopId },
      transaction,
    });
    if (existing) {
      await transaction.rollback();
      return res.status(400).json({ message: 'This purchase requisition already has a departmental approval' });
    }

    const daNumber = await generateDaNumber(shopId, transaction);

    let attachmentFields = {};
    if (req.file) {
      attachmentFields = {
        attachment_path: relativeFilePath(shopId, req.file.filename),
        attachment_name: req.file.originalname,
        attachment_mime: req.file.mimetype,
        attachment_size: req.file.size,
        attachment_description: req.body.attachment_description?.trim() || null,
      };
    }

    const approval = await db.DepartmentalApproval.create({
      shop_id: shopId,
      purchase_requisition_id: prId,
      da_number: daNumber,
      approval_date: approval_date || new Date().toISOString().slice(0, 10),
      decision,
      remarks: remarks?.trim() || null,
      ...attachmentFields,
      created_by: req.user.id,
    }, { transaction });

    await requisition.update({ status: decision === 'approved' ? 'approved' : 'closed' }, { transaction });

    await transaction.commit();

    const created = await db.DepartmentalApproval.findByPk(approval.id, { include: daIncludes });
    return res.status(201).json({ message: 'Departmental approval created', departmental_approval: created });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (req.file) deleteFileQuiet(req.file.path);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error('createDepartmentalApproval error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const approval = await db.DepartmentalApproval.findOne({
      where: { id: req.params.id, shop_id: shopId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!approval) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Departmental approval not found' });
    }

    const requisition = await db.PurchaseRequisition.findByPk(approval.purchase_requisition_id, { transaction });
    if (requisition && ['approved', 'closed'].includes(requisition.status)) {
      await requisition.update({ status: 'submitted' }, { transaction });
    }

    const attachmentPath = approval.attachment_path;
    await approval.destroy({ transaction });
    await transaction.commit();

    if (attachmentPath) deleteFileQuiet(absoluteFilePath(attachmentPath));

    return res.json({ message: 'Departmental approval deleted' });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('removeDepartmentalApproval error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getAttachment = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const approval = await db.DepartmentalApproval.findOne({
      where: { id: req.params.id, shop_id: shopId },
    });
    if (!approval?.attachment_path) return res.status(404).json({ message: 'Attachment not found' });

    return res.sendFile(absoluteFilePath(approval.attachment_path), {
      headers: { 'Content-Type': approval.attachment_mime || 'application/octet-stream' },
    }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ message: 'Attachment file not found' });
    });
  } catch (error) {
    console.error('getDepartmentalApprovalAttachment error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
