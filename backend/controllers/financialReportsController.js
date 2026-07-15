const { requireShopId } = require('../utils/shopScope');
const {
  aggregateGlByAccount,
  loadAccounts,
  buildTrialBalance,
  buildProfitAndLoss,
  buildBalanceSheet,
} = require('../utils/financialStatements');

// ── GET /reports/trial-balance?as_of= ────────────────────────────────────────
// Lists every ledger account with its debit or credit balance. Totals must match.
exports.trialBalance = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const asOf = req.query.as_of || new Date().toISOString().slice(0, 10);
    const [accounts, balanceMap] = await Promise.all([
      loadAccounts(),
      aggregateGlByAccount(shopId, { asOf }),
    ]);
    const report = buildTrialBalance(accounts, balanceMap);

    return res.json({ as_of: asOf, ...report });
  } catch (error) {
    console.error('trialBalance error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /reports/profit-and-loss?from=&to= ───────────────────────────────────
// Income and expense activity for a date range.
exports.profitAndLoss = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const today = new Date().toISOString().slice(0, 10);
    const to = req.query.to || today;
    const from = req.query.from || `${to.slice(0, 7)}-01`;

    const [accounts, balanceMap] = await Promise.all([
      loadAccounts(),
      aggregateGlByAccount(shopId, { from, to }),
    ]);
    const report = buildProfitAndLoss(accounts, balanceMap);

    return res.json({ from, to, ...report });
  } catch (error) {
    console.error('profitAndLoss error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /reports/balance-sheet?as_of= ────────────────────────────────────────
// Assets, liabilities, and equity as of a date. Unclosed P&L rolls into equity.
exports.balanceSheet = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const asOf = req.query.as_of || new Date().toISOString().slice(0, 10);
    const [accounts, balanceMap] = await Promise.all([
      loadAccounts(),
      aggregateGlByAccount(shopId, { asOf }),
    ]);
    const report = buildBalanceSheet(accounts, balanceMap);

    return res.json({ as_of: asOf, ...report });
  } catch (error) {
    console.error('balanceSheet error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
