'use strict';

// Lazy, on-demand depreciation catch-up — same convention as
// utils/fiscalYear.js's assertWritableDate "opening the next fiscal year on
// demand": there is no cron here. Whoever next reads asset data (the Assets
// list/view, or the Balance Sheet report) triggers a check for every active,
// paid, rated asset in that shop, and posts whatever years of depreciation
// are due but missing — one voucher per missed year, dated at that year's
// actual purchase-date anniversary, so a long gap between visits doesn't
// dump several years of expense into the current period.

const db = require('../models');
const { postVoucher } = require('./postVoucher');
const {
  getOrCreateDepreciationExpenseAccount, getOrCreateAccumulatedDepreciationAccount,
} = require('./chartOfAccounts');
const { monthsBetween, round2 } = require('./assetDepreciation');

// The asset's Nth purchase-date anniversary.
function anniversaryDate(purchaseDate, years) {
  const d = new Date(purchaseDate);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

// Posts whatever years of depreciation are due but not yet posted for a
// single asset. Runs inside the caller's transaction — used directly (and
// synchronously, errors propagating) by assetController.dispose so the
// disposal's own gain/loss math is never computed against stale
// depreciation_years_posted.
async function catchUpOneAsset(asset, shopId, userId, transaction, { asOfDate } = {}) {
  const pct = parseFloat(asset.depreciation_percentage) || 0;
  if (!pct || !asset.is_paid || !asset.fixed_asset_account_id) return;

  const cost = parseFloat(asset.purchase_cost);
  const salvage = parseFloat(asset.salvage_value) || 0;
  const usefulLife = parseFloat(asset.useful_life_years) || 0;
  const effectiveAsOf = asOfDate ? new Date(asOfDate) : new Date();

  const wholeYears = Math.floor(monthsBetween(new Date(asset.purchase_date), effectiveAsOf) / 12);
  const dueYears = Math.min(wholeYears, usefulLife);

  let postedYears = asset.depreciation_years_posted || 0;
  if (dueYears <= postedYears) return;

  // Ground truth, not a formula recompute: starting from what's ACTUALLY
  // been posted so far means a mid-stream rate/useful-life edit only changes
  // the NEXT increment, never retroactively recalculates years already in
  // the GL under a different rate.
  let bookValue = round2(cost - parseFloat(asset.accumulated_depreciation_posted || 0));

  for (let year = postedYears + 1; year <= dueYears; year++) {
    const rawAmount = round2(bookValue * pct / 100);
    const amount = Math.min(rawAmount, round2(bookValue - salvage));
    if (amount <= 0) { postedYears = year; continue; }

    const depExpAccount = await getOrCreateDepreciationExpenseAccount(shopId, userId, transaction);
    const accumDepAccount = await getOrCreateAccumulatedDepreciationAccount(shopId, userId, transaction);
    const lines = [
      { accountCode: depExpAccount.account_code, debit: amount },
      { accountCode: accumDepAccount.account_code, credit: amount },
    ];
    const narration = `Depreciation — ${asset.asset_name} (year ${year} of ${usefulLife})`;

    try {
      await postVoucher(shopId, {
        type: 'journal',
        date: anniversaryDate(asset.purchase_date, year),
        narration,
        createdBy: userId,
        branchId: asset.branch_id,
        lines,
      }, transaction);
    } catch (err) {
      // Closed books stay immutable — re-post as a today-dated catch-up
      // adjustment instead of losing the entry (or blocking every later
      // year's catch-up behind one closed period).
      if (err.name === 'FiscalYearClosedError') {
        await postVoucher(shopId, {
          type: 'journal',
          date: new Date(),
          narration: `${narration} (catch-up, original period closed)`,
          createdBy: userId,
          branchId: asset.branch_id,
          lines,
        }, transaction);
      } else {
        throw err;
      }
    }
    bookValue = round2(bookValue - amount);
    postedYears = year;
  }

  asset.depreciation_years_posted = postedYears;
  asset.accumulated_depreciation_posted = round2(cost - bookValue);
  await asset.save({ transaction });
}

// Best-effort catch-up for every qualifying asset in a shop, in its own
// transaction so a posting hiccup never blocks the read path that triggered
// it (list/get/balance-sheet) from returning data.
async function catchUpAssetDepreciation(shopId, userId) {
  const transaction = await db.sequelize.transaction();
  try {
    const assets = await db.Asset.findAll({
      where: { shop_id: shopId, status: 'active', is_paid: true },
      transaction,
    });
    for (const asset of assets) {
      if (asset.depreciation_percentage) {
        // eslint-disable-next-line no-await-in-loop
        await catchUpOneAsset(asset, shopId, userId, transaction);
      }
    }
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    console.error('catchUpAssetDepreciation error:', err);
  }
}

module.exports = { catchUpAssetDepreciation, catchUpOneAsset, anniversaryDate };
