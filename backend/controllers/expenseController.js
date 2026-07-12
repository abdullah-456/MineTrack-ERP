const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId, resolveBranchId } = require('../utils/shopScope');
const { postVoucher } = require('../utils/postVoucher');
const { assertCashAvailable, debitBankAccount, creditBankAccount, computeLiveCash } = require('../utils/cashHelpers');
const { requestOrAllowDelete } = require('../utils/deletionRequest');

const EXPENSE_ACCOUNT_CODE = '07-OPEX';

function narrationFor(category, description) {
  return `Expense — ${category}${description ? `: ${description}` : ''}`;
}

// ── GET /api/expenses ───────────────────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (!req.query.include_void) where.status = { [Op.ne]: 'void' };
    if (req.query.category && req.query.category !== 'all') where.category = req.query.category;
    if (req.query.paid_via && req.query.paid_via !== 'all') where.paid_via = req.query.paid_via;
    if (req.query.branch_id) where.branch_id = parseInt(req.query.branch_id, 10);
    if (req.query.search) {
      where[Op.or] = [
        { category: { [Op.like]: `%${req.query.search}%` } },
        { description: { [Op.like]: `%${req.query.search}%` } },
      ];
    }
    if (req.query.from || req.query.to) {
      where.expense_date = {};
      if (req.query.from) where.expense_date[Op.gte] = new Date(req.query.from);
      if (req.query.to) where.expense_date[Op.lte] = new Date(`${req.query.to}T23:59:59.999`);
    }

    const expenses = await db.Expense.findAll({
      where,
      include: [
        { model: db.Branch, attributes: ['id', 'name'] },
        { model: db.Voucher, attributes: ['id', 'voucher_number'] },
      ],
      order: [['expense_date', 'DESC'], ['id', 'DESC']],
    });

    return res.json({ expenses });
  } catch (error) {
    console.error('listExpenses error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/expenses/:id ────────────────────────────────────────────────────
exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const expense = await db.Expense.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: [
        { model: db.Branch, attributes: ['id', 'name'] },
        { model: db.Voucher, attributes: ['id', 'voucher_number'] },
      ],
    });
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    return res.json({ expense });
  } catch (error) {
    console.error('getExpense error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/expenses ───────────────────────────────────────────────────────
exports.create = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const { category, description, amount, expense_date, paid_via } = req.body;
    const branchId = req.body.branch_id ? parseInt(req.body.branch_id, 10) : resolveBranchId(req);

    if (!category) { await transaction.rollback(); return res.status(400).json({ message: 'Category is required' }); }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { await transaction.rollback(); return res.status(400).json({ message: 'Amount must be greater than zero' }); }
    if (!['cash', 'bank'].includes(paid_via)) { await transaction.rollback(); return res.status(400).json({ message: 'paid_via must be cash or bank' }); }
    if (!branchId) { await transaction.rollback(); return res.status(400).json({ message: 'Branch is required' }); }

    const branch = await db.Branch.findOne({ where: { id: branchId, shop_id: shopId }, transaction });
    if (!branch) { await transaction.rollback(); return res.status(404).json({ message: 'Branch not found' }); }

    const date = expense_date ? new Date(expense_date) : new Date();

    if (paid_via === 'cash') {
      await assertCashAvailable(shopId, amt, transaction);
    } else {
      await debitBankAccount(shopId, amt, transaction);
    }

    const expense = await db.Expense.create({
      shop_id: shopId,
      branch_id: branchId,
      category,
      description: description || null,
      amount: amt,
      expense_date: date,
      paid_via,
      created_by: req.user.id,
      status: 'posted',
    }, { transaction });

    const voucher = await postVoucher(shopId, {
      type: 'payment',
      date,
      narration: narrationFor(category, description),
      createdBy: req.user.id,
      lines: [
        { accountCode: EXPENSE_ACCOUNT_CODE, debit: amt },
        { accountCode: paid_via === 'bank' ? '05-BANK' : '05-CASH', credit: amt },
      ],
    }, transaction);

    expense.voucher_id = voucher.id;
    await expense.save({ transaction });

    await transaction.commit();
    return res.status(201).json({ expense });
  } catch (error) {
    await transaction.rollback();
    console.error('createExpense error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── PUT /api/expenses/:id ────────────────────────────────────────────────────
// Financial edits (amount/paid_via/expense_date) never mutate the original
// posted voucher — they reverse it and post a fresh one, matching the
// void/reverse convention used for sale returns elsewhere in this app.
exports.update = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const expense = await db.Expense.findOne({ where: { id: req.params.id, shop_id: shopId }, transaction });
    if (!expense) { await transaction.rollback(); return res.status(404).json({ message: 'Expense not found' }); }
    if (expense.status === 'void') { await transaction.rollback(); return res.status(400).json({ message: 'Cannot edit a voided expense' }); }

    const { category, description, amount, expense_date, paid_via, branch_id } = req.body;

    const oldAmount = parseFloat(expense.amount);
    const oldMethod = expense.paid_via;
    const newAmount = amount !== undefined ? parseFloat(amount) : oldAmount;
    const newMethod = paid_via !== undefined ? paid_via : oldMethod;
    const newDate = expense_date !== undefined ? new Date(expense_date) : expense.expense_date;

    if (!newAmount || newAmount <= 0) { await transaction.rollback(); return res.status(400).json({ message: 'Amount must be greater than zero' }); }
    if (!['cash', 'bank'].includes(newMethod)) { await transaction.rollback(); return res.status(400).json({ message: 'paid_via must be cash or bank' }); }

    const financialChanged = (
      newAmount !== oldAmount ||
      newMethod !== oldMethod ||
      new Date(newDate).getTime() !== new Date(expense.expense_date).getTime()
    );

    if (financialChanged) {
      // Undo the old entry's cash/bank effect, then apply the new one.
      // (computeLiveCash only reflects today's cash movements, so only add
      // the old amount back if the old entry was itself dated today.)
      const todayStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
      const oldWasToday = new Date(expense.expense_date) >= todayStart;

      if (oldMethod === 'cash') {
        const { liveCash } = await computeLiveCash(shopId, { transaction });
        const adjustedLiveCash = liveCash + (oldWasToday ? oldAmount : 0);
        if (newMethod === 'cash' && (adjustedLiveCash - newAmount) < 0) {
          const err = new Error(`Insufficient cash in hand. Available: ${adjustedLiveCash.toFixed(2)}`);
          err.statusCode = 400;
          throw err;
        }
      } else {
        await creditBankAccount(shopId, oldAmount, transaction);
        if (newMethod === 'cash') {
          await assertCashAvailable(shopId, newAmount, transaction);
        }
      }
      if (newMethod === 'bank') {
        await debitBankAccount(shopId, newAmount, transaction);
      }

      await postVoucher(shopId, {
        type: 'journal',
        date: new Date(),
        narration: `Reversal: Expense #${expense.id} edited`,
        createdBy: req.user.id,
        lines: [
          { accountCode: EXPENSE_ACCOUNT_CODE, credit: oldAmount },
          { accountCode: oldMethod === 'bank' ? '05-BANK' : '05-CASH', debit: oldAmount },
        ],
      }, transaction);

      const voucher = await postVoucher(shopId, {
        type: 'payment',
        date: newDate,
        narration: narrationFor(category ?? expense.category, description ?? expense.description),
        createdBy: req.user.id,
        lines: [
          { accountCode: EXPENSE_ACCOUNT_CODE, debit: newAmount },
          { accountCode: newMethod === 'bank' ? '05-BANK' : '05-CASH', credit: newAmount },
        ],
      }, transaction);

      expense.voucher_id = voucher.id;
    }

    if (category !== undefined) expense.category = category;
    if (description !== undefined) expense.description = description;
    if (branch_id !== undefined) expense.branch_id = parseInt(branch_id, 10);
    expense.amount = newAmount;
    expense.paid_via = newMethod;
    expense.expense_date = newDate;
    await expense.save({ transaction });

    await transaction.commit();
    return res.json({ expense });
  } catch (error) {
    await transaction.rollback();
    console.error('updateExpense error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// Reverses the expense's cash/bank + GL effect and marks it void. Shared by
// the direct-delete path below (admin) and deletionRequestController.approve
// (everyone else's requests, once an admin approves them).
async function performVoidExpense(expense, shopId, userId, transaction) {
  const amt = parseFloat(expense.amount);
  if (expense.paid_via === 'bank') {
    await creditBankAccount(shopId, amt, transaction);
  }

  await postVoucher(shopId, {
    type: 'journal',
    date: new Date(),
    narration: `Reversal: Expense #${expense.id} deleted`,
    createdBy: userId,
    lines: [
      { accountCode: EXPENSE_ACCOUNT_CODE, credit: amt },
      { accountCode: expense.paid_via === 'bank' ? '05-BANK' : '05-CASH', debit: amt },
    ],
  }, transaction);

  expense.status = 'void';
  await expense.save({ transaction });
  return expense;
}
exports.performVoidExpense = performVoidExpense;

// ── DELETE /api/expenses/:id — void (soft delete) ───────────────────────────
// Admin/super_admin: voids immediately. Anyone else: submits a pending
// deletion request instead (see utils/deletionRequest.js).
exports.remove = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const expense = await db.Expense.findOne({ where: { id: req.params.id, shop_id: shopId }, transaction });
    if (!expense) { await transaction.rollback(); return res.status(404).json({ message: 'Expense not found' }); }
    if (expense.status === 'void') { await transaction.rollback(); return res.status(400).json({ message: 'Expense is already void' }); }

    const { pending } = await requestOrAllowDelete({
      req, res, shopId, module: 'expenses', entityId: expense.id,
      entityLabel: `${expense.category} — Rs. ${expense.amount}`, transaction,
    });
    if (pending) { await transaction.commit(); return; }

    await performVoidExpense(expense, shopId, req.user.id, transaction);

    await transaction.commit();
    return res.json({ message: 'Expense voided', expense });
  } catch (error) {
    await transaction.rollback();
    console.error('removeExpense error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};
