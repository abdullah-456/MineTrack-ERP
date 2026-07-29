'use strict';

const db = require('../models');
const { postVoucher } = require('./postVoucher');
const {
  createAccount,
  getOrCreateDirectorsParent,
  getOrCreateDueFromBodParent,
  getOrCreateBodCurrentParent,
} = require('./chartOfAccounts');
const {
  debitBankAccount,
  debitCashPayment,
  creditBankAccount,
  creditCashPayment,
  bankAccountCode,
  paymentAccountCode,
} = require('./cashHelpers');

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

function err(statusCode, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

async function codeOf(coaId, transaction) {
  const a = await db.ChartOfAccount.findByPk(coaId, { transaction });
  if (!a) throw err(500, 'BOD chart account missing');
  return a.account_code;
}

function currentBalanceField(method) {
  return method === 'bank' ? 'current_bank_balance' : 'current_cash_balance';
}

function currentCoaField(method) {
  return method === 'bank' ? 'current_bank_coa_id' : 'current_cash_coa_id';
}

function isBodMethod(method) {
  return method === 'bod_cash' || method === 'bod_bank';
}

function bodWalletMethod(method) {
  return method === 'bod_bank' ? 'bank' : 'cash';
}

/** Ensure Investment + Due-from + Current Cash/Bank COAs exist for a member. */
async function ensureBodAccounts(member, createdBy, transaction) {
  const shopId = member.shop_id;
  const updates = {};
  const cashLabel = (member.current_cash_name || '').trim() || `${member.name} — Current Cash`;
  const bankLabel = (member.current_bank_name || '').trim() || `${member.name} — Current Bank`;

  if (!member.chart_of_account_id) {
    const parent = await getOrCreateDirectorsParent(shopId, createdBy, transaction);
    const inv = await createAccount({
      shopId,
      accountName: `${member.name} — Investment`,
      // Equity, not liability: this is owner capital. See
      // getOrCreateDirectorsParent in ./chartOfAccounts.js for why.
      accountType: 'equity',
      parent,
      createdBy,
    }, transaction);
    updates.chart_of_account_id = inv.id;
  } else {
    await db.ChartOfAccount.update(
      { account_name: `${member.name} — Investment` },
      { where: { id: member.chart_of_account_id }, transaction },
    );
  }

  if (!member.due_from_coa_id) {
    const parent = await getOrCreateDueFromBodParent(shopId, createdBy, transaction);
    const due = await createAccount({
      shopId,
      accountName: `${member.name} — Due from (Current held)`,
      accountType: 'asset',
      parent,
      createdBy,
    }, transaction);
    updates.due_from_coa_id = due.id;
  }

  if (!member.current_cash_coa_id) {
    const parent = await getOrCreateBodCurrentParent(shopId, 'cash', createdBy, transaction);
    const cash = await createAccount({
      shopId,
      accountName: cashLabel,
      accountType: 'asset',
      parent,
      createdBy,
    }, transaction);
    updates.current_cash_coa_id = cash.id;
  } else {
    await db.ChartOfAccount.update(
      { account_name: cashLabel },
      { where: { id: member.current_cash_coa_id }, transaction },
    );
  }

  if (!member.current_bank_coa_id) {
    const parent = await getOrCreateBodCurrentParent(shopId, 'bank', createdBy, transaction);
    const bank = await createAccount({
      shopId,
      accountName: bankLabel,
      accountType: 'asset',
      parent,
      createdBy,
    }, transaction);
    updates.current_bank_coa_id = bank.id;
  } else {
    await db.ChartOfAccount.update(
      { account_name: bankLabel },
      { where: { id: member.current_bank_coa_id }, transaction },
    );
  }

  if (Object.keys(updates).length) {
    await member.update(updates, { transaction });
    await member.reload({ transaction });
  }
  return member;
}

async function assertCurrentAvailable(member, method, amt) {
  const bal = round2(member[currentBalanceField(method)]);
  if (bal + 1e-9 < amt) {
    throw err(400, `Insufficient BOD Current ${method} balance (available ${bal})`);
  }
}

async function loadBodMemberForPayment(shopId, boardMemberId, transaction) {
  const member = await db.BoardMember.findOne({
    where: { id: boardMemberId, shop_id: shopId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!member) throw err(404, 'Board member not found');
  await ensureBodAccounts(member, null, transaction);
  return member;
}

function voucherIdOf(voucher) {
  return voucher?.id || voucher?.voucher?.id || null;
}

/**
 * Pay company obligation FROM BOD Current (any available Current wallet funds).
 * Current ↓ (overdraft blocked). Capital cash unchanged.
 * Company-held portion: Cr Due-from.
 * Personal portion: Cr Investment (director funded the company bill).
 */
async function postPayFromBodCurrent(shopId, {
  amount, method, boardMemberId, debitAccountCode, debitLines, narration, createdBy, date, notes, branchId,
}, transaction) {
  const amt = round2(amount);
  if (!(amt > 0)) throw err(400, 'amount must be greater than 0');
  const wallet = bodWalletMethod(method);
  const member = await loadBodMemberForPayment(shopId, boardMemberId, transaction);
  await assertCurrentAvailable(member, wallet, amt);

  const dueAvail = round2(member.due_from_balance);
  const dueAmt = Math.min(amt, dueAvail);
  const personalAmt = round2(amt - dueAmt);
  const field = currentBalanceField(wallet);
  const invBal = round2(parseFloat(member.investment_balance || 0) + personalAmt);

  await member.update({
    [field]: round2(parseFloat(member[field]) - amt),
    due_from_balance: round2(dueAvail - dueAmt),
    investment_balance: invBal,
    current_balance: invBal,
  }, { transaction });

  const dueCode = await codeOf(member.due_from_coa_id, transaction);
  const invCode = await codeOf(member.chart_of_account_id, transaction);
  const debits = debitLines && debitLines.length
    ? debitLines
    : [{ accountCode: debitAccountCode, debit: amt }];

  const creditLines = [];
  if (dueAmt > 0) creditLines.push({ accountCode: dueCode, credit: dueAmt });
  if (personalAmt > 0) creditLines.push({ accountCode: invCode, credit: personalAmt });

  const voucher = await postVoucher(shopId, {
    type: 'payment',
    date: date ? new Date(date) : new Date(),
    narration: narration || `Paid via BOD Current — ${member.name}`,
    createdBy,
    branchId: branchId || null,
    lines: [
      ...debits,
      ...creditLines,
    ],
  }, transaction);

  const txn = await db.BoardMemberTransaction.create({
    shop_id: shopId,
    board_member_id: member.id,
    date: date ? new Date(date) : new Date(),
    type: 'current_payment',
    amount: amt,
    method: wallet,
    notes: notes || null,
    created_by: createdBy,
    voucher_id: voucherIdOf(voucher),
    account_bucket: wallet === 'bank' ? 'current_bank' : 'current_cash',
    fund_origin: personalAmt > 0 && dueAmt > 0 ? 'mixed' : (personalAmt > 0 ? 'personal' : 'company'),
    personal_amount: personalAmt,
    company_amount: dueAmt,
  }, { transaction });

  return { member, voucher, transaction: txn, dueAmt, personalAmt };
}

/**
 * Receipt INTO BOD Current (sale / customer collection held by director).
 * Dr Due-from, Cr Sales/AR (or multiple credit lines). Current ↑, Due-from ↑.
 */
async function postReceiveToBodCurrent(shopId, {
  amount, method, boardMemberId, creditAccountCode, creditLines, narration, createdBy, date, notes, branchId,
}, transaction) {
  const amt = round2(amount);
  if (!(amt > 0)) throw err(400, 'amount must be greater than 0');
  const wallet = bodWalletMethod(method);
  const member = await loadBodMemberForPayment(shopId, boardMemberId, transaction);
  const field = currentBalanceField(wallet);

  await member.update({
    [field]: round2(parseFloat(member[field]) + amt),
    due_from_balance: round2(parseFloat(member.due_from_balance) + amt),
  }, { transaction });

  const dueCode = await codeOf(member.due_from_coa_id, transaction);
  const credits = creditLines && creditLines.length
    ? creditLines
    : [{ accountCode: creditAccountCode, credit: amt }];

  const voucher = await postVoucher(shopId, {
    type: 'receipt',
    date: date ? new Date(date) : new Date(),
    narration: narration || `Collected to BOD Current — ${member.name}`,
    createdBy,
    branchId: branchId || null,
    lines: [
      { accountCode: dueCode, debit: amt },
      ...credits,
    ],
  }, transaction);

  const txn = await db.BoardMemberTransaction.create({
    shop_id: shopId,
    board_member_id: member.id,
    date: date ? new Date(date) : new Date(),
    type: 'current_receipt',
    amount: amt,
    method: wallet,
    notes: notes || null,
    created_by: createdBy,
    voucher_id: voucherIdOf(voucher),
    account_bucket: wallet === 'bank' ? 'current_bank' : 'current_cash',
    fund_origin: 'company',
  }, { transaction });

  return { member, voucher, transaction: txn };
}

/** Personal deposit into Current — no company Capital / Investment GL. */
async function personalDeposit(shopId, member, { amount, method, createdBy, date, notes }, transaction) {
  const amt = round2(amount);
  if (!(amt > 0)) throw err(400, 'amount must be greater than 0');
  if (!['cash', 'bank'].includes(method)) throw err(400, 'method must be cash or bank');
  await ensureBodAccounts(member, createdBy, transaction);
  const field = currentBalanceField(method);
  await member.update({
    [field]: round2(parseFloat(member[field]) + amt),
  }, { transaction });

  const txn = await db.BoardMemberTransaction.create({
    shop_id: shopId,
    board_member_id: member.id,
    date: date ? new Date(date) : new Date(),
    type: 'personal_deposit',
    amount: amt,
    method,
    notes: notes || 'Personal deposit to Current',
    created_by: createdBy,
    account_bucket: method === 'bank' ? 'current_bank' : 'current_cash',
    fund_origin: 'personal',
  }, { transaction });

  return { member, transaction: txn };
}

/** Transfer Current → company Cash/Bank (Capital). */
async function transferToCapital(shopId, member, {
  amount, currentMethod, capitalMethod, capitalBankAccountId, createdBy, date, notes, branchId,
}, transaction) {
  const amt = round2(amount);
  if (!(amt > 0)) throw err(400, 'amount must be greater than 0');
  if (!['cash', 'bank'].includes(currentMethod)) throw err(400, 'currentMethod must be cash or bank');
  if (!['cash', 'bank'].includes(capitalMethod)) throw err(400, 'capitalMethod must be cash or bank');
  await ensureBodAccounts(member, createdBy, transaction);
  await assertCurrentAvailable(member, currentMethod, amt);

  const companyPortion = Math.min(amt, round2(member.due_from_balance));
  const personalPortion = round2(amt - companyPortion);

  let bankAcc = null;
  let cashAcc = null;
  if (capitalMethod === 'bank') {
    bankAcc = await creditBankAccount(shopId, amt, transaction, capitalBankAccountId);
  } else if (capitalBankAccountId) {
    cashAcc = await creditCashPayment(shopId, amt, transaction, capitalBankAccountId);
  }

  const curField = currentBalanceField(currentMethod);
  const invBal = round2(parseFloat(member.investment_balance || 0) + personalPortion);
  await member.update({
    [curField]: round2(parseFloat(member[curField]) - amt),
    due_from_balance: round2(parseFloat(member.due_from_balance) - companyPortion),
    investment_balance: invBal,
    current_balance: invBal,
  }, { transaction });

  const dueCode = await codeOf(member.due_from_coa_id, transaction);
  const invCode = await codeOf(member.chart_of_account_id, transaction);
  const capitalCode = capitalMethod === 'bank'
    ? bankAccountCode(bankAcc)
    : paymentAccountCode('cash', cashAcc);

  const lines = [{ accountCode: capitalCode, debit: amt }];
  if (companyPortion > 0) lines.push({ accountCode: dueCode, credit: companyPortion });
  if (personalPortion > 0) lines.push({ accountCode: invCode, credit: personalPortion });

  const voucher = await postVoucher(shopId, {
    type: 'receipt',
    date: date ? new Date(date) : new Date(),
    narration: notes || `Transfer BOD Current → Capital — ${member.name}`,
    createdBy,
    branchId: branchId || null,
    lines,
  }, transaction);

  const txn = await db.BoardMemberTransaction.create({
    shop_id: shopId,
    board_member_id: member.id,
    date: date ? new Date(date) : new Date(),
    type: 'transfer_to_capital',
    amount: amt,
    method: currentMethod,
    counterpart_method: capitalMethod,
    counterpart_bank_account_id: bankAcc?.id || cashAcc?.id || null,
    notes: notes || null,
    created_by: createdBy,
    voucher_id: voucherIdOf(voucher),
    account_bucket: currentMethod === 'bank' ? 'current_bank' : 'current_cash',
    fund_origin: personalPortion > 0 && companyPortion > 0 ? 'mixed' : (personalPortion > 0 ? 'personal' : 'company'),
    personal_amount: personalPortion,
    company_amount: companyPortion,
  }, { transaction });

  return { member, voucher, transaction: txn, companyPortion, personalPortion };
}

/** Transfer company Cash/Bank → Current. Investment unchanged. */
async function transferFromCapital(shopId, member, {
  amount, currentMethod, capitalMethod, capitalBankAccountId, createdBy, date, notes, branchId,
}, transaction) {
  const amt = round2(amount);
  if (!(amt > 0)) throw err(400, 'amount must be greater than 0');
  if (!['cash', 'bank'].includes(currentMethod)) throw err(400, 'currentMethod must be cash or bank');
  if (!['cash', 'bank'].includes(capitalMethod)) throw err(400, 'capitalMethod must be cash or bank');
  await ensureBodAccounts(member, createdBy, transaction);

  let bankAcc = null;
  let cashAcc = null;
  if (capitalMethod === 'bank') {
    bankAcc = await debitBankAccount(shopId, amt, transaction, capitalBankAccountId);
  } else {
    cashAcc = await debitCashPayment(shopId, amt, transaction, capitalBankAccountId);
  }

  const curField = currentBalanceField(currentMethod);
  await member.update({
    [curField]: round2(parseFloat(member[curField]) + amt),
    due_from_balance: round2(parseFloat(member.due_from_balance) + amt),
  }, { transaction });

  const dueCode = await codeOf(member.due_from_coa_id, transaction);
  const capitalCode = capitalMethod === 'bank'
    ? bankAccountCode(bankAcc)
    : paymentAccountCode('cash', cashAcc);

  const voucher = await postVoucher(shopId, {
    type: 'payment',
    date: date ? new Date(date) : new Date(),
    narration: notes || `Transfer Capital → BOD Current — ${member.name}`,
    createdBy,
    branchId: branchId || null,
    lines: [
      { accountCode: dueCode, debit: amt },
      { accountCode: capitalCode, credit: amt },
    ],
  }, transaction);

  const txn = await db.BoardMemberTransaction.create({
    shop_id: shopId,
    board_member_id: member.id,
    date: date ? new Date(date) : new Date(),
    type: 'transfer_from_capital',
    amount: amt,
    method: currentMethod,
    counterpart_method: capitalMethod,
    counterpart_bank_account_id: bankAcc?.id || cashAcc?.id || null,
    notes: notes || null,
    created_by: createdBy,
    voucher_id: voucherIdOf(voucher),
    account_bucket: currentMethod === 'bank' ? 'current_bank' : 'current_cash',
    fund_origin: 'company',
  }, { transaction });

  return { member, voucher, transaction: txn };
}

/** Investment contribution via company Cash/Bank. */
async function investmentReceive(shopId, member, {
  amount, method, bankAccountId, createdBy, date, notes, branchId,
}, transaction) {
  const amt = round2(amount);
  if (!(amt > 0)) throw err(400, 'amount must be greater than 0');
  await ensureBodAccounts(member, createdBy, transaction);

  let bankAcc = null;
  let cashAcc = null;
  if (method === 'bank') {
    bankAcc = await creditBankAccount(shopId, amt, transaction, bankAccountId);
  } else if (bankAccountId) {
    cashAcc = await creditCashPayment(shopId, amt, transaction, bankAccountId);
  }

  const invBal = round2(parseFloat(member.investment_balance || 0) + amt);
  await member.update({ investment_balance: invBal, current_balance: invBal }, { transaction });

  const invCode = await codeOf(member.chart_of_account_id, transaction);
  const voucher = await postVoucher(shopId, {
    type: 'receipt',
    date: date ? new Date(date) : new Date(),
    narration: notes || `Investment received — ${member.name}`,
    createdBy,
    branchId: branchId || null,
    lines: [
      { accountCode: method === 'bank' ? bankAccountCode(bankAcc) : paymentAccountCode('cash', cashAcc), debit: amt },
      { accountCode: invCode, credit: amt },
    ],
  }, transaction);

  const txn = await db.BoardMemberTransaction.create({
    shop_id: shopId,
    board_member_id: member.id,
    date: date ? new Date(date) : new Date(),
    type: 'contribution',
    amount: amt,
    method,
    bank_account_id: bankAcc?.id || cashAcc?.id || null,
    notes: notes || null,
    created_by: createdBy,
    voucher_id: voucherIdOf(voucher),
    account_bucket: 'investment',
  }, { transaction });

  return { member, voucher, transaction: txn };
}

/** Investment withdrawal via company Cash/Bank. */
async function investmentSend(shopId, member, {
  amount, method, bankAccountId, createdBy, date, notes, branchId,
}, transaction) {
  const amt = round2(amount);
  if (!(amt > 0)) throw err(400, 'amount must be greater than 0');
  await ensureBodAccounts(member, createdBy, transaction);

  let bankAcc = null;
  let cashAcc = null;
  if (method === 'bank') {
    bankAcc = await debitBankAccount(shopId, amt, transaction, bankAccountId);
  } else {
    cashAcc = await debitCashPayment(shopId, amt, transaction, bankAccountId);
  }

  // Mirrors assertCurrentAvailable's guard on the Current wallets: without it a
  // director could withdraw more capital than they ever contributed, leaving a
  // negative equity balance that reads as an asset on the balance sheet.
  const availableInvestment = round2(parseFloat(member.investment_balance || 0));
  if (availableInvestment + 1e-9 < amt) {
    throw err(400, `Withdrawal exceeds ${member.name}'s investment balance (available ${availableInvestment})`);
  }

  const invBal = round2(availableInvestment - amt);
  await member.update({ investment_balance: invBal, current_balance: invBal }, { transaction });

  const invCode = await codeOf(member.chart_of_account_id, transaction);
  const voucher = await postVoucher(shopId, {
    type: 'payment',
    date: date ? new Date(date) : new Date(),
    narration: notes || `Investment withdrawal — ${member.name}`,
    createdBy,
    branchId: branchId || null,
    lines: [
      { accountCode: invCode, debit: amt },
      { accountCode: method === 'bank' ? bankAccountCode(bankAcc) : paymentAccountCode('cash', cashAcc), credit: amt },
    ],
  }, transaction);

  const txn = await db.BoardMemberTransaction.create({
    shop_id: shopId,
    board_member_id: member.id,
    date: date ? new Date(date) : new Date(),
    type: 'withdrawal',
    amount: amt,
    method,
    bank_account_id: bankAcc?.id || cashAcc?.id || null,
    notes: notes || null,
    created_by: createdBy,
    voucher_id: voucherIdOf(voucher),
    account_bucket: 'investment',
  }, { transaction });

  return { member, voucher, transaction: txn };
}

async function listPaymentSources(shopId) {
  const members = await db.BoardMember.findAll({
    where: { shop_id: shopId },
    attributes: [
      'id', 'name',
      'current_cash_balance', 'current_bank_balance',
      'current_cash_name', 'current_bank_name',
    ],
    order: [['name', 'ASC']],
  });
  return members.flatMap(m => ([
    {
      value: `bod_cash:${m.id}`,
      label: (m.current_cash_name || '').trim() || `${m.name} — Current Cash`,
      method: 'bod_cash',
      board_member_id: m.id,
      balance: round2(m.current_cash_balance),
    },
    {
      value: `bod_bank:${m.id}`,
      label: (m.current_bank_name || '').trim() || `${m.name} — Current Bank`,
      method: 'bod_bank',
      board_member_id: m.id,
      balance: round2(m.current_bank_balance),
    },
  ]));
}

/**
 * Parse UI payment value into company or BOD source.
 * value: 'cash' | 'cash:123' | 'bank:123' | 'bod_cash:5' | 'bod_bank:5'
 */
function parsePaymentSource(value, fallbackMethod, fallbackBankId) {
  if (value && String(value).startsWith('bod_')) {
    const [method, idStr] = String(value).split(':');
    return {
      kind: 'bod',
      method,
      boardMemberId: parseInt(idStr, 10),
      bankAccountId: null,
    };
  }
  if (value && String(value).includes(':')) {
    const [method, idStr] = String(value).split(':');
    return {
      kind: 'company',
      method: method === 'bank' ? 'bank' : 'cash',
      boardMemberId: null,
      bankAccountId: idStr ? parseInt(idStr, 10) : null,
    };
  }
  return {
    kind: 'company',
    method: fallbackMethod || (value === 'bank' ? 'bank' : 'cash'),
    boardMemberId: null,
    bankAccountId: fallbackBankId || null,
  };
}

module.exports = {
  round2,
  ensureBodAccounts,
  isBodMethod,
  bodWalletMethod,
  postPayFromBodCurrent,
  postReceiveToBodCurrent,
  personalDeposit,
  transferToCapital,
  transferFromCapital,
  investmentReceive,
  investmentSend,
  listPaymentSources,
  parsePaymentSource,
  assertCurrentAvailable,
  currentBalanceField,
  currentCoaField,
};
