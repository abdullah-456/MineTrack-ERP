const db = require('../models');
const { Op } = require('sequelize');
const { computeLiveCash, computeTotalCashOnHand, resolveOpeningCash } = require('../utils/cashHelpers');
const { postVoucher } = require('../utils/postVoucher');
const { createAccount } = require('../utils/chartOfAccounts');

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const todayStr = () => new Date().toISOString().slice(0, 10);

async function createBankAccountsFromPayload(shopId, bank_accounts, userId, transaction) {
  const bankParent = await db.ChartOfAccount.findOne({ where: { account_code: '05-BANK' }, transaction });
  let bankOpeningTotal = 0;
  const bankOpeningLines = [];

  for (const acct of bank_accounts) {
    if (!acct.account_name || acct.account_name.trim() === '') continue;
    const openingBal = round2(acct.opening_balance);
    const ledgerAccount = await createAccount({
      shopId, accountName: acct.account_name.trim(), accountType: 'asset', parent: bankParent, createdBy: userId,
    }, transaction);
    await db.BankAccount.create({
      shop_id:             shopId,
      account_name:        acct.account_name.trim(),
      bank_name:           acct.bank_name?.trim() || null,
      account_number:      acct.account_number?.trim() || null,
      opening_balance:     openingBal,
      current_balance:     openingBal,
      is_active:           true,
      chart_of_account_id: ledgerAccount.id,
    }, { transaction });
    bankOpeningTotal += openingBal;
    if (openingBal > 0) bankOpeningLines.push({ accountCode: ledgerAccount.account_code, debit: openingBal });
  }

  return { bankOpeningTotal: round2(bankOpeningTotal), bankOpeningLines };
}

async function hadNonZeroCashOpening(shopId, transaction) {
  return !!(await db.CashSession.findOne({
    where: { shop_id: shopId, opening_cash: { [Op.gt]: 0 } },
    transaction,
  }));
}

async function upsertTodayCashSession(shopId, openingCashAmt, userId, transaction) {
  const today = todayStr();
  await db.CashSession.upsert({
    shop_id:      shopId,
    session_date: today,
    opening_cash: openingCashAmt,
    created_by:   userId,
  }, { transaction });
}

// ── postCashCountAdjustment ───────────────────────────────────────────────────
// Books the difference between what the drawer actually holds and what the
// books say it should, so recording a cash count stops being a one-sided change
// to an asset.
//
// Tagged 'opening' on purpose. That keeps it out of computeCashFlow (a counting
// correction is not trading activity) while still recording it in the ledger —
// which is exactly what makes the two cash figures move together: the session
// baseline that gates payments and the GL total shown on the dashboard both
// shift by the same delta instead of drifting apart.
async function postCashCountAdjustment(shopId, delta, userId, transaction, reason) {
  const amount = round2(delta);
  if (Math.abs(amount) < 0.005) return;

  const surplus = amount > 0;
  const magnitude = Math.abs(amount);

  await postVoucher(shopId, {
    type: 'opening',
    date: new Date(),
    narration: reason || `Opening cash count adjustment (${surplus ? 'over' : 'short'} ${magnitude.toFixed(2)})`,
    createdBy: userId,
    lines: surplus
      // More cash than the books expected: asset up, gain recorded.
      ? [{ accountCode: '05-CASH', debit: magnitude }, { accountCode: '07-CASH-VAR', credit: magnitude }]
      // Less cash than expected: shortfall expensed, asset down.
      : [{ accountCode: '07-CASH-VAR', debit: magnitude }, { accountCode: '05-CASH', credit: magnitude }],
  }, transaction);
}

async function postOpeningCashJournal(shopId, amount, userId, transaction) {
  const openingCashAmt = round2(amount);
  if (openingCashAmt <= 0) return;

  await postVoucher(shopId, {
    type: 'opening',
    date: new Date(),
    narration: 'Opening cash balance',
    createdBy: userId,
    lines: [
      { accountCode: '05-CASH', debit: openingCashAmt },
      { accountCode: '01-OBE', credit: openingCashAmt },
    ],
  }, transaction);
}

// ── POST /api/financial-setup/skip ────────────────────────────────────────────
// Lets an admin dismiss the first-time wizard without entering balances yet.
exports.skipSetup = async (req, res) => {
  const shopId = req.user.shop_id;
  if (!shopId) return res.status(403).json({ message: 'No shop context' });

  try {
    await db.Shop.update({ setup_completed: true }, { where: { id: shopId } });
    return res.json({ message: 'Financial setup skipped' });
  } catch (error) {
    console.error('skipSetup error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/financial-setup/opening-cash ────────────────────────────────────
// Record opening cash later (from the dashboard cash pill).
exports.setOpeningCash = async (req, res) => {
  const shopId = req.user.shop_id;
  if (!shopId) return res.status(403).json({ message: 'No shop context' });

  const { opening_cash } = req.body;
  if (opening_cash === undefined || opening_cash === null) {
    return res.status(400).json({ message: 'opening_cash is required' });
  }

  const openingCashAmt = round2(opening_cash);
  if (openingCashAmt < 0) {
    return res.status(400).json({ message: 'opening_cash cannot be negative' });
  }

  const t = await db.sequelize.transaction();
  try {
    const alreadyRecorded = await hadNonZeroCashOpening(shopId, t);

    if (!alreadyRecorded) {
      // First time: the whole amount is capital being introduced.
      await upsertTodayCashSession(shopId, openingCashAmt, req.user.id, t);
      await postOpeningCashJournal(shopId, openingCashAmt, req.user.id, t);
    } else {
      // Any later correction only used to move the session row, leaving the
      // ledger untouched and the two cash figures permanently divergent. Book
      // the difference instead.
      const { openingCash: expected } = await resolveOpeningCash(shopId, { transaction: t });
      await upsertTodayCashSession(shopId, openingCashAmt, req.user.id, t);
      await postCashCountAdjustment(
        shopId, openingCashAmt - round2(expected), req.user.id, t,
        `Opening cash corrected to ${openingCashAmt.toFixed(2)}`,
      );
    }

    await t.commit();
    return res.json({ message: 'Opening cash saved', opening_cash: openingCashAmt });
  } catch (error) {
    await t.rollback();
    console.error('setOpeningCash error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/financial-setup/bank-accounts ───────────────────────────────────
// Add bank accounts later (from the dashboard bank pill).
exports.addBankAccounts = async (req, res) => {
  const shopId = req.user.shop_id;
  if (!shopId) return res.status(403).json({ message: 'No shop context' });

  const { bank_accounts = [] } = req.body;
  const validAccounts = bank_accounts.filter(a => a.account_name?.trim());
  if (!validAccounts.length) {
    return res.status(400).json({ message: 'Add at least one bank account with a label' });
  }

  const t = await db.sequelize.transaction();
  try {
    const { bankOpeningTotal, bankOpeningLines } = await createBankAccountsFromPayload(
      shopId, validAccounts, req.user.id, t,
    );

    if (bankOpeningTotal > 0) {
      await postVoucher(shopId, {
        type: 'opening',
        date: new Date(),
        narration: 'Opening bank balances',
        createdBy: req.user.id,
        lines: [
          ...bankOpeningLines,
          { accountCode: '01-OBE', credit: bankOpeningTotal },
        ],
      }, t);
    }

    await t.commit();
    return res.json({ message: 'Bank accounts added', count: validAccounts.length });
  } catch (error) {
    await t.rollback();
    console.error('addBankAccounts error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/financial-setup ─────────────────────────────────────────────────
// Called once when admin first sets up the shop's finances.
// Saves bank accounts + opening cash, then marks shop.setup_completed = true.
exports.completeSetup = async (req, res) => {
  const shopId = req.user.shop_id;
  if (!shopId) return res.status(403).json({ message: 'No shop context' });

  const { bank_accounts = [], opening_cash = 0 } = req.body;

  const t = await db.sequelize.transaction();
  try {
    const { bankOpeningTotal, bankOpeningLines } = await createBankAccountsFromPayload(
      shopId, bank_accounts, req.user.id, t,
    );

    const openingCashAmt = round2(opening_cash);
    if (openingCashAmt > 0) {
      await upsertTodayCashSession(shopId, openingCashAmt, req.user.id, t);
    }

    await db.Shop.update(
      { setup_completed: true },
      { where: { id: shopId }, transaction: t }
    );

    const openingTotal = round2(bankOpeningTotal + openingCashAmt);
    if (openingTotal > 0) {
      await postVoucher(shopId, {
        type: 'opening',
        date: new Date(),
        narration: 'Financial setup — opening balances',
        createdBy: req.user.id,
        lines: [
          ...bankOpeningLines,
          ...(openingCashAmt > 0 ? [{ accountCode: '05-CASH', debit: openingCashAmt }] : []),
          { accountCode: '01-OBE', credit: openingTotal },
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
    // '05-BANK' also has per-account sub-accounts nested under it (this shop's
    // own named bank accounts) that must count as liquid too, or money moved
    // through a specific bank account would silently drop out of this total.
    const cashAndBankParents = await db.ChartOfAccount.findAll({
      where: { account_code: { [Op.in]: ['05-CASH', '05-BANK'] } },
      attributes: ['id', 'account_code'],
    });
    const bankParent = cashAndBankParents.find(a => a.account_code === '05-BANK');
    const cashParent = cashAndBankParents.find(a => a.account_code === '05-CASH');
    const fundChildWhere = (parentId) => ({
      where: { parent_account_id: parentId, [Op.or]: [{ shop_id: null }, { shop_id: shopId }] },
      attributes: ['id'],
    });
    const bankChildren = bankParent
      ? await db.ChartOfAccount.findAll(fundChildWhere(bankParent.id))
      : [];
    const cashChildren = cashParent
      ? await db.ChartOfAccount.findAll(fundChildWhere(cashParent.id))
      : [];
    const liquidIds = [...cashAndBankParents, ...bankChildren, ...cashChildren].map(a => a.id);
    if (!liquidIds.length) {
      return res.json({ total_received: 0, total_spent: 0, net: 0 });
    }

    // Vouchers to exclude: opening-balance/setup journals, and contra transfers
    // between the shop's own accounts.
    //
    // Previously this excluded every voucher touching an equity account, which
    // also hid genuine cash movements (owner drawings, and the cash leg of
    // "Direct stock received"). Now that director capital is correctly typed as
    // equity, that test would have hidden every BOD movement too. Opening
    // vouchers are tagged at posting time instead — see
    // openingVoucherIds in utils/cashHelpers.js.
    const excluded = new Set();
    const skipVouchers = await db.Voucher.findAll({
      where: { shop_id: shopId, voucher_type: { [Op.in]: ['opening', 'contra'] } },
      attributes: ['id'],
      raw: true,
    });
    skipVouchers.forEach(v => excluded.add(v.id));

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
// Returns every bank account for the shop (active and deactivated) — callers
// that only want ones a user can pick as a payment source (e.g. the payment
// method dropdown) filter is_active client-side, same as the Chart of
// Accounts list.
exports.listBankAccounts = async (req, res) => {
  const shopId = req.user.shop_id;
  if (!shopId) return res.status(403).json({ message: 'No shop context' });
  try {
    const accounts = await db.BankAccount.findAll({
      where: { shop_id: shopId },
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

  const today = todayStr();
  const countedCash = round2(opening_cash);
  if (countedCash < 0) {
    return res.status(400).json({ message: 'opening_cash cannot be negative' });
  }

  // Previously this ran with no transaction at all — the only write path in the
  // codebase that didn't — and adjusted the cash asset with no offsetting entry.
  const t = await db.sequelize.transaction();
  try {
    // What the books say the drawer should open with, before this count.
    const { openingCash: expected } = await resolveOpeningCash(shopId, { transaction: t });

    const existing = await db.CashSession.findOne({
      where: { shop_id: shopId, session_date: today },
      transaction: t,
    });

    let session;
    if (existing) {
      await existing.update({
        opening_cash: countedCash,
        notes:        notes?.trim() ?? existing.notes,
      }, { transaction: t });
      session = existing;
    } else {
      session = await db.CashSession.create({
        shop_id:      shopId,
        session_date: today,
        opening_cash: countedCash,
        notes:        notes?.trim() || null,
        created_by:   req.user.id,
      }, { transaction: t });
    }

    await postCashCountAdjustment(
      shopId, countedCash - round2(expected), req.user.id, t,
      `Cash count on ${today} — counted ${countedCash.toFixed(2)}`,
    );

    await t.commit();
    return res.status(existing ? 200 : 201).json({ session });
  } catch (error) {
    if (!t.finished) await t.rollback();
    console.error('recordCashSession error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
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
// Returns merged cash-in-hand (shared drawer + all named cash funds, from the
// GL) and total bank balance for the dashboard.
exports.getLiveBalances = async (req, res) => {
  const shopId = req.user.shop_id;
  if (!shopId) return res.status(403).json({ message: 'No shop context' });

  try {
    const [{ openingCash, hasBaseline }, totalCash] = await Promise.all([
      computeLiveCash(shopId),
      computeTotalCashOnHand(shopId),
    ]);

    const bankAccounts = await db.BankAccount.findAll({
      where: { shop_id: shopId, is_active: true, kind: 'bank' },
      attributes: ['account_name', 'current_balance', 'bank_name'],
    });
    const totalBank = bankAccounts.reduce((s, a) => s + parseFloat(a.current_balance || 0), 0);

    return res.json({
      cash_in_hand:       totalCash,
      bank_balance:       Math.round(totalBank * 100) / 100,
      bank_accounts:      bankAccounts.map(a => ({
        name:    a.account_name,
        bank:    a.bank_name,
        balance: parseFloat(a.current_balance || 0),
      })),
      opening_cash:       openingCash,
      session_exists:     hasBaseline,
      // BOD Current is director-held — not included in Capital cash/bank above.
      bod_due_from: await (async () => {
        const rows = await db.BoardMember.findAll({
          where: { shop_id: shopId },
          attributes: ['due_from_balance', 'current_cash_balance', 'current_bank_balance', 'investment_balance'],
        });
        return {
          due_from_total: Math.round(rows.reduce((s, m) => s + parseFloat(m.due_from_balance || 0), 0) * 100) / 100,
          current_cash_total: Math.round(rows.reduce((s, m) => s + parseFloat(m.current_cash_balance || 0), 0) * 100) / 100,
          current_bank_total: Math.round(rows.reduce((s, m) => s + parseFloat(m.current_bank_balance || 0), 0) * 100) / 100,
          investment_total: Math.round(rows.reduce((s, m) => s + parseFloat(m.investment_balance || 0), 0) * 100) / 100,
        };
      })(),
      as_of:              new Date().toISOString(),
    });
  } catch (error) {
    console.error('getLiveBalances error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
