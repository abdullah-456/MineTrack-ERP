const db = require('../models');
const { Op } = require('sequelize');
const { computeLiveCash } = require('../utils/cashHelpers');
const { postVoucher } = require('../utils/postVoucher');

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
    let bankOpeningTotal = 0;
    for (const acct of bank_accounts) {
      if (!acct.account_name || acct.account_name.trim() === '') continue;
      const openingBal = parseFloat(acct.opening_balance) || 0;
      await db.BankAccount.create({
        shop_id:         shopId,
        account_name:    acct.account_name.trim(),
        bank_name:       acct.bank_name?.trim() || null,
        account_number:  acct.account_number?.trim() || null,
        opening_balance: openingBal,
        current_balance: openingBal,
        is_active:       true,
      }, { transaction: t });
      bankOpeningTotal += openingBal;
    }
    bankOpeningTotal = Math.round(bankOpeningTotal * 100) / 100;

    // Save today's opening cash as the first cash session
    const today = new Date().toISOString().slice(0, 10);
    const openingCashAmt = parseFloat(opening_cash) || 0;
    await db.CashSession.upsert({
      shop_id:      shopId,
      session_date: today,
      opening_cash: openingCashAmt,
      created_by:   req.user.id,
    }, { transaction: t });

    // Mark shop as fully set up
    await db.Shop.update(
      { setup_completed: true },
      { where: { id: shopId }, transaction: t }
    );

    const openingTotal = Math.round((bankOpeningTotal + openingCashAmt) * 100) / 100;
    if (openingTotal > 0) {
      await postVoucher(shopId, {
        type: 'journal',
        date: new Date(),
        narration: 'Financial setup — opening balances',
        createdBy: req.user.id,
        lines: [
          ...(bankOpeningTotal > 0 ? [{ accountCode: '05-BANK', debit: bankOpeningTotal }] : []),
          ...(openingCashAmt > 0 ? [{ accountCode: '05-CASH', debit: openingCashAmt }] : []),
          { accountCode: '01-CAPITAL', credit: openingTotal },
        ],
      }, t);
    }

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
    // Cash-in-hand (opening cash + today's sales/installments/loan repayments
    // in, minus today's refunds/supplier payments/employee payments out) is
    // computed once in utils/cashHelpers so every cash-moving controller
    // (this dashboard, supplier ledger, employee ledger) agrees on the number.
    const { liveCash, openingCash, session } = await computeLiveCash(shopId);

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
