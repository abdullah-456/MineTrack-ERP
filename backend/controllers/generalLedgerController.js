const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { postVoucher } = require('../utils/postVoucher');
const { ENTITY_TYPES, resolveEntityVoucherIds, listFilterOptions } = require('../utils/ledgerEntityFilter');
const { fundAccountIds } = require('../utils/cashHelpers');
const { resolveListDateRange, applyDateRangeToWhere } = require('../utils/fiscalYear');

// In "All Accounts" view, sales post four GL lines (e.g. Cash, Sales, COGS, Stock).
// Hide the internal COGS ↔ Stock pair so each transaction shows its two main accounts.
// Stock stays visible when it is the primary leg (purchases, opening stock, etc.).
//
// Resolves the account ids to exclude so the filtering can happen in SQL, BEFORE
// the row limit. Applying it in JS afterwards trimmed an already-capped page, so
// the view returned an unpredictable number of rows and silently dropped the
// oldest entries.
// A COGS/Stock pair is "internal" only when BOTH legs are present on the same
// voucher — that is the shape a sale posts. Hiding 07-COGS unconditionally (as
// this did) also swallowed the debit leg of a genuine expense booked to Cost of
// Goods Sold, e.g. one paid from a director's Current account, leaving a fully
// balanced voucher looking one-sided on screen.
async function internalPairAccountIds(shopId) {
  const codes = await db.ChartOfAccount.findAll({
    where: { account_code: { [Op.in]: ['07-COGS', '05-STOCK'] } },
    attributes: ['id', 'account_code'],
    raw: true,
  });
  const byCode = {};
  codes.forEach(c => { byCode[c.account_code] = c.id; });
  if (!byCode['07-COGS'] || !byCode['05-STOCK']) {
    return { cogsId: byCode['07-COGS'] || null, stockId: byCode['05-STOCK'] || null, voucherIds: [] };
  }

  // Vouchers carrying both legs — only these get either leg hidden.
  const paired = await db.GeneralLedger.findAll({
    where: { shop_id: shopId, account_id: { [Op.in]: [byCode['07-COGS'], byCode['05-STOCK']] } },
    attributes: [
      'voucher_id',
      [db.sequelize.fn('COUNT', db.sequelize.fn('DISTINCT', db.sequelize.col('account_id'))), 'legs'],
    ],
    group: ['voucher_id'],
    having: db.sequelize.where(
      db.sequelize.fn('COUNT', db.sequelize.fn('DISTINCT', db.sequelize.col('account_id'))),
      2,
    ),
    raw: true,
  });

  return {
    cogsId: byCode['07-COGS'],
    stockId: byCode['05-STOCK'],
    voucherIds: paired.map(r => r.voucher_id),
  };
}

// ── Capital (cash + bank) timeline ───────────────────────────────────────────
// In the All-Accounts view every row belongs to a different account, so a
// per-account running balance means nothing there — which is why the column sat
// empty. What IS meaningful across mixed accounts is the business's own liquid
// capital: after each posted transaction, how much money is in hand and in the
// banks combined. That figure is shown once per voucher (on its closing row), so
// a two-line entry reads as one movement rather than two half-answers.
//
// The fund accounts come from cashHelpers.fundAccountIds — the single definition
// of what counts as cash and bank — so this column and the dashboard pills
// cannot drift apart. Both count ACTIVE accounts only, so the newest figure here
// equals Cash + Bank on the dashboard.
//
// A consequence worth knowing: deactivating an account removes its money from
// this column for every row, including historical ones. The column answers "what
// is my working capital", not "what did the books say that day" — the balance
// sheet, which counts closed accounts too, is the record for the latter.
//
// Cumulative cash + bank balance after every voucher that moved money, oldest
// first. Vouchers that moved none aren't listed here — capitalAsOf() carries the
// last known figure forward so a credit sale still shows what the till holds.
async function capitalTimeline(shopId) {
  const accountIds = await fundAccountIds(shopId, { activeOnly: true });
  if (!accountIds.length) return [];

  const moves = await db.GeneralLedger.findAll({
    where: { shop_id: shopId, account_id: { [Op.in]: accountIds } },
    attributes: [
      'voucher_id',
      [db.sequelize.fn('MIN', db.sequelize.col('entry_date')), 'entry_date'],
      [db.sequelize.fn('SUM', db.sequelize.literal('debit - credit')), 'delta'],
    ],
    group: ['voucher_id'],
    raw: true,
  });

  // Ordered the same way the ledger is displayed (reversed), so the balance on a
  // row always accounts for exactly the vouchers at or below it on screen.
  moves.sort((a, b) => {
    const byDate = new Date(a.entry_date) - new Date(b.entry_date);
    return byDate !== 0 ? byDate : a.voucher_id - b.voucher_id;
  });

  let running = 0;
  return moves.map(m => {
    running = Math.round((running + parseFloat(m.delta || 0)) * 100) / 100;
    return { voucherId: m.voucher_id, time: new Date(m.entry_date).getTime(), balance: running };
  });
}

// Capital as it stood immediately after the voucher at (time, voucherId).
// Binary search — the timeline is already sorted on that same key.
function capitalAsOf(timeline, time, voucherId) {
  let lo = 0;
  let hi = timeline.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = timeline[mid];
    if (p.time < time || (p.time === time && p.voucherId <= voucherId)) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found === -1 ? 0 : timeline[found].balance;
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
// filtered to one account and/or a date range.
//
// running_balance is computed HERE, not read from the stored column. It used to
// be written at post time seeded from the last-inserted row for the account,
// while this view sorts by entry_date — so one backdated voucher made the column
// meaningless from that point on. It is now derived with a window function
// ordered by entry_date over the account's full history, then presented in the
// account's natural sign so the ledger agrees with the financial statements.
//
// It is also only meaningful for a single account: in the All-Accounts view every
// row belongs to a different account, so a "running balance" column there was
// just each row's own account balance stacked into one column. Without an
// account_id the column carries the shop's capital (cash + bank) instead — see
// capitalTimeline above — stamped once per voucher on its closing row.
exports.listEntries = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const singleAccountId = req.query.account_id ? parseInt(req.query.account_id, 10) : null;
    const where = { shop_id: shopId };
    if (singleAccountId) {
      where.account_id = singleAccountId;
    }
    // An explicit from/to still wins; otherwise the ledger shows the fiscal year
    // being viewed, so a new year starts empty and picking a past year shows
    // exactly that year's postings.
    const range = await resolveListDateRange(req, shopId);
    applyDateRangeToWhere(where, 'entry_date', range);

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
        return res.json({ entries: [], balance_mode: singleAccountId ? 'account' : 'capital' });
      }
      where.voucher_id = { [Op.in]: voucherIdFilter };
    }

    // Exclude the internal COGS ↔ Stock pair in SQL, before the limit, so the
    // page is a full 500 rows of what the user actually asked for.
    if (!singleAccountId && !entityType) {
      const { cogsId, stockId, voucherIds } = await internalPairAccountIds(shopId);
      if (cogsId && stockId && voucherIds.length) {
        // Hide both legs, but only on the vouchers that actually carry the pair.
        // A standalone COGS expense (or a Stock purchase) keeps both of its sides
        // visible, so what is on screen always balances.
        where[Op.and] = [{
          [Op.not]: {
            account_id: { [Op.in]: [cogsId, stockId] },
            voucher_id: { [Op.in]: voucherIds },
          },
        }];
      }
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

    // For a single-account view, derive the running balance across that
    // account's WHOLE history in date order, so the figure shown against a row
    // is correct even when the view is narrowed to a date range.
    let balanceByEntryId = null;
    if (singleAccountId && entries.length) {
      const account = entries[0].ChartOfAccount;
      const creditNormal = ['liability', 'equity', 'income'].includes(account?.account_type);
      const [balanceRows] = await db.sequelize.query(
        `SELECT id,
                SUM(debit - credit) OVER (ORDER BY entry_date, id
                                          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance
           FROM general_ledger
          WHERE shop_id = :shopId AND account_id = :accountId`,
        { replacements: { shopId, accountId: singleAccountId } },
      );
      balanceByEntryId = new Map(
        balanceRows.map(r => [
          r.id,
          // Present in the account's natural sign: a payable or capital account
          // reads positive as it grows, matching the financial statements.
          Math.round((creditNormal ? -parseFloat(r.balance) : parseFloat(r.balance)) * 100) / 100,
        ]),
      );
    }

    // Mixed-account view: one capital figure per voucher, on the last row that
    // voucher has on screen, so the pair of legs closes with a single number.
    let capitalByRowId = null;
    if (!singleAccountId && entries.length) {
      const timeline = await capitalTimeline(shopId);
      const closingRowByVoucher = new Map();
      entries.forEach(e => {
        const current = closingRowByVoucher.get(e.voucher_id);
        if (current === undefined || e.id > current) closingRowByVoucher.set(e.voucher_id, e.id);
      });

      capitalByRowId = new Map();
      entries.forEach(e => {
        if (closingRowByVoucher.get(e.voucher_id) !== e.id) return;
        capitalByRowId.set(
          e.id,
          capitalAsOf(timeline, new Date(e.entry_date).getTime(), e.voucher_id),
        );
      });
    }

    const rows = entries.map(e => ({
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
      ...(balanceByEntryId ? { running_balance: balanceByEntryId.get(e.id) ?? 0 } : {}),
      // Only the closing row of each voucher carries a figure; the rest are left
      // blank on purpose so one transaction reads as one balance.
      ...(capitalByRowId && capitalByRowId.has(e.id) ? { running_balance: capitalByRowId.get(e.id) } : {}),
    }));

    return res.json({
      entries: rows,
      balance_mode: singleAccountId ? 'account' : 'capital',
    });
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

  // branch_id is accepted so manual journals can be attributed to a branch.
  // Without it every manual adjustment was stamped NULL and silently vanished
  // from any branch-filtered report.
  const { date, narration, lines, branch_id } = req.body;
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

    let branchId = branch_id ? parseInt(branch_id, 10) : null;
    if (branchId) {
      const branch = await db.Branch.findOne({ where: { id: branchId, shop_id: shopId }, transaction });
      if (!branch) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Branch not found for this shop' });
      }
    }

    const voucher = await postVoucher(shopId, {
      type: 'journal',
      date: date ? new Date(date) : new Date(),
      narration: narration?.trim() || 'Manual journal entry',
      createdBy: req.user.id,
      branchId,
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
