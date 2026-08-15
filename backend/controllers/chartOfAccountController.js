const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const {
  ACCOUNT_TYPES, createAccount, createFundAccount, isFundParent, hasPostings, wouldCreateCycle,
} = require('../utils/chartOfAccounts');
const { invalidateAccountCache } = require('../utils/postVoucher');

// ── POST /accounting/chart-of-accounts ───────────────────────────────────────
// Manual account/sub-account creation. account_type must match the parent's
// (when a parent is given) so every downstream report — trial balance, P&L,
// balance sheet — keeps rolling up correctly by account_type.
//
// Accounts nested under '05-BANK' or '05-CASH' are payment fund accounts —
// the backend also creates the linked bank_accounts row so they show up
// wherever a payment method is chosen (sales, expenses, payments, etc.).
exports.create = async (req, res) => {
  const shopId = requireShopId(req, res);
  if (!shopId) return;

  const {
    account_name, account_type, parent_account_id, account_code,
    bank_name, account_number, opening_balance, funding_source, source_account_id,
    is_contra,
  } = req.body;
  if (!account_name?.trim()) return res.status(400).json({ message: 'account_name is required' });
  if (!ACCOUNT_TYPES.includes(account_type)) {
    return res.status(400).json({ message: `account_type must be one of: ${ACCOUNT_TYPES.join(', ')}` });
  }

  const transaction = await db.sequelize.transaction();
  try {
    let parent = null;
    if (parent_account_id) {
      parent = await db.ChartOfAccount.findOne({
        where: { id: parent_account_id, [Op.or]: [{ shop_id: null }, { shop_id: shopId }] },
        transaction,
      });
      if (!parent) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Parent account not found' });
      }
      if (parent.account_type !== account_type) {
        await transaction.rollback();
        return res.status(400).json({ message: `Sub-account type must match the parent's type (${parent.account_type})` });
      }
      if (isFundParent(parent) && account_type !== 'asset') {
        await transaction.rollback();
        return res.status(400).json({ message: 'Bank and cash fund accounts must be asset accounts' });
      }
    }

    let code = account_code?.trim() || null;
    if (code) {
      const existing = await db.ChartOfAccount.findOne({ where: { account_code: code }, transaction });
      if (existing) {
        await transaction.rollback();
        return res.status(409).json({ message: 'account_code already exists' });
      }
    }

    let account;
    let fundAccount = null;
    if (parent && isFundParent(parent)) {
      const result = await createFundAccount({
        shopId,
        accountName: account_name.trim(),
        parent,
        bank_name,
        account_number,
        opening_balance,
        funding_source,
        source_account_id,
        accountCode: code,
        createdBy: req.user.id,
      }, transaction);
      account = result.ledgerAccount;
      fundAccount = result.bankAccount;
    } else {
      account = await createAccount({
        shopId,
        accountName: account_name.trim(),
        accountType: account_type,
        parent,
        accountCode: code,
        createdBy: req.user.id,
        isContra: is_contra,
      }, transaction);
    }

    await transaction.commit();
    const payload = { account };
    if (fundAccount) payload.fund_account = fundAccount;
    return res.status(201).json(payload);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('createChartOfAccount error:', error);
    // Funding-source problems (no source picked, source too small) are the
    // user's to fix, not server faults — surface their own message.
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PUT /accounting/chart-of-accounts/:id ────────────────────────────────────
// Only shop-owned accounts are editable (system accounts have shop_id NULL and
// simply won't match this lookup). Type and parent are frozen once an account
// has real ledger postings, to protect report integrity and the audit trail.
exports.update = async (req, res) => {
  const shopId = requireShopId(req, res);
  if (!shopId) return;

  const transaction = await db.sequelize.transaction();
  try {
    const account = await db.ChartOfAccount.findOne({
      where: { id: req.params.id, shop_id: shopId },
      transaction,
    });
    if (!account) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Account not found or not editable' });
    }

    const {
      account_name, account_type, parent_account_id, is_active, bank_name, account_number,
      is_contra,
    } = req.body;
    const posted = await hasPostings(account.id, transaction);
    const linkedFund = await db.BankAccount.findOne({
      where: { shop_id: shopId, chart_of_account_id: account.id },
      transaction,
    });

    if (account_name !== undefined) {
      if (!account_name.trim()) {
        await transaction.rollback();
        return res.status(400).json({ message: 'account_name cannot be empty' });
      }
      account.account_name = account_name.trim();
      if (linkedFund) linkedFund.account_name = account.account_name;
    }

    if (account_type !== undefined && account_type !== account.account_type) {
      if (posted || linkedFund) {
        await transaction.rollback();
        return res.status(409).json({ message: 'Cannot change the type of an account that already has ledger postings' });
      }
      if (!ACCOUNT_TYPES.includes(account_type)) {
        await transaction.rollback();
        return res.status(400).json({ message: `account_type must be one of: ${ACCOUNT_TYPES.join(', ')}` });
      }
      account.account_type = account_type;
    }

    if (parent_account_id !== undefined && parent_account_id !== account.parent_account_id) {
      if (posted || linkedFund) {
        await transaction.rollback();
        return res.status(409).json({ message: 'Cannot re-parent an account that already has ledger postings' });
      }
      if (parent_account_id) {
        if (await wouldCreateCycle(account.id, parent_account_id, transaction)) {
          await transaction.rollback();
          return res.status(400).json({ message: 'That parent would create a circular reference' });
        }
        const parent = await db.ChartOfAccount.findOne({
          where: { id: parent_account_id, [Op.or]: [{ shop_id: null }, { shop_id: shopId }] },
          transaction,
        });
        if (!parent) {
          await transaction.rollback();
          return res.status(404).json({ message: 'Parent account not found' });
        }
        if (parent.account_type !== account.account_type) {
          await transaction.rollback();
          return res.status(400).json({ message: `Sub-account type must match the parent's type (${parent.account_type})` });
        }
      }
      account.parent_account_id = parent_account_id || null;
    }

    if (linkedFund) {
      if (bank_name !== undefined) linkedFund.bank_name = bank_name?.trim() || null;
      if (account_number !== undefined) linkedFund.account_number = account_number?.trim() || null;
      if (is_active !== undefined) linkedFund.is_active = !!is_active;
      await linkedFund.save({ transaction });
    }

    if (is_active !== undefined) account.is_active = !!is_active;
    // Presentation-only: changing it re-labels the account on statements and
    // never alters a posted figure, so it stays editable after postings exist.
    if (is_contra !== undefined) account.is_contra = !!is_contra;

    await account.save({ transaction });
    await transaction.commit();
    return res.json({ account });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('updateChartOfAccount error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── DELETE /accounting/chart-of-accounts/:id ─────────────────────────────────
// An account with any ledger history is deactivated instead of deleted, so the
// audit trail behind past vouchers never breaks.
exports.remove = async (req, res) => {
  const shopId = requireShopId(req, res);
  if (!shopId) return;

  try {
    const account = await db.ChartOfAccount.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!account) return res.status(404).json({ message: 'Account not found or not deletable' });

    const children = await db.ChartOfAccount.count({ where: { parent_account_id: account.id } });
    if (children > 0) {
      return res.status(409).json({ message: 'Cannot delete an account that has sub-accounts — remove or re-parent them first' });
    }

    const linkedFund = await db.BankAccount.findOne({
      where: { shop_id: shopId, chart_of_account_id: account.id },
    });

    // A fund account can be closed while it still holds money. Doing so drops it
    // from the dashboard's Cash/Bank capital, which is the point — but the
    // balance stays on the ledger and the balance sheet, because the business
    // still owns it until it is transferred out or written off.
    if (await hasPostings(account.id)) {
      await account.update({ is_active: false });
      if (linkedFund) await linkedFund.update({ is_active: false });
      return res.json({ message: 'Account has ledger history — deactivated instead of deleted', account });
    }

    if (linkedFund) await linkedFund.destroy();
    const removedCode = account.account_code;
    await account.destroy();
    // postVoucher caches account_code → id for the life of the process. A code
    // freed here can legitimately be reused by a new account, so the stale entry
    // has to go or every later voucher using that code would post against the
    // deleted row's id.
    invalidateAccountCache(removedCode);
    return res.json({ message: 'Account deleted' });
  } catch (error) {
    console.error('deleteChartOfAccount error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
