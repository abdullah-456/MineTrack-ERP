'use strict';

// Reducing-balance (WDV) depreciation — the FBR tax-depreciation convention:
// each whole year since purchase, book value shrinks by depreciation_percentage
// of its CURRENT (not original) value, for at most useful_life_years years.
// After that the asset keeps its frozen book value and stays on the register
// until it's actually disposed — reaching the end of useful life is not disposal.
//
// Never stored on its own — always re-derived from (cost, salvage, percentage,
// purchase_date, asOfDate). assetDepreciationRun.js additionally needs the
// per-year incremental amounts (not just the running total) to post each
// missed year's GL entry separately, hence exporting bookValueAfterYears too.

function monthsBetween(fromDate, toDate) {
  if (toDate <= fromDate) return 0;
  let months = (toDate.getUTCFullYear() - fromDate.getUTCFullYear()) * 12
    + (toDate.getUTCMonth() - fromDate.getUTCMonth());
  if (toDate.getUTCDate() < fromDate.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Book value after `years` whole years of reducing-balance depreciation at
// `pct`%, floored at salvage value. Not capped at useful life here — callers
// decide how many years to apply.
function bookValueAfterYears(cost, salvage, pct, years) {
  if (!pct || years <= 0) return cost;
  const raw = cost * Math.pow(1 - pct / 100, years);
  return Math.max(raw, salvage);
}

// asOfDate defaults to now; pass the disposal date instead once an asset is disposed.
function computeDepreciation({
  purchaseCost, salvageValue, depreciationPercentage, usefulLifeYears, purchaseDate, asOfDate,
}) {
  const cost = parseFloat(purchaseCost) || 0;
  const salvage = Math.min(parseFloat(salvageValue) || 0, cost);
  const pct = parseFloat(depreciationPercentage) || 0;
  const usefulLife = parseFloat(usefulLifeYears) || 0;

  const purchase = new Date(purchaseDate);
  const effectiveAsOf = asOfDate ? new Date(asOfDate) : new Date();
  const wholeYearsElapsed = Math.floor(monthsBetween(purchase, effectiveAsOf) / 12);
  const yearsElapsed = pct > 0 ? Math.min(wholeYearsElapsed, usefulLife) : 0;

  const bookValue = round2(bookValueAfterYears(cost, salvage, pct, yearsElapsed));
  const accumulatedDepreciation = round2(cost - bookValue);

  return {
    accumulatedDepreciation,
    bookValue,
    yearsElapsed,
    usefulLifeYears: usefulLife,
    isFullyDepreciated: pct > 0 && yearsElapsed >= usefulLife && usefulLife > 0,
  };
}

module.exports = { computeDepreciation, bookValueAfterYears, monthsBetween, round2 };
