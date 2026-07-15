'use strict';

const db = require('../models');
const { Op } = require('sequelize');

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

function buildEntryDateFilter({ from, to, asOf } = {}) {
  const filter = {};
  if (from) filter[Op.gte] = new Date(from);
  const end = to || asOf;
  if (end) filter[Op.lte] = new Date(`${end}T23:59:59.999Z`);
  return Object.keys(filter).length ? filter : null;
}

async function aggregateGlByAccount(shopId, range = {}) {
  const where = { shop_id: shopId };
  const entryDate = buildEntryDateFilter(range);
  if (entryDate) where.entry_date = entryDate;

  const rows = await db.GeneralLedger.findAll({
    where,
    attributes: [
      'account_id',
      [db.sequelize.fn('SUM', db.sequelize.col('debit')), 'total_debit'],
      [db.sequelize.fn('SUM', db.sequelize.col('credit')), 'total_credit'],
    ],
    group: ['account_id'],
    raw: true,
  });

  const map = {};
  for (const row of rows) {
    const debit = round2(row.total_debit);
    const credit = round2(row.total_credit);
    map[row.account_id] = { debit, credit, net: round2(debit - credit) };
  }
  return map;
}

async function loadAccounts() {
  return db.ChartOfAccount.findAll({ order: [['account_code', 'ASC']] });
}

// Leaf accounts plus any top-level account with direct GL activity (e.g. 01-CAPITAL
// from opening balances). Header-only parents with no postings stay excluded.
function reportAccounts(accounts, balanceMap) {
  return accounts.filter((acct) => {
    const bal = balanceMap[acct.id];
    if (!bal || Math.abs(bal.net) < 0.005) return false;
    if (acct.parent_account_id) return true;
    return true;
  });
}

function naturalAmount(accountType, net) {
  if (accountType === 'asset' || accountType === 'expense') return round2(net);
  return round2(-net);
}

function periodIncome(net) {
  return round2(-net);
}

function periodExpense(net) {
  return round2(net);
}

function buildTrialBalance(accounts, balanceMap) {
  const rows = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const acct of reportAccounts(accounts, balanceMap)) {
    const bal = balanceMap[acct.id] || { net: 0 };
    if (Math.abs(bal.net) < 0.005) continue;

    let debit = 0;
    let credit = 0;
    if (bal.net > 0) {
      debit = bal.net;
      totalDebit += debit;
    } else {
      credit = -bal.net;
      totalCredit += credit;
    }

    rows.push({
      account_code: acct.account_code,
      account_name: acct.account_name,
      account_type: acct.account_type,
      debit,
      credit,
    });
  }

  return {
    rows,
    total_debit: round2(totalDebit),
    total_credit: round2(totalCredit),
    is_balanced: Math.abs(totalDebit - totalCredit) < 0.02,
  };
}

function buildProfitAndLoss(accounts, balanceMap) {
  const income = [];
  const expenses = [];
  let totalIncome = 0;
  let totalExpenses = 0;

  for (const acct of reportAccounts(accounts, balanceMap)) {
    const bal = balanceMap[acct.id] || { net: 0 };
    if (acct.account_type === 'income') {
      const amount = periodIncome(bal.net);
      if (Math.abs(amount) < 0.005) continue;
      income.push({ account_code: acct.account_code, account_name: acct.account_name, amount });
      totalIncome += amount;
    } else if (acct.account_type === 'expense') {
      const amount = periodExpense(bal.net);
      if (Math.abs(amount) < 0.005) continue;
      expenses.push({ account_code: acct.account_code, account_name: acct.account_name, amount });
      totalExpenses += amount;
    }
  }

  totalIncome = round2(totalIncome);
  totalExpenses = round2(totalExpenses);

  return {
    income,
    expenses,
    total_income: totalIncome,
    total_expenses: totalExpenses,
    net_profit: round2(totalIncome - totalExpenses),
  };
}

function computeUnclosedEarnings(accounts, balanceMap) {
  let earnings = 0;
  for (const acct of reportAccounts(accounts, balanceMap)) {
    const bal = balanceMap[acct.id] || { net: 0 };
    if (acct.account_type === 'income') earnings += periodIncome(bal.net);
    if (acct.account_type === 'expense') earnings -= periodExpense(bal.net);
  }
  return round2(earnings);
}

function buildBalanceSheet(accounts, balanceMap) {
  const assets = [];
  const liabilities = [];
  const equity = [];
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;

  for (const acct of reportAccounts(accounts, balanceMap)) {
    if (acct.account_type === 'income' || acct.account_type === 'expense') continue;
    const bal = balanceMap[acct.id];
    if (!bal) continue;

    const amount = naturalAmount(acct.account_type, bal.net);
    if (Math.abs(amount) < 0.005) continue;

    const row = { account_code: acct.account_code, account_name: acct.account_name, amount };
    if (acct.account_type === 'asset') {
      assets.push(row);
      totalAssets += amount;
    } else if (acct.account_type === 'liability') {
      liabilities.push(row);
      totalLiabilities += amount;
    } else if (acct.account_type === 'equity') {
      equity.push(row);
      totalEquity += amount;
    }
  }

  const unclosedEarnings = computeUnclosedEarnings(accounts, balanceMap);
  if (Math.abs(unclosedEarnings) >= 0.005) {
    equity.push({
      account_code: '',
      account_name: 'Current Period Earnings',
      amount: unclosedEarnings,
      is_computed: true,
    });
    totalEquity += unclosedEarnings;
  }

  totalAssets = round2(totalAssets);
  totalLiabilities = round2(totalLiabilities);
  totalEquity = round2(totalEquity);

  return {
    assets,
    liabilities,
    equity,
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    total_equity: totalEquity,
    total_liabilities_and_equity: round2(totalLiabilities + totalEquity),
    is_balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.02,
  };
}

module.exports = {
  aggregateGlByAccount,
  loadAccounts,
  buildTrialBalance,
  buildProfitAndLoss,
  buildBalanceSheet,
};
