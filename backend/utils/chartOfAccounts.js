'use strict';

const db = require('../models');
const { postVoucher } = require('./postVoucher');
const { fundAccountIds, computeAccountBalance } = require('./cashHelpers');

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

// Finds (or creates, once per shop) the "Directors & Investors" EQUITY account
// every board member's/investor's own sub-account nests under.
//
// This was previously typed 'liability' under Current Liabilities, which put
// director capital in the wrong half of the balance sheet, reported
// contributions and withdrawals as operating rather than financing cash flow,
// and left them out of the statement of changes in equity altogether — all four
// of those reports key off account_type, so retyping fixes them at the source.
//
// The '03-BOD' code is kept deliberately: every member sub-account already
// derives its own code from it (03-BOD-01, 03-BOD-02, ...), so renaming the
// parent would strand the children and split existing shops onto a second
// parent. The leading '03' is now just a legacy label — account_type is what
// the financial statements read.
async function getOrCreateDirectorsParent(shopId, createdBy, transaction) {
  const existing = await db.ChartOfAccount.findOne({
    where: { shop_id: shopId, account_code: '03-BOD' },
    transaction,
  });
  if (existing) return existing;

  const capital = await db.ChartOfAccount.findOne({
    where: { account_code: '01-CAPITAL' },
    transaction,
  });

  return createAccount({
    shopId,
    accountName: 'Directors & Investors',
    accountType: 'equity',
    parent: capital || null,
    accountCode: '03-BOD',
    createdBy,
  }, transaction);
}

// Asset parent: company money held by directors in their Current wallets.
async function getOrCreateDueFromBodParent(shopId, createdBy, transaction) {
  const existing = await db.ChartOfAccount.findOne({
    where: { shop_id: shopId, account_code: '05-BOD-DUE' },
    transaction,
  });
  if (existing) return existing;

  const currentAssets = await db.ChartOfAccount.findOne({
    where: { account_code: '05-CUR-ASSET' },
    transaction,
  });

  return createAccount({
    shopId,
    accountName: 'Due from Directors (Current held)',
    accountType: 'asset',
    parent: currentAssets || null,
    accountCode: '05-BOD-DUE',
    createdBy,
  }, transaction);
}

// Memo/off-capital wallets for BOD Current Cash / Bank (asset tracking of
// director-held funds — excluded from Capital cash dashboards).
async function getOrCreateBodCurrentParent(shopId, kind, createdBy, transaction) {
  const code = kind === 'bank' ? '05-BOD-CUR-BANK' : '05-BOD-CUR-CASH';
  const name = kind === 'bank' ? 'BOD Current Bank' : 'BOD Current Cash';
  const existing = await db.ChartOfAccount.findOne({
    where: { shop_id: shopId, account_code: code },
    transaction,
  });
  if (existing) return existing;

  const currentAssets = await db.ChartOfAccount.findOne({
    where: { account_code: '05-CUR-ASSET' },
    transaction,
  });

  return createAccount({
    shopId,
    accountName: name,
    accountType: 'asset',
    parent: currentAssets || null,
    accountCode: code,
    createdBy,
  }, transaction);
}

// Shared, get-once-per-shop accounts used only when a paid fixed asset is
// disposed (see assetController.dispose). Depreciation itself is never
// posted period-by-period — these three accounts absorb the whole
// un-booked depreciation plus any gain/loss in a single lump-sum entry at
// the moment the asset leaves the books.
async function getOrCreateDepreciationExpenseAccount(shopId, createdBy, transaction) {
  const existing = await db.ChartOfAccount.findOne({
    where: { shop_id: shopId, account_code: '07-DEP-EXP' },
    transaction,
  });
  if (existing) return existing;

  const expenseParent = await db.ChartOfAccount.findOne({
    where: { account_code: '07-EXPENSE' },
    transaction,
  });

  return createAccount({
    shopId,
    accountName: 'Depreciation Expense',
    accountType: 'expense',
    parent: expenseParent || null,
    accountCode: '07-DEP-EXP',
    createdBy,
  }, transaction);
}

// Shared, get-once-per-shop contra-asset account. Credited once per elapsed
// year by the depreciation catch-up job (assetDepreciationRun.js) — nets
// negative under Assets, so Total Assets on the Balance Sheet automatically
// reads as cost minus accumulated depreciation (net book value) with no
// change needed to buildBalanceSheet itself.
async function getOrCreateAccumulatedDepreciationAccount(shopId, createdBy, transaction) {
  const existing = await db.ChartOfAccount.findOne({
    where: { shop_id: shopId, account_code: '04-ACCUM-DEP' },
    transaction,
  });
  if (existing) return existing;

  const ltAssetParent = await db.ChartOfAccount.findOne({
    where: { account_code: '04-LT-ASSET' },
    transaction,
  });

  return createAccount({
    shopId,
    accountName: 'Accumulated Depreciation',
    accountType: 'asset',
    parent: ltAssetParent || null,
    accountCode: '04-ACCUM-DEP',
    createdBy,
  }, transaction);
}

async function getOrCreateGainOnDisposalAccount(shopId, createdBy, transaction) {
  const existing = await db.ChartOfAccount.findOne({
    where: { shop_id: shopId, account_code: '06-GAIN-DISPOSAL' },
    transaction,
  });
  if (existing) return existing;

  const incomeParent = await db.ChartOfAccount.findOne({
    where: { account_code: '06-INCOME' },
    transaction,
  });

  return createAccount({
    shopId,
    accountName: 'Gain on Disposal of Fixed Assets',
    accountType: 'income',
    parent: incomeParent || null,
    accountCode: '06-GAIN-DISPOSAL',
    createdBy,
  }, transaction);
}

async function getOrCreateLossOnDisposalAccount(shopId, createdBy, transaction) {
  const existing = await db.ChartOfAccount.findOne({
    where: { shop_id: shopId, account_code: '07-LOSS-DISPOSAL' },
    transaction,
  });
  if (existing) return existing;

  const expenseParent = await db.ChartOfAccount.findOne({
    where: { account_code: '07-EXPENSE' },
    transaction,
  });

  return createAccount({
    shopId,
    accountName: 'Loss on Disposal of Fixed Assets',
    accountType: 'expense',
    parent: expenseParent || null,
    accountCode: '07-LOSS-DISPOSAL',
    createdBy,
  }, transaction);
}

function isFundParent(parent) {
  return !!(parent && FUND_PARENT_CODES.has(parent.account_code));
}

function fundKindFromParent(parent) {
  return parent.account_code === '05-CASH' ? 'cash' : 'bank';
}

// ── openingBalanceLines ─────────────────────────────────────────────────────
// How an opening balance on a new fund account is funded. This used to be
// hard-coded to 'new_capital', which meant opening an account just to park money
// you already held booked the whole balance as fresh equity — capital counted
// the same rupees twice, once in the source account and once in the new one.
//
//   new_capital — money entering the business for the first time.
//                 Dr <new fund> / Cr Opening Balance Equity. Capital rises.
//   transfer    — money moved from a fund account that already holds it.
//                 Dr <new fund> / Cr <source fund>. Capital unchanged.
//
// A transfer posts as a 'journal', never an 'opening': openingVoucherIds()
// excludes 'opening' vouchers from cash-flow, so booking a genuine movement out
// of the till that way would leave the source's cash silently overstated.
const FUNDING_SOURCES = ['new_capital', 'transfer'];

async function openingBalanceLines({
  shopId, ledgerAccount, openingBal, fundingSource, sourceAccountId, transaction,
}) {
  const debitLine = { accountCode: ledgerAccount.account_code, debit: openingBal };

  if (fundingSource !== 'transfer') {
    return {
      type: 'opening',
      lines: [debitLine, { accountCode: '01-OBE', credit: openingBal }],
      sourceName: null,
    };
  }

  if (!sourceAccountId) {
    const err = new Error('Select the account this money is being moved from');
    err.statusCode = 400;
    throw err;
  }

  // Keyed on the LEDGER account, not a BankAccount row, so the shared '05-CASH'
  // drawer — which has no BankAccount row and is where most shops actually hold
  // their cash — can be the source like any named fund.
  const validSourceIds = await fundAccountIds(shopId, { activeOnly: true, transaction });
  const sourceLedger = validSourceIds.includes(Number(sourceAccountId))
    ? await db.ChartOfAccount.findByPk(sourceAccountId, { transaction })
    : null;
  if (!sourceLedger) {
    const err = new Error('Source must be one of this shop\'s cash or bank accounts');
    err.statusCode = 400;
    throw err;
  }

  // Lock the source BEFORE reading its balance, not after — this used to be
  // a plain check-then-act (read balance, THEN lock while updating), so two
  // concurrent transfers out of the same source could both read the same
  // pre-transfer balance, both pass the floor check below, and jointly
  // overdraw it. Mirrors findTargetBankAccount's row lock for a named fund,
  // and assertCashAvailable's shop-row lock for the shared '05-CASH' drawer,
  // which has no BankAccount row of its own to lock.
  const sourceFund = await db.BankAccount.findOne({
    where: { shop_id: shopId, chart_of_account_id: sourceLedger.id },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!sourceFund && transaction) {
    await db.Shop.findOne({
      where: { id: shopId }, attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE,
    });
  }

  // Same floor every other payment path enforces — you cannot move out more
  // than the source holds.
  const available = await computeAccountBalance(shopId, sourceLedger.id, { transaction });
  if (available - openingBal < 0) {
    const err = new Error(`Insufficient balance in ${sourceLedger.account_name}. Available: ${available.toFixed(2)}`);
    err.statusCode = 400;
    throw err;
  }

  // Keep the linked BankAccount's stored balance in step with the ledger. The
  // shared drawer has no such row, hence the conditional.
  if (sourceFund) {
    await sourceFund.update({
      current_balance: Math.round((parseFloat(sourceFund.current_balance || 0) - openingBal) * 100) / 100,
    }, { transaction });
  }

  return {
    type: 'journal',
    lines: [debitLine, { accountCode: sourceLedger.account_code, credit: openingBal }],
    sourceName: sourceLedger.account_name,
  };
}

async function createFundAccount({
  shopId, accountName, parent, bank_name, account_number, opening_balance, accountCode, createdBy,
  funding_source, source_account_id,
}, transaction) {
  const kind = fundKindFromParent(parent);
  const openingBal = Math.round((parseFloat(opening_balance) || 0) * 100) / 100;
  const fundingSource = funding_source || 'new_capital';
  if (!FUNDING_SOURCES.includes(fundingSource)) {
    const err = new Error(`funding_source must be one of: ${FUNDING_SOURCES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

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
    const { type, lines, sourceName } = await openingBalanceLines({
      shopId, ledgerAccount, openingBal, fundingSource, sourceAccountId: source_account_id, transaction,
    });
    await postVoucher(shopId, {
      type,
      date: new Date(),
      narration: sourceName
        ? `Transfer — ${sourceName} → ${bankAccount.account_name}`
        : `Opening balance — ${bankAccount.account_name}`,
      createdBy,
      lines,
    }, transaction);
  }

  return { ledgerAccount, bankAccount };
}

module.exports = {
  ACCOUNT_TYPES,
  FUND_PARENT_CODES,
  FUNDING_SOURCES,
  generateAccountCode,
  createAccount,
  createFundAccount,
  isFundParent,
  fundKindFromParent,
  hasPostings,
  wouldCreateCycle,
  getOrCreateDirectorsParent,
  getOrCreateDueFromBodParent,
  getOrCreateBodCurrentParent,
  getOrCreateDepreciationExpenseAccount,
  getOrCreateGainOnDisposalAccount,
  getOrCreateLossOnDisposalAccount,
  getOrCreateAccumulatedDepreciationAccount,
};
