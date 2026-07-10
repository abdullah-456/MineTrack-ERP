const db = require('../models');
const { Op } = require('sequelize');

// ── POST /api/financial-setup ─────────────────────────────────────────────────
// Called once when admin first sets up the shop's finances.
// Saves bank accounts + opening cash, then marks shop.setup_completed = true.
exports.completeSetup = async (req, res) => {
  const shopId = req.user.shop_id;
  if (!shopId) return res.status(403).json({ message: 'No shop context' });

  const { bank_accounts = [], opening_cash = 0 } = req.body;

  const t = await db.sequelize.transaction();
  try {
    // Save bank accounts
    for (const acct of bank_accounts) {
      if (!acct.account_name || acct.account_name.trim() === '') continue;
      await db.BankAccount.create({
        shop_id:         shopId,
        account_name:    acct.account_name.trim(),
        bank_name:       acct.bank_name?.trim() || null,
        account_number:  acct.account_number?.trim() || null,
        opening_balance: parseFloat(acct.opening_balance) || 0,
        current_balance: parseFloat(acct.opening_balance) || 0,
        is_active:       true,
      }, { transaction: t });
    }

    // Save today's opening cash as the first cash session
    const today = new Date().toISOString().slice(0, 10);
    await db.CashSession.upsert({
      shop_id:      shopId,
      session_date: today,
      opening_cash: parseFloat(opening_cash) || 0,
      created_by:   req.user.id,
    }, { transaction: t });

    // Mark shop as fully set up
    await db.Shop.update(
      { setup_completed: true },
      { where: { id: shopId }, transaction: t }
    );

    await t.commit();
    return res.json({ message: 'Financial setup completed successfully' });
  } catch (error) {
    await t.rollback();
    console.error('completeSetup error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/bank-accounts ────────────────────────────────────────────────────
// Returns all active bank accounts for the shop.
exports.listBankAccounts = async (req, res) => {
  const shopId = req.user.shop_id;
  if (!shopId) return res.status(403).json({ message: 'No shop context' });
  try {
    const accounts = await db.BankAccount.findAll({
      where: { shop_id: shopId, is_active: true },
      order: [['created_at', 'ASC']]
    });
    return res.json({ accounts });
  } catch (error) {
    console.error('listBankAccounts error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/cash-sessions ───────────────────────────────────────────────────
// Records the daily opening cash amount. One per shop per day.
exports.recordCashSession = async (req, res) => {
  const shopId = req.user.shop_id;
  if (!shopId) return res.status(403).json({ message: 'No shop context' });

  const { opening_cash, notes } = req.body;
  if (opening_cash === undefined || opening_cash === null) {
    return res.status(400).json({ message: 'opening_cash is required' });
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    // Check if already recorded today
    const existing = await db.CashSession.findOne({
      where: { shop_id: shopId, session_date: today }
    });

    if (existing) {
      return res.status(409).json({ message: 'Cash session already recorded for today' });
    }

    const session = await db.CashSession.create({
      shop_id:      shopId,
      session_date: today,
      opening_cash: parseFloat(opening_cash) || 0,
      notes:        notes?.trim() || null,
      created_by:   req.user.id,
    });

    return res.status(201).json({ session });
  } catch (error) {
    // Handle unique constraint violation gracefully
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Cash session already recorded for today' });
    }
    console.error('recordCashSession error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/cash-sessions/today ─────────────────────────────────────────────
// Returns today's cash session if it exists, null otherwise.
exports.getTodaySession = async (req, res) => {
  const shopId = req.user.shop_id;
  if (!shopId) return res.status(403).json({ message: 'No shop context' });

  const today = new Date().toISOString().slice(0, 10);
  try {
    const session = await db.CashSession.findOne({
      where: { shop_id: shopId, session_date: today },
      include: [{ model: db.User, as: 'CreatedBy', attributes: ['id', 'name'] }]
    });
    return res.json({ session: session || null, today });
  } catch (error) {
    console.error('getTodaySession error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/cash-sessions ────────────────────────────────────────────────────
// Lists recent cash sessions (last 30 days).
exports.listSessions = async (req, res) => {
  const shopId = req.user.shop_id;
  if (!shopId) return res.status(403).json({ message: 'No shop context' });

  try {
    const sessions = await db.CashSession.findAll({
      where: { shop_id: shopId },
      include: [{ model: db.User, as: 'CreatedBy', attributes: ['id', 'name'] }],
      order: [['session_date', 'DESC']],
      limit: 30
    });
    return res.json({ sessions });
  } catch (error) {
    console.error('listSessions error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/balances ─────────────────────────────────────────────────────────
// Returns live cash-in-hand and total bank balance for the shop's dashboard.
//
// Cash-in-hand = today's opening_cash (cash session)
//              + cash received from sales & installment payments today
//              - cash refunds paid out today
//
// Bank balance = sum of bank_accounts.current_balance
// (current_balance is updated when bank transactions are recorded later)
exports.getLiveBalances = async (req, res) => {
  const shopId = req.user.shop_id;
  if (!shopId) return res.status(403).json({ message: 'No shop context' });

  try {
    const today = new Date().toISOString().slice(0, 10);
    const dayStart = new Date(today + 'T00:00:00.000Z');

    // ── Opening cash from today's session ────────────────────────────────
    const session = await db.CashSession.findOne({
      where: { shop_id: shopId, session_date: today }
    });
    const openingCash = parseFloat(session?.opening_cash || 0);

    // ── Cash IN: cash / mobile_wallet sales payments today ────────────────
    const cashSalesPayments = await db.Payment.findAll({
      where: {
        payment_method: { [Op.in]: ['cash', 'mobile_wallet'] },
        payment_date:   { [Op.gte]: dayStart },
      },
      include: [{
        model: db.Sale,
        where: { shop_id: shopId },
        attributes: [],
        required: true
      }],
      attributes: ['amount'],
    });
    const cashIn = cashSalesPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);

    // ── Cash IN: cash installment payments received today ─────────────────
    const cashInstallments = await db.InstallmentPayment.findAll({
      where: {
        method:       { [Op.in]: ['cash', 'mobile_wallet'] },
        payment_date: { [Op.gte]: dayStart },
      },
      include: [{
        model: db.InstallmentSchedule,
        required: true,
        include: [{
          model: db.InstallmentPlan,
          required: true,
          include: [{
            model: db.Sale,
            where: { shop_id: shopId },
            required: true,
            attributes: []
          }],
          attributes: []
        }],
        attributes: []
      }],
      attributes: ['amount_paid'],
    });
    const installmentCashIn = cashInstallments.reduce((s, p) => s + parseFloat(p.amount_paid || 0), 0);

    // ── Cash OUT: cash refunds paid today ─────────────────────────────────
    const cashRefunds = await db.SaleReturn.findAll({
      where: {
        shop_id:     shopId,
        status:      'completed',
        refund_method: { [Op.in]: ['cash', 'mobile_wallet'] },
        return_date: { [Op.gte]: dayStart },
      },
      attributes: ['refund_amount'],
    });
    const cashOut = cashRefunds.reduce((s, r) => s + parseFloat(r.refund_amount || 0), 0);

    // ── Cash expenses paid in cash today (if Expense model is used) ───────
    // We'll add expense tracking later; for now cash expenses = 0

    const liveCash = Math.round((openingCash + cashIn + installmentCashIn - cashOut) * 100) / 100;

    // ── Bank balance = sum of all active bank_accounts for the shop ───────
    const bankAccounts = await db.BankAccount.findAll({
      where: { shop_id: shopId, is_active: true },
      attributes: ['account_name', 'current_balance', 'bank_name'],
    });
    const totalBank = bankAccounts.reduce((s, a) => s + parseFloat(a.current_balance || 0), 0);

    return res.json({
      cash_in_hand:       liveCash,
      bank_balance:       Math.round(totalBank * 100) / 100,
      bank_accounts:      bankAccounts.map(a => ({
        name:    a.account_name,
        bank:    a.bank_name,
        balance: parseFloat(a.current_balance || 0),
      })),
      opening_cash:       openingCash,
      session_exists:     !!session,
      as_of:              new Date().toISOString(),
    });
  } catch (error) {
    console.error('getLiveBalances error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
