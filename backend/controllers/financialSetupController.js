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

// ── GET /api/money-flow ───────────────────────────────────────────────────────
// Total money Received into and Spent out of the shop's liquid accounts
// (Cash in Hand + Bank), derived from the General Ledger so it stays accurate
// no matter which module moved the money — every sale, purchase, expense,
// refund, supplier/customer/employee payment posts a voucher through
// utils/postVoucher, so the GL is the single source of truth.
//
//   Total Received = sum of DEBITS to 05-CASH / 05-BANK  (money in)
//   Total Spent    = sum of CREDITS to 05-CASH / 05-BANK  (money out)
//
// Owner-capital movements (opening balances, capital injections, drawings) and
// contra transfers between the shop's own cash/bank are excluded so the figures
// reflect real business activity rather than the initial float or self-transfers.
// Optional ?from=&to= narrows the window (defaults to all time).
exports.getMoneyFlow = async (req, res) => {
  const shopId = req.user.shop_id;
  if (!shopId) return res.status(403).json({ message: 'No shop context' });

  try {
    const { from, to } = req.query;

    // chart_of_accounts is global/shared across shops, keyed by stable codes.
    const liquid = await db.ChartOfAccount.findAll({
      where: { account_code: { [Op.in]: ['05-CASH', '05-BANK'] } },
      attributes: ['id'],
    });
    const liquidIds = liquid.map(a => a.id);
    if (!liquidIds.length) {
      return res.json({ total_received: 0, total_spent: 0, net: 0 });
    }

    // Vouchers to exclude: those touching an equity account (capital / opening /
    // drawings) and contra transfers between the shop's own accounts.
    const equity = await db.ChartOfAccount.findAll({
      where: { account_type: 'equity' },
      attributes: ['id'],
    });
    const equityIds = equity.map(a => a.id);

    const excluded = new Set();
    if (equityIds.length) {
      const eqVouchers = await db.GeneralLedger.findAll({
        where: { shop_id: shopId, account_id: { [Op.in]: equityIds } },
        attributes: ['voucher_id'],
        group: ['voucher_id'],
        raw: true,
      });
      eqVouchers.forEach(r => excluded.add(r.voucher_id));
    }
    const contraVouchers = await db.Voucher.findAll({
      where: { shop_id: shopId, voucher_type: 'contra' },
      attributes: ['id'],
      raw: true,
    });
    contraVouchers.forEach(v => excluded.add(v.id));

    const where = { shop_id: shopId, account_id: { [Op.in]: liquidIds } };
    if (excluded.size) where.voucher_id = { [Op.notIn]: [...excluded] };
    if (from || to) {
      where.entry_date = {};
      if (from) where.entry_date[Op.gte] = new Date(from);
      if (to) where.entry_date[Op.lte] = new Date(`${to}T23:59:59.999Z`);
    }

    const agg = await db.GeneralLedger.findOne({
      where,
      attributes: [
        [db.sequelize.fn('SUM', db.sequelize.col('debit')), 'total_debit'],
        [db.sequelize.fn('SUM', db.sequelize.col('credit')), 'total_credit'],
      ],
      raw: true,
    });

    const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
    const totalReceived = round2(agg?.total_debit || 0);
    const totalSpent = round2(agg?.total_credit || 0);

    return res.json({
      total_received: totalReceived,
      total_spent: totalSpent,
      net: round2(totalReceived - totalSpent),
    });
  } catch (error) {
    console.error('getMoneyFlow error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/company ──────────────────────────────────────────────────────────
// Lightweight company/shop profile for report & document headers (name, owner,
// contact + logo). Scoped to the caller's shop; super-admins may pass ?shop_id.
exports.getCompany = async (req, res) => {
  const shopId = req.query.shop_id || req.user.shop_id;
  if (!shopId) return res.status(403).json({ message: 'No shop context' });
  try {
    const shop = await db.Shop.findByPk(shopId, {
      attributes: ['id', 'name', 'owner_name', 'email', 'phone', 'address', 'logo_url'],
    });
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    return res.json({ company: shop });
  } catch (error) {
    console.error('getCompany error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PUT /api/company ──────────────────────────────────────────────────────────
// Lets a shop admin edit the company profile shown on every report / document
// letterhead: name, owner, contact details and the logo (a base64 data URL, or
// null to remove it). Scoped to the caller's own shop.
exports.updateCompany = async (req, res) => {
  const shopId = req.user.shop_id;
  if (!shopId) return res.status(403).json({ message: 'No shop context' });

  const { name, owner_name, email, phone, address, logo_url } = req.body;

  // Guard the logo payload: only accept an image data URL (or null/'' to clear).
  if (logo_url !== undefined && logo_url !== null && logo_url !== '') {
    if (typeof logo_url !== 'string' || !/^data:image\/(png|jpe?g|gif|webp);base64,/.test(logo_url)) {
      return res.status(400).json({ message: 'Logo must be a PNG, JPG, GIF or WEBP image.' });
    }
    // ~1.5 MB of base64 (data URLs run ~33% larger than the raw image).
    if (logo_url.length > 2_000_000) {
      return res.status(400).json({ message: 'Logo image is too large. Please use a smaller image.' });
    }
  }

  try {
    const shop = await db.Shop.findByPk(shopId);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    const updates = {};
    if (name !== undefined)       updates.name = String(name).trim();
    if (owner_name !== undefined) updates.owner_name = owner_name ? String(owner_name).trim() : null;
    if (email !== undefined)      updates.email = email ? String(email).trim() : null;
    if (phone !== undefined)      updates.phone = phone ? String(phone).trim() : null;
    if (address !== undefined)    updates.address = address ? String(address).trim() : null;
    if (logo_url !== undefined)   updates.logo_url = logo_url || null;

    if (updates.name === '') return res.status(400).json({ message: 'Company name is required.' });

    await shop.update(updates);

    return res.json({
      company: {
        id: shop.id, name: shop.name, owner_name: shop.owner_name,
        email: shop.email, phone: shop.phone, address: shop.address, logo_url: shop.logo_url,
      },
    });
  } catch (error) {
    console.error('updateCompany error:', error);
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ message: error.errors?.[0]?.message || 'Invalid data.' });
    }
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
// Sets/adjusts today's opening cash amount. Opening cash now carries forward
// automatically from yesterday's closing balance, so this is only used when an
// admin needs to correct today's opening (e.g. a cash-count discrepancy). If a
// session already exists for today, its opening is overwritten.
exports.recordCashSession = async (req, res) => {
  const shopId = req.user.shop_id;
  if (!shopId) return res.status(403).json({ message: 'No shop context' });

  const { opening_cash, notes } = req.body;
  if (opening_cash === undefined || opening_cash === null) {
    return res.status(400).json({ message: 'opening_cash is required' });
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const existing = await db.CashSession.findOne({
      where: { shop_id: shopId, session_date: today }
    });

    if (existing) {
      await existing.update({
        opening_cash: parseFloat(opening_cash) || 0,
        notes:        notes?.trim() ?? existing.notes,
      });
      return res.json({ session: existing });
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
    const { liveCash, openingCash, hasBaseline } = await computeLiveCash(shopId);

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
      session_exists:     hasBaseline,
      as_of:              new Date().toISOString(),
    });
  } catch (error) {
    console.error('getLiveBalances error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
