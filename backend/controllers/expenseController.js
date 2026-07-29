const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId, resolveBranchId } = require('../utils/shopScope');
const { postVoucher } = require('../utils/postVoucher');
const { assertCashAvailable, debitBankAccount, debitCashPayment, creditBankAccount, creditCashPayment, bankAccountCode, paymentAccountCode } = require('../utils/cashHelpers');
const { requestOrAllowDelete } = require('../utils/deletionRequest');

const EXPENSE_ACCOUNT_CODE = '07-OPEX';

function narrationFor(category, description) {
  return `Expense — ${category}${description ? `: ${description}` : ''}`;
}

// Resolves which Chart-of-Accounts expense category an expense posts against.
// No id given -> the default '07-OPEX' bucket (backward compatible). An id
// must be an active, expense-type account or the request is rejected outright
// — silently falling back would hide a real client bug.
async function resolveExpenseAccount(expenseAccountId, transaction) {
  if (!expenseAccountId) {
    return db.ChartOfAccount.findOne({ where: { account_code: EXPENSE_ACCOUNT_CODE }, transaction });
  }
  const account = await db.ChartOfAccount.findOne({
    where: { id: expenseAccountId, account_type: 'expense', is_active: true },
    transaction,
  });
  if (!account) {
    const err = new Error('Invalid expense category account');
    err.statusCode = 400;
    throw err;
  }
  return account;
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
        { category: { [Op.iLike]: `%${req.query.search}%` } },
        { description: { [Op.iLike]: `%${req.query.search}%` } },
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
        { model: db.Branch, attributes: ['id', 'name', 'godown_id'], include: [{ model: db.Godown, attributes: ['id', 'name'] }] },
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
        { model: db.Branch, attributes: ['id', 'name', 'godown_id'], include: [{ model: db.Godown, attributes: ['id', 'name'] }] },
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

    const { category, description, amount, expense_date, paid_via, bank_account_id, board_member_id, expense_account_id } = req.body;
    const branchId = req.body.branch_id ? parseInt(req.body.branch_id, 10) : resolveBranchId(req);

    if (!category) { await transaction.rollback(); return res.status(400).json({ message: 'Category is required' }); }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { await transaction.rollback(); return res.status(400).json({ message: 'Amount must be greater than zero' }); }
    const isBod = paid_via === 'bod_cash' || paid_via === 'bod_bank';
    if (!['cash', 'bank', 'bod_cash', 'bod_bank'].includes(paid_via)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'paid_via must be cash, bank, or BOD Current' });
    }
    if (isBod && !board_member_id) {
      await transaction.rollback();
      return res.status(400).json({ message: 'board_member_id is required for BOD Current payment' });
    }
    if (!branchId) { await transaction.rollback(); return res.status(400).json({ message: 'Branch is required' }); }

    const branch = await db.Branch.findOne({ where: { id: branchId, shop_id: shopId }, transaction });
    if (!branch) { await transaction.rollback(); return res.status(404).json({ message: 'Branch not found' }); }

    const expenseAccount = await resolveExpenseAccount(expense_account_id, transaction);

    const date = expense_date ? new Date(expense_date) : new Date();

    let bankAcc = null;
    let voucher;
    const storedVia = isBod ? (paid_via === 'bod_bank' ? 'bank' : 'cash') : paid_via;

    if (isBod) {
      const { postPayFromBodCurrent } = require('../utils/bodAccounts');
      const result = await postPayFromBodCurrent(shopId, {
        amount: amt,
        method: paid_via,
        boardMemberId: board_member_id,
        debitAccountCode: expenseAccount.account_code,
        narration: narrationFor(category, description),
        createdBy: req.user.id,
        date,
        branchId,
      }, transaction);
      voucher = result.voucher;
    } else {
      if (paid_via === 'cash') {
        bankAcc = await debitCashPayment(shopId, amt, transaction, bank_account_id);
      } else {
        bankAcc = await debitBankAccount(shopId, amt, transaction, bank_account_id);
      }
      voucher = await postVoucher(shopId, {
        type: 'payment',
        date,
        narration: narrationFor(category, description),
        createdBy: req.user.id,
        branchId,
        lines: [
          { accountCode: expenseAccount.account_code, debit: amt },
          { accountCode: paymentAccountCode(paid_via, bankAcc), credit: amt },
        ],
      }, transaction);
    }

    const expense = await db.Expense.create({
      shop_id: shopId,
      branch_id: branchId,
      category,
      description: description || null,
      amount: amt,
      expense_date: date,
      paid_via: storedVia,
      bank_account_id: bankAcc?.id || null,
      expense_account_id: expenseAccount.id,
      created_by: req.user.id,
      status: 'posted',
      voucher_id: voucher.id,
    }, { transaction });

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

    const { category, description, amount, expense_date, paid_via, bank_account_id, expense_account_id, branch_id } = req.body;

    const oldAmount = parseFloat(expense.amount);
    const oldMethod = expense.paid_via;
    const oldBankAccountId = expense.bank_account_id;
    const oldExpenseAccountId = expense.expense_account_id;
    const newAmount = amount !== undefined ? parseFloat(amount) : oldAmount;
    const newMethod = paid_via !== undefined ? paid_via : oldMethod;
    const newBankAccountId = bank_account_id !== undefined ? bank_account_id : oldBankAccountId;
    const newExpenseAccountId = expense_account_id !== undefined ? expense_account_id : oldExpenseAccountId;
    const newDate = expense_date !== undefined ? new Date(expense_date) : expense.expense_date;

    if (!newAmount || newAmount <= 0) { await transaction.rollback(); return res.status(400).json({ message: 'Amount must be greater than zero' }); }
    if (!['cash', 'bank'].includes(newMethod)) { await transaction.rollback(); return res.status(400).json({ message: 'paid_via must be cash or bank' }); }

    const financialChanged = (
      newAmount !== oldAmount ||
      newMethod !== oldMethod ||
      newBankAccountId !== oldBankAccountId ||
      newExpenseAccountId !== oldExpenseAccountId ||
      new Date(newDate).getTime() !== new Date(expense.expense_date).getTime()
    );

    let newBankAcc = null;
    let newExpenseAccount = { id: oldExpenseAccountId };
    if (financialChanged) {
      // Undo the old entry's cash/bank + expense-category effect (against
      // the SAME accounts it originally used), then apply the new ones.
      let oldBankAcc = null;
      if (oldMethod === 'cash') {
        if (oldBankAccountId) {
          oldBankAcc = await creditCashPayment(shopId, oldAmount, transaction, oldBankAccountId);
        }
      } else {
        oldBankAcc = await creditBankAccount(shopId, oldAmount, transaction, oldBankAccountId);
      }

      const oldExpenseAccount = oldExpenseAccountId
        ? await db.ChartOfAccount.findByPk(oldExpenseAccountId, { transaction })
        : await db.ChartOfAccount.findOne({ where: { account_code: EXPENSE_ACCOUNT_CODE }, transaction });
      newExpenseAccount = await resolveExpenseAccount(newExpenseAccountId, transaction);

      // The reversal is posted BEFORE the availability check. Shared cash has no
      // balance row — it is derived from the ledger — so until this voucher
      // exists the old payment is still counted as spent, and raising a cash
      // expense could be rejected for insufficient funds that the edit itself
      // was about to release.
      await postVoucher(shopId, {
        type: 'journal',
        date: new Date(),
        narration: `Reversal: Expense #${expense.id} edited`,
        createdBy: req.user.id,
        branchId: expense.branch_id,
        lines: [
          { accountCode: oldExpenseAccount.account_code, credit: oldAmount },
          { accountCode: paymentAccountCode(oldMethod, oldBankAcc), debit: oldAmount },
        ],
      }, transaction);

      if (newMethod === 'cash' && !newBankAccountId) {
        await assertCashAvailable(shopId, newAmount, transaction);
      }
      if (newMethod === 'bank') {
        newBankAcc = await debitBankAccount(shopId, newAmount, transaction, newBankAccountId);
      } else if (newMethod === 'cash' && newBankAccountId) {
        newBankAcc = await debitCashPayment(shopId, newAmount, transaction, newBankAccountId);
      }

      const voucher = await postVoucher(shopId, {
        type: 'payment',
        date: newDate,
        narration: narrationFor(category ?? expense.category, description ?? expense.description),
        createdBy: req.user.id,
        branchId: branch_id !== undefined ? parseInt(branch_id, 10) : expense.branch_id,
        lines: [
          { accountCode: newExpenseAccount.account_code, debit: newAmount },
          { accountCode: paymentAccountCode(newMethod, newBankAcc), credit: newAmount },
        ],
      }, transaction);

      expense.voucher_id = voucher.id;
    }

    if (category !== undefined) expense.category = category;
    if (description !== undefined) expense.description = description;
    if (branch_id !== undefined) expense.branch_id = parseInt(branch_id, 10);
    expense.amount = newAmount;
    expense.paid_via = newMethod;
    expense.bank_account_id = newMethod === 'bank' || newBankAcc
      ? (newBankAcc?.id || newBankAccountId || null)
      : null;
    expense.expense_account_id = newExpenseAccount.id;
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
  let bankAcc = null;
  if (expense.paid_via === 'bank') {
    bankAcc = await creditBankAccount(shopId, amt, transaction, expense.bank_account_id);
  } else if (expense.bank_account_id) {
    bankAcc = await creditCashPayment(shopId, amt, transaction, expense.bank_account_id);
  }

  const expenseAccount = expense.expense_account_id
    ? await db.ChartOfAccount.findByPk(expense.expense_account_id, { transaction })
    : await db.ChartOfAccount.findOne({ where: { account_code: EXPENSE_ACCOUNT_CODE }, transaction });

  await postVoucher(shopId, {
    type: 'journal',
    date: new Date(),
    narration: `Reversal: Expense #${expense.id} deleted`,
    createdBy: userId,
    branchId: expense.branch_id,
    lines: [
      { accountCode: expenseAccount.account_code, credit: amt },
      { accountCode: paymentAccountCode(expense.paid_via, bankAcc), debit: amt },
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
