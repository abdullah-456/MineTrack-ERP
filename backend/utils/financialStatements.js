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

function dayBefore(dateStr) {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function voucherIdsForBranch(shopId, branchId) {
  if (!branchId) return null;
  const rows = await db.Voucher.findAll({
    where: { shop_id: shopId, branch_id: parseInt(branchId, 10) },
    attributes: ['id'],
    raw: true,
  });
  return rows.map(r => r.id);
}

async function aggregateGlByAccount(shopId, range = {}, options = {}) {
  const where = { shop_id: shopId };
  const entryDate = buildEntryDateFilter(range);
  if (entryDate) where.entry_date = entryDate;

  const branchVoucherIds = await voucherIdsForBranch(shopId, options.branchId);
  if (branchVoucherIds !== null) {
    if (!branchVoucherIds.length) return {};
    where.voucher_id = { [Op.in]: branchVoucherIds };
  }

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

function computePeriodNetProfit(accounts, periodMap) {
  let income = 0;
  let expenses = 0;
  for (const acct of accounts) {
    const bal = periodMap[acct.id] || { net: 0 };
    if (acct.account_type === 'income') income += periodIncome(bal.net);
    if (acct.account_type === 'expense') expenses += periodExpense(bal.net);
  }
  return round2(income - expenses);
}

function accountsByIdMap(accounts) {
  return new Map(accounts.map(a => [a.id, a]));
}

function ancestorCodes(acct, accountsById) {
  const codes = [acct.account_code];
  let node = acct;
  while (node?.parent_account_id) {
    node = accountsById.get(node.parent_account_id);
    if (node) codes.push(node.account_code);
  }
  return codes;
}

function buildCashAccountIds(accounts) {
  const accountsById = accountsByIdMap(accounts);
  const ids = new Set();
  for (const acct of accounts) {
    const codes = ancestorCodes(acct, accountsById);
    if (codes.some(c => c === '05-CASH' || c === '05-BANK')) ids.add(acct.id);
  }
  return ids;
}

function cashFlowCategory(acct, accountsById, cashIds) {
  if (cashIds.has(acct.id)) return 'cash';
  if (acct.account_type === 'income' || acct.account_type === 'expense') return 'skip';
  const codes = ancestorCodes(acct, accountsById);
  if (codes.some(c => c === '05-CASH' || c === '05-BANK')) return 'cash';
  if (codes.some(c => c === '04-LT-ASSET')) return 'investing';
  if (codes.some(c => c === '02-LT-LIAB')) return 'financing';
  if (codes.some(c => c === '01-CAPITAL') || acct.account_type === 'equity') return 'financing';
  if (acct.account_type === 'asset') return 'operating';
  if (acct.account_type === 'liability') return 'operating';
  return 'skip';
}

function balanceChange(openingMap, closingMap, acct) {
  const openAmt = naturalAmount(acct.account_type, (openingMap[acct.id] || { net: 0 }).net);
  const closeAmt = naturalAmount(acct.account_type, (closingMap[acct.id] || { net: 0 }).net);
  return round2(closeAmt - openAmt);
}

function adjustmentLabel(acct, change, category) {
  const dir = change > 0 ? 'Increase' : 'Decrease';
  if (category === 'operating') {
    if (acct.account_type === 'asset') return `${dir} in ${acct.account_name}`;
    return `${dir} in ${acct.account_name}`;
  }
  if (category === 'investing') return `${dir} in ${acct.account_name}`;
  if (category === 'financing') {
    if (acct.account_type === 'equity') return change > 0 ? 'Capital contributed' : 'Drawings / capital reduction';
    return `${dir} in ${acct.account_name}`;
  }
  return acct.account_name;
}

function buildEquityStatement(accounts, openingMap, periodMap) {
  const detail = [];
  let capitalContributed = 0;
  let drawings = 0;

  for (const acct of accounts.filter(a => a.account_type === 'equity')) {
    const opening = naturalAmount('equity', (openingMap[acct.id] || { net: 0 }).net);
    const movement = naturalAmount('equity', (periodMap[acct.id] || { net: 0 }).net);
    if (Math.abs(opening) < 0.005 && Math.abs(movement) < 0.005) continue;
    detail.push({
      account_code: acct.account_code,
      account_name: acct.account_name,
      opening,
      movement,
      closing: round2(opening + movement),
    });
    if (movement > 0) capitalContributed += movement;
    else if (movement < 0) drawings += Math.abs(movement);
  }

  capitalContributed = round2(capitalContributed);
  drawings = round2(drawings);
  const openingRetained = computeUnclosedEarnings(accounts, openingMap);
  const netProfit = computePeriodNetProfit(accounts, periodMap);
  const openingEquity = round2(
    detail.reduce((s, r) => s + r.opening, 0) + openingRetained,
  );
  const closingEquity = round2(openingEquity + capitalContributed - drawings + netProfit);

  const summary = [
    { key: 'opening', label: 'Opening balance', amount: openingEquity },
    ...(capitalContributed > 0 ? [{ key: 'capital', label: 'Capital contributed', amount: capitalContributed }] : []),
    ...(drawings > 0 ? [{ key: 'drawings', label: 'Drawings', amount: -drawings }] : []),
    { key: 'net_profit', label: 'Net profit for the period', amount: netProfit },
    { key: 'closing', label: 'Closing balance', amount: closingEquity },
  ];

  return {
    summary,
    detail,
    opening_balance: openingEquity,
    capital_contributed: capitalContributed,
    drawings,
    net_profit: netProfit,
    closing_balance: closingEquity,
    opening_retained_earnings: openingRetained,
  };
}

function buildCashFlowStatement(accounts, openingMap, closingMap, periodMap) {
  const accountsById = accountsByIdMap(accounts);
  const cashIds = buildCashAccountIds(accounts);
  const netProfit = computePeriodNetProfit(accounts, periodMap);

  const operatingAdjustments = [];
  const investingLines = [];
  const financingLines = [];

  for (const acct of accounts) {
    const category = cashFlowCategory(acct, accountsById, cashIds);
    if (category === 'skip' || category === 'cash') continue;

    const change = balanceChange(openingMap, closingMap, acct);
    if (Math.abs(change) < 0.005) continue;

    let cashEffect = 0;
    if (category === 'operating') {
      cashEffect = acct.account_type === 'asset' ? round2(-change) : round2(change);
      operatingAdjustments.push({
        account_code: acct.account_code,
        account_name: acct.account_name,
        label: adjustmentLabel(acct, change, category),
        change,
        cash_effect: cashEffect,
      });
    } else if (category === 'investing') {
      cashEffect = round2(-change);
      investingLines.push({
        account_code: acct.account_code,
        account_name: acct.account_name,
        label: adjustmentLabel(acct, change, category),
        change,
        cash_effect: cashEffect,
      });
    } else if (category === 'financing') {
      cashEffect = round2(change);
      financingLines.push({
        account_code: acct.account_code,
        account_name: acct.account_name,
        label: adjustmentLabel(acct, change, category),
        change,
        cash_effect: cashEffect,
      });
    }
  }

  const operatingTotal = round2(
    netProfit + operatingAdjustments.reduce((s, r) => s + r.cash_effect, 0),
  );
  const investingTotal = round2(investingLines.reduce((s, r) => s + r.cash_effect, 0));
  const financingTotal = round2(financingLines.reduce((s, r) => s + r.cash_effect, 0));
  const computedNetChange = round2(operatingTotal + investingTotal + financingTotal);

  let openingCash = 0;
  let closingCash = 0;
  for (const id of cashIds) {
    openingCash += naturalAmount('asset', (openingMap[id] || { net: 0 }).net);
    closingCash += naturalAmount('asset', (closingMap[id] || { net: 0 }).net);
  }
  openingCash = round2(openingCash);
  closingCash = round2(closingCash);
  const netCashChange = round2(closingCash - openingCash);

  return {
    operating: {
      net_profit: netProfit,
      adjustments: operatingAdjustments,
      total: operatingTotal,
    },
    investing: {
      lines: investingLines,
      total: investingTotal,
    },
    financing: {
      lines: financingLines,
      total: financingTotal,
    },
    net_cash_change: netCashChange,
    computed_net_change: computedNetChange,
    opening_cash: openingCash,
    closing_cash: closingCash,
    is_reconciled: Math.abs(netCashChange - computedNetChange) < 0.02,
  };
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
  dayBefore,
  aggregateGlByAccount,
  loadAccounts,
  buildTrialBalance,
  buildProfitAndLoss,
  buildBalanceSheet,
  buildEquityStatement,
  buildCashFlowStatement,
};
