'use strict';

const db = require('../models');
const { postVoucher, BALANCE_TOLERANCE } = require('../utils/postVoucher');
const {
  aggregateGlByAccount,
  loadAccounts,
  buildTrialBalance,
  naturalAmount,
  periodIncome,
  periodExpense,
} = require('../utils/financialStatements');
const {
  nextFiscalYearStart,
  computeEndDate,
  fiscalYearLabelFromStart,
  round2,
  toDateOnly,
} = require('../utils/fiscalYear');

const RETAINED_EARNINGS = '01-RE';

async function buildPreCloseChecklist(shopId, fiscalYearId) {
  const fy = await db.FiscalYear.findOne({ where: { id: fiscalYearId, shop_id: shopId } });
  if (!fy) {
    const err = new Error('Fiscal year not found');
    err.statusCode = 404;
    throw err;
  }

  const accounts = await loadAccounts(shopId);
  const balanceMap = await aggregateGlByAccount(shopId, { to: fy.end_date });
  const trialBalance = buildTrialBalance(accounts, balanceMap);

  const draftVouchers = await db.Voucher.count({
    where: { shop_id: shopId, status: 'draft' },
  });

  const warnings = [];
  if (draftVouchers > 0) {
    warnings.push(`${draftVouchers} draft voucher(s) exist — post or delete before closing.`);
  }

  return {
    fiscal_year: {
      id: fy.id,
      label: fy.label,
      start_date: fy.start_date,
      end_date: fy.end_date,
      status: fy.status,
    },
    trial_balance: trialBalance,
    warnings,
    can_close: fy.status === 'open' && trialBalance.is_balanced,
    blocking_issues: [
      ...(fy.status !== 'open' ? ['Fiscal year is not open.'] : []),
      ...(!trialBalance.is_balanced ? ['Trial balance is not balanced.'] : []),
    ],
  };
}

// ── closeFiscalYear ─────────────────────────────────────────────────────────
// Rolls a year over. Deliberately does NOT post an opening-balances voucher for
// the new year: the general ledger is continuous and never reset, so balances
// carry forward on their own. Re-stating them would make every cumulative
// figure — balance sheet, trial balance, the Cash/Bank pills, the ledger's
// capital column — count the same money twice.
//
// What a close actually does:
//   • posts the closing voucher, moving the year's P&L into Retained Earnings
//   • snapshots the year-end position of every balance-sheet account
//   • marks the year closed, freezing it against further postings
//   • makes sure the following year exists
//
// `transaction` can be injected so tests can exercise a close and roll it back.
async function closeFiscalYear(shopId, fiscalYearId, userId, { transaction: injected } = {}) {
  const fy = await db.FiscalYear.findOne({
    where: { id: fiscalYearId, shop_id: shopId },
    transaction: injected,
  });
  if (!fy) {
    const err = new Error('Fiscal year not found');
    err.statusCode = 404;
    throw err;
  }
  if (fy.status !== 'open') {
    const err = new Error('Fiscal year is already closed');
    err.statusCode = 400;
    throw err;
  }

  const today = toDateOnly(new Date());
  if (today <= fy.end_date) {
    const err = new Error(`Year-end close is only allowed after ${fy.end_date}`);
    err.statusCode = 400;
    throw err;
  }

  const checklist = await buildPreCloseChecklist(shopId, fiscalYearId);
  if (!checklist.can_close) {
    const err = new Error(checklist.blocking_issues.join(' '));
    err.statusCode = 400;
    throw err;
  }

  const shop = await db.Shop.findByPk(shopId, { transaction: injected });
  const accounts = await loadAccounts(shopId);
  const balanceMap = await aggregateGlByAccount(shopId, { to: fy.end_date });

  const run = async (transaction) => {
    const closeLines = [];
    let incomeDebitTotal = 0;
    let expenseCreditTotal = 0;

    for (const acct of accounts) {
      const bal = balanceMap[acct.id];
      if (!bal || Math.abs(bal.net) < 0.005) continue;

      if (acct.account_type === 'income') {
        const amount = periodIncome(bal.net);
        if (amount >= 0.005) {
          closeLines.push({ accountCode: acct.account_code, debit: amount });
          incomeDebitTotal += amount;
        }
      } else if (acct.account_type === 'expense') {
        const amount = periodExpense(bal.net);
        if (amount >= 0.005) {
          closeLines.push({ accountCode: acct.account_code, credit: amount });
          expenseCreditTotal += amount;
        }
      }
    }

    incomeDebitTotal = round2(incomeDebitTotal);
    expenseCreditTotal = round2(expenseCreditTotal);
    const netToRe = round2(incomeDebitTotal - expenseCreditTotal);

    if (Math.abs(netToRe) >= 0.005) {
      if (netToRe > 0) {
        closeLines.push({ accountCode: RETAINED_EARNINGS, credit: netToRe });
      } else {
        closeLines.push({ accountCode: RETAINED_EARNINGS, debit: -netToRe });
      }
    }

    let closingVoucher = null;
    if (closeLines.length > 0) {
      closingVoucher = await postVoucher(shopId, {
        type: 'closing',
        date: `${fy.end_date}T12:00:00.000Z`,
        narration: `${fy.label} — year-end P&L close to Retained Earnings`,
        createdBy: userId,
        lines: closeLines,
      }, transaction);

      await closingVoucher.update({ fiscal_year_id: fy.id }, { transaction });
    }

    const postCloseMap = await aggregateGlByAccount(shopId, { to: fy.end_date });
    const snapshots = [];

    for (const acct of accounts) {
      if (acct.account_type === 'income' || acct.account_type === 'expense') continue;
      const bal = postCloseMap[acct.id];
      if (!bal || Math.abs(bal.net) < 0.005) continue;

      snapshots.push({
        fiscal_year_id: fy.id,
        account_id: acct.id,
        debit: bal.debit,
        credit: bal.credit,
        balance: round2(naturalAmount(acct.account_type, bal.net)),
      });
    }

    if (snapshots.length) {
      await db.FiscalYearSnapshot.bulkCreate(snapshots, { transaction });
    }

    await fy.update({
      status: 'closed',
      closed_at: new Date(),
      closed_by: userId,
      closing_voucher_id: closingVoucher?.id || null,
    }, { transaction });

    // The successor usually exists already: ensureFiscalYearCoveringDate opens
    // it the moment someone posts after year end, so trading never stops while a
    // close is outstanding. Find-or-create keeps this idempotent either way.
    const newStart = nextFiscalYearStart(fy.end_date);
    const endMonth = shop.fiscal_year_end_month || 6;
    const endDay = shop.fiscal_year_end_day || 30;

    const [newFy] = await db.FiscalYear.findOrCreate({
      where: { shop_id: shopId, start_date: newStart },
      defaults: {
        shop_id: shopId,
        label: fiscalYearLabelFromStart(newStart),
        start_date: newStart,
        end_date: computeEndDate(newStart, endMonth, endDay),
        status: 'open',
      },
      transaction,
    });

    // Closing an OLD year must never drag the shop's current year backwards.
    const currentFy = shop.current_fiscal_year_id
      ? await db.FiscalYear.findByPk(shop.current_fiscal_year_id, { transaction })
      : null;
    if (!currentFy || newFy.start_date > currentFy.start_date) {
      await shop.update({ current_fiscal_year_id: newFy.id }, { transaction });
    }

    return {
      closed_fiscal_year: {
        id: fy.id,
        label: fy.label,
        closing_voucher_id: closingVoucher?.id || null,
      },
      new_fiscal_year: {
        id: newFy.id,
        label: newFy.label,
        start_date: newFy.start_date,
        end_date: newFy.end_date,
      },
    };
  };

  return injected ? run(injected) : db.sequelize.transaction(run);
}

module.exports = {
  buildPreCloseChecklist,
  closeFiscalYear,
  BALANCE_TOLERANCE,
};
