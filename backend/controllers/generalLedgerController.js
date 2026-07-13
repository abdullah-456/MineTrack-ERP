const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');

// ── GET /accounting/chart-of-accounts ────────────────────────────────────────
// Chart of Accounts rows are shared/global (not shop-scoped), but each
// account's displayed balance is computed from THIS shop's GeneralLedger rows
// only, via the same shop_id column postVoucher stamps every entry with.
exports.listChartOfAccounts = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const accounts = await db.ChartOfAccount.findAll({ order: [['account_code', 'ASC']] });

    const balances = await db.GeneralLedger.findAll({
      where: { shop_id: shopId },
      attributes: [
        'account_id',
        [db.sequelize.fn('SUM', db.sequelize.col('debit')), 'total_debit'],
        [db.sequelize.fn('SUM', db.sequelize.col('credit')), 'total_credit'],
      ],
      group: ['account_id'],
      raw: true,
    });
    const balanceMap = {};
    balances.forEach(b => {
      balanceMap[b.account_id] = Math.round((parseFloat(b.total_debit || 0) - parseFloat(b.total_credit || 0)) * 100) / 100;
    });

    const flat = accounts.map(a => ({
      id: a.id,
      account_code: a.account_code,
      account_name: a.account_name,
      account_type: a.account_type,
      parent_account_id: a.parent_account_id,
      balance: balanceMap[a.id] || 0,
    }));

    return res.json({ accounts: flat });
  } catch (error) {
    console.error('listChartOfAccounts error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /accounting/general-ledger?account_id=&from=&to= ────────────────────
// The whole-business ledger: every voucher line posted for this shop, optionally
// filtered to one account and/or a date range. running_balance on each row was
// computed at write time scoped to this shop (see utils/postVoucher.js), so no
// recomputation is needed here even when a date range narrows the view.
exports.listEntries = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.account_id) where.account_id = parseInt(req.query.account_id, 10);
    if (req.query.from || req.query.to) {
      where.entry_date = {};
      if (req.query.from) where.entry_date[Op.gte] = new Date(req.query.from);
      if (req.query.to) where.entry_date[Op.lte] = new Date(`${req.query.to}T23:59:59.999Z`);
    }

    const entries = await db.GeneralLedger.findAll({
      where,
      include: [
        { model: db.ChartOfAccount, attributes: ['id', 'account_code', 'account_name', 'account_type'] },
        { model: db.Voucher, attributes: ['id', 'voucher_number', 'voucher_type', 'narration'] },
      ],
      order: [['entry_date', 'DESC'], ['id', 'DESC']],
      limit: 500,
    });

    const rows = entries.map(e => ({
      id: e.id,
      date: e.entry_date,
      voucher_number: e.Voucher?.voucher_number,
      voucher_type: e.Voucher?.voucher_type,
      narration: e.Voucher?.narration,
      account_code: e.ChartOfAccount?.account_code,
      account_name: e.ChartOfAccount?.account_name,
      debit: parseFloat(e.debit || 0),
      credit: parseFloat(e.credit || 0),
      running_balance: parseFloat(e.running_balance || 0),
    }));

    return res.json({ entries: rows });
  } catch (error) {
    console.error('listGeneralLedgerEntries error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /accounting/vouchers/:id ─────────────────────────────────────────────
// A single voucher with its debit/credit lines — used by the printable
// voucher slip (e.g. auto-opened right after a product is created with stock).
exports.getVoucher = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const voucher = await db.Voucher.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: [
        { model: db.User, as: 'Creator', attributes: ['id', 'name'] },
        { model: db.Shop, attributes: ['id', 'name', 'owner_name', 'email', 'phone', 'address', 'logo_url'] },
      ],
    });
    if (!voucher) return res.status(404).json({ message: 'Voucher not found' });

    const entries = await db.GeneralLedger.findAll({
      where: { voucher_id: voucher.id },
      include: [{ model: db.ChartOfAccount, attributes: ['id', 'account_code', 'account_name'] }],
      order: [['id', 'ASC']],
    });

    return res.json({
      company: voucher.Shop || null,
      voucher: {
        id: voucher.id,
        voucher_number: voucher.voucher_number,
        voucher_type: voucher.voucher_type,
        voucher_date: voucher.voucher_date,
        narration: voucher.narration,
        created_by: voucher.Creator?.name || null,
      },
      lines: entries.map(e => ({
        account_code: e.ChartOfAccount?.account_code,
        account_name: e.ChartOfAccount?.account_name,
        debit: parseFloat(e.debit || 0),
        credit: parseFloat(e.credit || 0),
      })),
    });
  } catch (error) {
    console.error('getVoucher error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
