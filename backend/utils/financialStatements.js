'use strict';

const db = require('../models');
const { Op } = require('sequelize');
const { BALANCE_TOLERANCE } = require('./postVoucher');

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

function buildEntryDateFilter({ from, to, asOf } = {}) {
  const filter = {};
  let applied = false;
  if (from) { filter[Op.gte] = new Date(from); applied = true; }
  const end = to || asOf;
  if (end) { filter[Op.lte] = new Date(`${end}T23:59:59.999Z`); applied = true; }
  // Op.gte / Op.lte are Symbols, and Object.keys() never returns symbol keys —
  // so the old `Object.keys(filter).length` test was always 0 and this function
  // always returned null. Every date range on every financial report was
  // silently discarded: "as of" trial balances and balance sheets, P&L and cash
  // flow periods all reported inception-to-date instead. It also made the cash
  // flow statement unreconcilable, because its opening and closing snapshots
  // came back identical.
  return applied ? filter : null;
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

  // Period reports exclude year-end closing vouchers. The closing entry is dated
  // the last day of the year, so it sits INSIDE the period being reported — a
  // P&L run for a closed year would net its own revenue and expenses to zero
  // against it. Position reports (balance sheet, trial balance) must keep it,
  // since that is what moves the year's result into Retained Earnings.
  if (options.excludeVoucherTypes?.length) {
    const excluded = await db.Voucher.findAll({
      where: { shop_id: shopId, voucher_type: { [Op.in]: options.excludeVoucherTypes } },
      attributes: ['id'],
      raw: true,
    });
    if (excluded.length) {
      where.voucher_id = where.voucher_id
        ? { [Op.and]: [where.voucher_id, { [Op.notIn]: excluded.map(v => v.id) }] }
        : { [Op.notIn]: excluded.map(v => v.id) };
    }
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

// Scoped to one tenant: system accounts (shop_id NULL) plus this shop's own
// custom accounts. Loading every shop's accounts was masked only because other
// tenants' balances come back zero from the shop-scoped GL aggregate — the
// account names themselves were still in scope, and any future report that
// listed accounts rather than balances would have leaked them.
// Mirrors the filter in generalLedgerController.listChartOfAccounts.
async function loadAccounts(shopId) {
  const where = shopId
    ? { [Op.or]: [{ shop_id: null }, { shop_id: shopId }] }
    : undefined;
  return db.ChartOfAccount.findAll({ where, order: [['account_code', 'ASC']] });
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
    // Same tolerance the posting engine enforces — a report must not be able to
    // call itself balanced by a margin postVoucher would have rejected.
    is_balanced: Math.abs(totalDebit - totalCredit) <= BALANCE_TOLERANCE,
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

// Counter-entry account for balances carried in when a shop is first set up
// (opening cash/bank, supplier payables, employee balances). Equity by nature,
// but NOT owner activity — see migrations/20260811000005.
const OPENING_BALANCE_EQUITY_CODE = '01-OBE';

function buildEquityStatement(accounts, openingMap, periodMap) {
  const detail = [];
  let capitalContributed = 0;
  let drawings = 0;
  let openingBalanceEquity = 0;

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
    // Balances carried in at setup are migration artifacts, not the owner
    // putting money in or taking it out. Reporting them as "Capital
    // contributed" / "Drawings" made this statement meaningless — recording a
    // supplier's outstanding payable read as an owner capital injection.
    if (acct.account_code === OPENING_BALANCE_EQUITY_CODE) {
      openingBalanceEquity += movement;
    } else if (movement > 0) capitalContributed += movement;
    else if (movement < 0) drawings += Math.abs(movement);
  }

  capitalContributed = round2(capitalContributed);
  drawings = round2(drawings);
  openingBalanceEquity = round2(openingBalanceEquity);
  const openingRetained = computeUnclosedEarnings(accounts, openingMap);
  const netProfit = computePeriodNetProfit(accounts, periodMap);
  const openingEquity = round2(
    detail.reduce((s, r) => s + r.opening, 0) + openingRetained,
  );
  const closingEquity = round2(
    openingEquity + capitalContributed - drawings + openingBalanceEquity + netProfit,
  );

  const summary = [
    { key: 'opening', label: 'Opening balance', amount: openingEquity },
    ...(capitalContributed > 0 ? [{ key: 'capital', label: 'Capital contributed', amount: capitalContributed }] : []),
    ...(drawings > 0 ? [{ key: 'drawings', label: 'Drawings', amount: -drawings }] : []),
    ...(Math.abs(openingBalanceEquity) >= 0.005
      ? [{ key: 'opening_balance_equity', label: 'Opening balances recorded', amount: openingBalanceEquity }]
      : []),
    { key: 'net_profit', label: 'Net profit for the period', amount: netProfit },
    { key: 'closing', label: 'Closing balance', amount: closingEquity },
  ];

  return {
    summary,
    detail,
    opening_balance: openingEquity,
    capital_contributed: capitalContributed,
    drawings,
    opening_balance_equity: openingBalanceEquity,
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
    // Deliberately looser than BALANCE_TOLERANCE: unlike a single voucher, this
    // compares two figures each summed from many independently-rounded account
    // balances, so a cent of drift per account is expected rather than a fault.
    is_reconciled: Math.abs(netCashChange - computedNetChange) <= BALANCE_TOLERANCE * 10,
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

  // The P&L accounts' cumulative (all-time) balance IS the unclosed remainder on
  // its own: a year-end close posts a closing voucher that debits/credits those
  // same account codes back to zero as of the close date, so whatever is left
  // in them afterward is only what the NEXT, still-open period has earned.
  // computeUnclosedEarnings needs no extra guard for "has this shop ever closed
  // a year before" — it already nets correctly whether that answer is yes or no.
  //
  // A guard keyed on "does Retained Earnings have a balance" used to sit here,
  // meant to stop a closed year's own balance sheet from double-plugging its
  // already-zeroed earnings. It was wrong: once a shop closed its FIRST year
  // ever, RE keeps a balance forever, so this suppressed the "Current Period
  // Earnings" line for every later period too — not just the one that had
  // actually been closed. A real balance sheet went unbalanced by exactly the
  // new period's unclosed net income the first time a shop closed a year and
  // then kept trading.
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
    is_balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) <= BALANCE_TOLERANCE,
  };
}

module.exports = {
  dayBefore,
  aggregateGlByAccount,
  loadAccounts,
  // Sign helpers, shared with services/fiscalYearClose.js so the year-end close
  // reads a balance exactly the way the statements do. They were used there
  // before being exported, which left them undefined and made every close throw.
  naturalAmount,
  periodIncome,
  periodExpense,
  buildTrialBalance,
  buildProfitAndLoss,
  buildBalanceSheet,
  buildEquityStatement,
  buildCashFlowStatement,
};
