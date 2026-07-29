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

function parseBranchId(query) {
  const raw = query.branch_id;
  if (!raw) return undefined;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) ? id : undefined;
}

async function loadReportData(shopId, { from, to, asOf, branchId } = {}) {
  const options = { branchId };
  if (from && to) {
    const openingEnd = dayBefore(from);
    const [accounts, openingMap, periodMap, closingMap] = await Promise.all([
      loadAccounts(shopId),
      aggregateGlByAccount(shopId, { asOf: openingEnd }, options),
      aggregateGlByAccount(shopId, { from, to }, options),
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

    const asOf = req.query.as_of || new Date().toISOString().slice(0, 10);
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

    const today = new Date().toISOString().slice(0, 10);
    const to = req.query.to || today;
    const from = req.query.from || `${to.slice(0, 7)}-01`;
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

    const asOf = req.query.as_of || new Date().toISOString().slice(0, 10);
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

    const today = new Date().toISOString().slice(0, 10);
    const to = req.query.to || today;
    const from = req.query.from || `${to.slice(0, 7)}-01`;
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

    const today = new Date().toISOString().slice(0, 10);
    const to = req.query.to || today;
    const from = req.query.from || `${to.slice(0, 7)}-01`;
    const branchId = parseBranchId(req.query);
    const { accounts, openingMap, closingMap, periodMap } = await loadReportData(shopId, { from, to, branchId });
    const report = buildCashFlowStatement(accounts, openingMap, closingMap, periodMap);

    return res.json({ from, to, branch_id: branchId || null, ...report });
  } catch (error) {
    console.error('cashFlow error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
