const db = require('../models');
const { requireShopId } = require('../utils/shopScope');
const {
  dayBefore,
  aggregateGlByAccount,
  loadAccounts,
  buildTrialBalance,
  buildProfitAndLoss,
  buildBalanceSheet,
  buildEquityStatement,
  buildCashFlowStatement,
} = require('../utils/financialStatements');
const { defaultDateRangeForCurrentFY } = require('../utils/fiscalYear');

// Explicit from/to/as_of always wins. Otherwise the report follows the fiscal
// year selected in the UI, falling back to the shop's current year.
//
// `fiscal_year_id` used to be ignored here, so only the Trial Balance — which
// drives its own as_of from the selector — reacted to it. Picking a past year
// left the P&L, balance sheet, equity and cash-flow reports silently showing the
// current year.
//
// preferPeriod distinguishes the two kinds of report: period reports (P&L, cash
// flow, equity) span the year, position reports (balance sheet, trial balance)
// are stated as at its end date.
async function resolveReportRange(req, shopId, { preferPeriod = false } = {}) {
  const today = new Date().toISOString().slice(0, 10);

  if (preferPeriod && (req.query.from || req.query.to)) {
    return {
      from: req.query.from || `${(req.query.to || today).slice(0, 7)}-01`,
      to: req.query.to || today,
    };
  }
  if (!preferPeriod && req.query.as_of) {
    return { asOf: req.query.as_of };
  }

  const fyId = req.query.fiscal_year_id ? parseInt(req.query.fiscal_year_id, 10) : null;
  if (fyId) {
    const fy = await db.FiscalYear.findOne({ where: { id: fyId, shop_id: shopId } });
    if (fy) return preferPeriod ? { from: fy.start_date, to: fy.end_date } : { asOf: fy.end_date };
  }

  const fyRange = await defaultDateRangeForCurrentFY(shopId);
  if (fyRange) return preferPeriod ? { from: fyRange.from, to: fyRange.to } : { asOf: fyRange.to };

  return preferPeriod ? { from: `${today.slice(0, 7)}-01`, to: today } : { asOf: today };
}

function parseBranchId(query) {
  const raw = query.branch_id;
  if (!raw) return undefined;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) ? id : undefined;
}

async function loadReportData(shopId, { from, to, asOf, branchId } = {}) {
  const options = { branchId };
  // periodMap drives the P&L and the equity statement's movement column, so the
  // year-end closing voucher is excluded from it — otherwise a closed year
  // reports zero revenue and zero expenses against its own closing entry. The
  // opening/closing position maps keep it, because the transfer to Retained
  // Earnings is part of the position.
  const periodOptions = { branchId, excludeVoucherTypes: ['closing'] };
  if (from && to) {
    const openingEnd = dayBefore(from);
    const [accounts, openingMap, periodMap, closingMap] = await Promise.all([
      loadAccounts(shopId),
      aggregateGlByAccount(shopId, { asOf: openingEnd }, options),
      aggregateGlByAccount(shopId, { from, to }, periodOptions),
      aggregateGlByAccount(shopId, { asOf: to }, options),
    ]);
    return { accounts, openingMap, periodMap, closingMap };
  }

  const end = asOf || new Date().toISOString().slice(0, 10);
  const [accounts, balanceMap] = await Promise.all([
    loadAccounts(shopId),
    aggregateGlByAccount(shopId, { asOf: end }, options),
  ]);
  return { accounts, balanceMap, openingMap: balanceMap, periodMap: balanceMap, closingMap: balanceMap };
}

// ── GET /reports/trial-balance?as_of=&branch_id= ─────────────────────────────
exports.trialBalance = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { asOf } = await resolveReportRange(req, shopId);
    const branchId = parseBranchId(req.query);
    const { accounts, balanceMap } = await loadReportData(shopId, { asOf, branchId });
    const report = buildTrialBalance(accounts, balanceMap);

    return res.json({ as_of: asOf, branch_id: branchId || null, ...report });
  } catch (error) {
    console.error('trialBalance error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /reports/profit-and-loss?from=&to=&branch_id= ─────────────────────────
exports.profitAndLoss = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { from, to } = await resolveReportRange(req, shopId, { preferPeriod: true });
    const branchId = parseBranchId(req.query);
    const { accounts, periodMap } = await loadReportData(shopId, { from, to, branchId });
    const report = buildProfitAndLoss(accounts, periodMap);

    return res.json({ from, to, branch_id: branchId || null, ...report });
  } catch (error) {
    console.error('profitAndLoss error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /reports/balance-sheet?as_of=&branch_id= ──────────────────────────────
exports.balanceSheet = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { asOf } = await resolveReportRange(req, shopId);
    const branchId = parseBranchId(req.query);
    const { accounts, balanceMap } = await loadReportData(shopId, { asOf, branchId });
    const report = buildBalanceSheet(accounts, balanceMap);

    return res.json({ as_of: asOf, branch_id: branchId || null, ...report });
  } catch (error) {
    console.error('balanceSheet error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /reports/equity-statement?from=&to=&branch_id= ──────────────────────
// Statement of changes in equity for a period.
exports.equityStatement = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { from, to } = await resolveReportRange(req, shopId, { preferPeriod: true });
    const branchId = parseBranchId(req.query);
    const { accounts, openingMap, periodMap } = await loadReportData(shopId, { from, to, branchId });
    const report = buildEquityStatement(accounts, openingMap, periodMap);

    return res.json({ from, to, branch_id: branchId || null, ...report });
  } catch (error) {
    console.error('equityStatement error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /reports/cash-flow?from=&to=&branch_id= ───────────────────────────────
// Cash flow statement (indirect method) for a period.
exports.cashFlow = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { from, to } = await resolveReportRange(req, shopId, { preferPeriod: true });
    const branchId = parseBranchId(req.query);
    const { accounts, openingMap, closingMap, periodMap } = await loadReportData(shopId, { from, to, branchId });
    const report = buildCashFlowStatement(accounts, openingMap, closingMap, periodMap);

    return res.json({ from, to, branch_id: branchId || null, ...report });
  } catch (error) {
    console.error('cashFlow error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
