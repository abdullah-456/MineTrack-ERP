const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { postVoucher } = require('../utils/postVoucher');
const { ENTITY_TYPES, resolveEntityVoucherIds, listFilterOptions } = require('../utils/ledgerEntityFilter');

// In "All Accounts" view, sales post four GL lines (e.g. Cash, Sales, COGS, Stock).
// Hide the internal COGS ↔ Stock pair so each transaction shows its two main accounts.
// Stock stays visible when it is the primary leg (purchases, opening stock, etc.).
function filterMainLedgerRows(rows) {
  const vouchersWithCogs = new Set(
    rows.filter(r => r.account_code === '07-COGS').map(r => r.voucher_id),
  );
  return rows.filter(r => {
    if (r.account_code === '07-COGS') return false;
    if (r.account_code === '05-STOCK' && vouchersWithCogs.has(r.voucher_id)) return false;
    return true;
  });
}

// ── GET /accounting/chart-of-accounts ────────────────────────────────────────
// System accounts (shop_id NULL) are shared by every shop; custom accounts a
// shop created for itself (shop_id set) are only visible to that shop. Either
// way, each account's displayed balance is computed from THIS shop's
// GeneralLedger rows only, via the same shop_id column postVoucher stamps
// every entry with.
exports.listChartOfAccounts = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const accounts = await db.ChartOfAccount.findAll({
      where: { [Op.or]: [{ shop_id: null }, { shop_id: shopId }] },
      order: [['account_code', 'ASC']],
    });

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

    const fundAccounts = await db.BankAccount.findAll({
      where: { shop_id: shopId },
      attributes: ['chart_of_account_id', 'kind', 'bank_name', 'account_number'],
    });
    const fundMap = {};
    fundAccounts.forEach(f => {
      if (f.chart_of_account_id) fundMap[f.chart_of_account_id] = f;
    });

    const flat = accounts.map(a => {
      const fund = fundMap[a.id];
      return {
        id: a.id,
        account_code: a.account_code,
        account_name: a.account_name,
        account_type: a.account_type,
        parent_account_id: a.parent_account_id,
        is_system: a.shop_id === null,
        is_active: a.is_active,
        balance: balanceMap[a.id] || 0,
        fund_kind: fund?.kind || null,
        bank_name: fund?.bank_name || null,
        account_number: fund?.account_number || null,
      };
    });

    return res.json({ accounts: flat });
  } catch (error) {
    console.error('listChartOfAccounts error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /accounting/general-ledger/filter-options ───────────────────────────
exports.getFilterOptions = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const options = await listFilterOptions(shopId);
    return res.json(options);
  } catch (error) {
    console.error('getLedgerFilterOptions error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /accounting/general-ledger?account_id=&from=&to=&entity_type=&entity_id=
// The whole-business ledger: every voucher line posted for this shop, optionally
// filtered to one account and/or a date range. running_balance on each row was
// computed at write time scoped to this shop (see utils/postVoucher.js), so no
// recomputation is needed here even when a date range narrows the view.
exports.listEntries = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.account_id) {
      where.account_id = parseInt(req.query.account_id, 10);
    }
    if (req.query.from || req.query.to) {
      where.entry_date = {};
      if (req.query.from) where.entry_date[Op.gte] = new Date(req.query.from);
      if (req.query.to) where.entry_date[Op.lte] = new Date(`${req.query.to}T23:59:59.999Z`);
    }

    const entityType = req.query.entity_type || null;
    const entityId = req.query.entity_id ? parseInt(req.query.entity_id, 10) : null;
    const branchId = req.query.branch_id ? parseInt(req.query.branch_id, 10) : null;

    let voucherIdFilter = null;
    if (entityType && ENTITY_TYPES.includes(entityType)) {
      voucherIdFilter = await resolveEntityVoucherIds(shopId, entityType, entityId);
    }
    if (branchId) {
      const branchVouchers = await db.Voucher.findAll({
        where: { shop_id: shopId, branch_id: branchId },
        attributes: ['id'],
        raw: true,
      });
      const branchVoucherIds = branchVouchers.map(v => v.id);
      voucherIdFilter = voucherIdFilter
        ? voucherIdFilter.filter(id => branchVoucherIds.includes(id))
        : branchVoucherIds;
    }
    if (voucherIdFilter !== null) {
      if (!voucherIdFilter.length) {
        return res.json({ entries: [] });
      }
      where.voucher_id = { [Op.in]: voucherIdFilter };
    }

    const entries = await db.GeneralLedger.findAll({
      where,
      include: [
        { model: db.ChartOfAccount, attributes: ['id', 'account_code', 'account_name', 'account_type'] },
        { model: db.Voucher, attributes: ['id', 'voucher_number', 'voucher_type', 'narration'] },
      ],
      order: [['entry_date', 'DESC'], ['voucher_id', 'DESC'], ['id', 'ASC']],
      limit: 500,
    });

    let rows = entries.map(e => ({
      id: e.id,
      voucher_id: e.voucher_id,
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

    if (!req.query.account_id && !entityType) {
      rows = filterMainLedgerRows(rows);
    }

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

// ── POST /accounting/journal-entries ─────────────────────────────────────────
// Manual double-entry posting against ANY active account, of any type — the
// mechanism that makes a manually-created account (a fixed asset, a loan
// payable, an equity adjustment...) usable even though nothing in the app
// automatically posts to it. Every automatic flow (sales, expenses, payments)
// already goes through postVoucher; this is the same engine, driven directly
// by the user instead of by a business action.
exports.createJournalEntry = async (req, res) => {
  const shopId = requireShopId(req, res);
  if (!shopId) return;

  const { date, narration, lines } = req.body;
  if (!Array.isArray(lines) || lines.length < 2) {
    return res.status(400).json({ message: 'At least two lines are required' });
  }

  const round = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
  for (const line of lines) {
    const debit = round(line.debit);
    const credit = round(line.credit);
    if (!line.account_id) return res.status(400).json({ message: 'Every line needs an account' });
    if (debit > 0 && credit > 0) return res.status(400).json({ message: 'A line cannot have both a debit and a credit' });
    if (debit <= 0 && credit <= 0) return res.status(400).json({ message: 'Every line needs a debit or a credit amount greater than 0' });
  }
  const totalDebit = round(lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0));
  const totalCredit = round(lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return res.status(400).json({ message: `Entry does not balance: debit ${totalDebit} vs credit ${totalCredit}` });
  }

  const transaction = await db.sequelize.transaction();
  try {
    const accountIds = lines.map(l => l.account_id);
    const accounts = await db.ChartOfAccount.findAll({
      where: { id: { [Op.in]: accountIds }, is_active: true, [Op.or]: [{ shop_id: null }, { shop_id: shopId }] },
      transaction,
    });
    const accountMap = new Map(accounts.map(a => [a.id, a]));
    for (const id of accountIds) {
      if (!accountMap.has(id)) {
        await transaction.rollback();
        return res.status(400).json({ message: 'One or more accounts are invalid or inactive' });
      }
    }

    const voucher = await postVoucher(shopId, {
      type: 'journal',
      date: date ? new Date(date) : new Date(),
      narration: narration?.trim() || 'Manual journal entry',
      createdBy: req.user.id,
      lines: lines.map(l => ({
        accountCode: accountMap.get(l.account_id).account_code,
        debit: round(l.debit),
        credit: round(l.credit),
      })),
    }, transaction);

    await transaction.commit();
    return res.status(201).json({ voucher });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('createJournalEntry error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};
