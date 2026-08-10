const db = require('../models');
const { requireShopId } = require('../utils/shopScope');
const { isAdminRole } = require('../utils/deletionRequest');
const { performVoidExpense } = require('./expenseController');
const { performVoidReturn } = require('./saleReturnController');
const { performVoidAsset } = require('./assetController');
const { guardWritableDates, handleFiscalYearError } = require('../utils/fiscalYear');

function requireAdmin(req, res) {
  if (!isAdminRole(req.user.Role.name)) {
    res.status(403).json({ message: 'Only admins can review deletion requests.' });
    return false;
  }
  return true;
}

// ── GET /api/deletion-requests?status=pending ────────────────────────────────
exports.list = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.status && req.query.status !== 'all') where.status = req.query.status;
    if (req.query.module && req.query.module !== 'all') where.module = req.query.module;

    const requests = await db.DeletionRequest.findAll({
      where,
      include: [
        { model: db.User, as: 'Requester', attributes: ['id', 'name', 'email'] },
        { model: db.User, as: 'Reviewer', attributes: ['id', 'name', 'email'] },
      ],
      order: [['created_at', 'DESC']],
    });

    return res.json({ requests });
  } catch (error) {
    console.error('listDeletionRequests error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Applies the actual deletion/void for the given module + entity, mirroring
// exactly what each controller's own admin-direct-delete path does.
async function applyModuleDeletion(module, entityId, shopId, req, transaction) {
  switch (module) {
    case 'suppliers': {
      const row = await db.Supplier.findOne({ where: { id: entityId, shop_id: shopId }, transaction });
      if (row && row.status !== 'disabled') await row.update({ status: 'disabled' }, { transaction });
      return !!row;
    }
    case 'products': {
      const row = await db.Product.findOne({ where: { id: entityId, shop_id: shopId }, transaction });
      if (row && row.status !== 'disabled') await row.update({ status: 'disabled' }, { transaction });
      return !!row;
    }
    case 'customers': {
      const row = await db.Customer.findOne({ where: { id: entityId, shop_id: shopId }, transaction });
      if (row && row.status !== 'disabled') await row.update({ status: 'disabled' }, { transaction });
      return !!row;
    }
    case 'employees': {
      const row = await db.Employee.findOne({ where: { id: entityId, shop_id: shopId }, transaction });
      if (row && row.status !== 'terminated') {
        await row.update({ status: 'terminated', terminated_at: new Date() }, { transaction });
      }
      return !!row;
    }
    case 'board_directors': {
      const row = await db.BoardMember.findOne({ where: { id: entityId, shop_id: shopId }, transaction });
      if (row) await row.destroy({ transaction });
      return !!row;
    }
    case 'gatepasses': {
      const row = await db.GatePass.findOne({ where: { id: entityId, shop_id: shopId }, transaction });
      if (row) {
        await db.GatePassItem.destroy({ where: { gate_pass_id: row.id }, transaction });
        await row.destroy({ transaction });
      }
      return !!row;
    }
    case 'expenses': {
      const row = await db.Expense.findOne({ where: { id: entityId, shop_id: shopId }, transaction });
      if (row && row.status !== 'void') {
        await guardWritableDates(shopId, row.expense_date, transaction);
        await performVoidExpense(row, shopId, req.user.id, transaction);
      }
      return !!row;
    }
    case 'assets': {
      const row = await db.Asset.findOne({ where: { id: entityId, shop_id: shopId }, transaction });
      if (row && row.status === 'active') {
        if (row.is_paid) await guardWritableDates(shopId, row.purchase_date, transaction);
        await performVoidAsset(row, shopId, req.user.id, transaction);
      }
      return !!row;
    }
    case 'returns': {
      const row = await db.SaleReturn.findOne({
        where: { id: entityId, shop_id: shopId },
        include: [
          {
            model: db.SaleReturnItem, as: 'ReturnItems',
            include: [{ model: db.SaleItem, attributes: ['id', 'unit_cost'] }],
          },
          { model: db.Sale },
        ],
        transaction,
      });
      if (row && row.status !== 'void') {
        await guardWritableDates(shopId, row.return_date, transaction);
        await performVoidReturn(row, shopId, req, transaction);
      }
      return !!row;
    }
    default:
      return false;
  }
}

// ── POST /api/deletion-requests/:id/approve ─────────────────────────────────
exports.approve = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    if (!requireAdmin(req, res)) { await transaction.rollback(); return; }
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const request = await db.DeletionRequest.findOne({ where: { id: req.params.id, shop_id: shopId }, transaction });
    if (!request) { await transaction.rollback(); return res.status(404).json({ message: 'Deletion request not found' }); }
    if (request.status !== 'pending') { await transaction.rollback(); return res.status(400).json({ message: 'This request has already been reviewed' }); }

    const entityFound = await applyModuleDeletion(request.module, request.entity_id, shopId, req, transaction);

    request.status = 'approved';
    request.reviewed_by = req.user.id;
    request.reviewed_at = new Date();
    request.review_note = entityFound ? (req.body.note || null) : 'Record no longer exists — nothing to delete.';
    await request.save({ transaction });

    await transaction.commit();
    return res.json({ message: 'Deletion request approved', request });
  } catch (error) {
    await transaction.rollback();
    const handled = handleFiscalYearError(res, error);
    if (handled) return handled;
    console.error('approveDeletionRequest error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── POST /api/deletion-requests/:id/reject ──────────────────────────────────
exports.reject = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const request = await db.DeletionRequest.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!request) return res.status(404).json({ message: 'Deletion request not found' });
    if (request.status !== 'pending') return res.status(400).json({ message: 'This request has already been reviewed' });

    request.status = 'rejected';
    request.reviewed_by = req.user.id;
    request.reviewed_at = new Date();
    request.review_note = req.body.note || null;
    await request.save();

    return res.json({ message: 'Deletion request rejected', request });
  } catch (error) {
    console.error('rejectDeletionRequest error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
