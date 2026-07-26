'use strict';

const db = require('../models');
const { postVoucher } = require('./postVoucher');

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];
const FUND_PARENT_CODES = new Set(['05-BANK', '05-CASH']);

// Derives the next free code under a parent, e.g. parent '03-CUR-LIAB' with two
// existing children -> '03-CUR-LIAB-03'. Falls back to a generic prefix for
// top-level accounts created with no parent.
async function generateAccountCode(parent, transaction) {
  const prefix = parent ? parent.account_code : 'ACC';
  let seq = await db.ChartOfAccount.count({
    where: { parent_account_id: parent ? parent.id : null },
    transaction,
  }) + 1;

  let code;
  do {
    code = `${prefix}-${String(seq).padStart(2, '0')}`;
    seq += 1;
    // eslint-disable-next-line no-await-in-loop
  } while (await db.ChartOfAccount.findOne({ where: { account_code: code }, transaction }));
  return code;
}

async function createAccount({ shopId, accountName, accountType, parent, accountCode, createdBy }, transaction) {
  const code = accountCode || await generateAccountCode(parent, transaction);
  return db.ChartOfAccount.create({
    shop_id: shopId,
    account_code: code,
    account_name: accountName,
    account_type: accountType,
    parent_account_id: parent ? parent.id : null,
    is_active: true,
    created_by: createdBy || null,
  }, { transaction });
}

async function hasPostings(accountId, transaction) {
  const count = await db.GeneralLedger.count({ where: { account_id: accountId }, transaction });
  return count > 0;
}

// Walks up from newParentId looking for accountId, to reject a re-parent that
// would make an account its own ancestor.
async function wouldCreateCycle(accountId, newParentId, transaction) {
  let cursor = newParentId;
  const seen = new Set();
  while (cursor) {
    if (cursor === accountId) return true;
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const node = await db.ChartOfAccount.findByPk(cursor, { transaction });
    cursor = node ? node.parent_account_id : null;
  }
  return false;
}

// Finds (or creates, once per shop) the "Directors & Investors" liability
// account every board member's/investor's own sub-account nests under.
async function getOrCreateDirectorsParent(shopId, createdBy, transaction) {
  const existing = await db.ChartOfAccount.findOne({
    where: { shop_id: shopId, account_code: '03-BOD' },
    transaction,
  });
  if (existing) return existing;

  const currentLiabilities = await db.ChartOfAccount.findOne({
    where: { account_code: '03-CUR-LIAB' },
    transaction,
  });

  return createAccount({
    shopId,
    accountName: 'Directors & Investors',
    accountType: 'liability',
    parent: currentLiabilities || null,
    accountCode: '03-BOD',
    createdBy,
  }, transaction);
}

function isFundParent(parent) {
  return !!(parent && FUND_PARENT_CODES.has(parent.account_code));
}

function fundKindFromParent(parent) {
  return parent.account_code === '05-CASH' ? 'cash' : 'bank';
}

// Creates a COA sub-account under 05-BANK or 05-CASH plus the linked
// bank_accounts row that makes it selectable as a payment method everywhere.
async function createFundAccount({
  shopId, accountName, parent, bank_name, account_number, opening_balance, accountCode, createdBy,
}, transaction) {
  const kind = fundKindFromParent(parent);
  const openingBal = Math.round((parseFloat(opening_balance) || 0) * 100) / 100;

  const ledgerAccount = await createAccount({
    shopId,
    accountName: accountName.trim(),
    accountType: 'asset',
    parent,
    accountCode,
    createdBy,
  }, transaction);

  const bankAccount = await db.BankAccount.create({
    shop_id: shopId,
    account_name: accountName.trim(),
    bank_name: kind === 'bank' ? (bank_name?.trim() || null) : null,
    account_number: kind === 'bank' ? (account_number?.trim() || null) : null,
    opening_balance: openingBal,
    current_balance: openingBal,
    is_active: true,
    chart_of_account_id: ledgerAccount.id,
    kind,
  }, { transaction });

  if (openingBal !== 0) {
    await postVoucher(shopId, {
      type: 'journal',
      date: new Date(),
      narration: `Opening balance — ${bankAccount.account_name}`,
      createdBy,
      lines: [
        { accountCode: ledgerAccount.account_code, debit: openingBal },
        { accountCode: '01-CAPITAL', credit: openingBal },
      ],
    }, transaction);
  }

  return { ledgerAccount, bankAccount };
}

module.exports = {
  ACCOUNT_TYPES,
  FUND_PARENT_CODES,
  generateAccountCode,
  createAccount,
  createFundAccount,
  isFundParent,
  fundKindFromParent,
  hasPostings,
  wouldCreateCycle,
  getOrCreateDirectorsParent,
};
