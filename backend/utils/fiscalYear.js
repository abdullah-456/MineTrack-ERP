'use strict';

const db = require('../models');
const { Op } = require('sequelize');
const { toBusinessDate } = require('./transactionDate');

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

// Which calendar day a value falls on — the question every fiscal-year decision
// turns on. Delegates to toBusinessDate so a date typed at 02:00 local isn't
// read back as the previous day in UTC and filed under the wrong year; see the
// comment there for the full story.
function toDateOnly(value) {
  if (!value) return null;
  const d = toBusinessDate(value);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function fiscalYearLabelFromStart(startDateStr) {
  const y1 = parseInt(String(startDateStr).slice(0, 4), 10);
  return `FY ${y1}-${String((y1 + 1) % 100).padStart(2, '0')}`;
}

function computeEndDate(startDateStr, endMonth = 6, endDay = 30) {
  const startYear = parseInt(String(startDateStr).slice(0, 4), 10);
  const endYear = endMonth >= 7 ? startYear : startYear + 1;
  return `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
}

function nextFiscalYearStart(endDateStr) {
  const d = new Date(`${endDateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// The start of the year immediately before the one beginning on startDateStr:
// the same day one year earlier. Derived from the existing start rather than
// from alignStartToJuly1 so a shop with a non-June year end walks back correctly.
function previousFiscalYearStart(startDateStr) {
  const d = new Date(`${startDateStr}T12:00:00.000Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function alignStartToJuly1(dateStr) {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-07-01`;
}

class FiscalYearClosedError extends Error {
  constructor(fyLabel) {
    super(`Fiscal year ${fyLabel} is closed. This record cannot be modified.`);
    this.name = 'FiscalYearClosedError';
    this.statusCode = 403;
    this.fyLabel = fyLabel;
  }
}

async function getShopFyConfig(shopId, transaction) {
  const shop = await db.Shop.findByPk(shopId, {
    attributes: [
      'id', 'current_fiscal_year_id', 'fiscal_year_end_month', 'fiscal_year_end_day', 'books_start_date',
    ],
    transaction,
  });
  if (!shop) throw new Error('Shop not found');
  return shop;
}

async function getCurrentFiscalYear(shopId, transaction) {
  const shop = await getShopFyConfig(shopId, transaction);
  let pointer = null;
  if (shop.current_fiscal_year_id) {
    pointer = await db.FiscalYear.findOne({
      where: { id: shop.current_fiscal_year_id, shop_id: shopId },
      transaction,
    });
  }
  if (!pointer) {
    pointer = await db.FiscalYear.findOne({
      where: { shop_id: shopId, status: 'open' },
      order: [['start_date', 'DESC']],
      transaction,
    });
  }
  if (!pointer) return null;
  return rollCurrentFiscalYearForward(shopId, pointer, transaction);
}

// ── rollCurrentFiscalYearForward ────────────────────────────────────────────
// "Current" is supposed to track the calendar, not wait for the first
// transaction of a new year to notice one has begun. Nothing except closing a
// year ever advances shop.current_fiscal_year_id — not even posting into a
// freshly auto-opened year via ensureFiscalYearCoveringDate — so without this a
// shop that hasn't closed its last year would keep showing that year as
// "current" indefinitely, whether or not anything had been posted since it
// ended. Every read of "current" (the dropdown, the year-end prompt, every
// report/list default) goes through getCurrentFiscalYear, so fixing it here
// fixes all of them at once.
//
// Only ever moves FORWARD: a backdated entry opening an older year, or a race
// with another request, must never make "current" regress.
async function rollCurrentFiscalYearForward(shopId, pointer, transaction) {
  const today = toDateOnly(new Date());
  if (today <= pointer.end_date) return pointer;

  const covering = await ensureFiscalYearCoveringDate(shopId, today, transaction);
  if (covering.start_date <= pointer.start_date) return pointer;

  // The old year is left exactly as it was — still 'open', still able to
  // accept the rest of its own entries. Closing it stays a separate, explicit,
  // permission-gated action; this only changes what counts as "current".
  await db.Shop.update(
    { current_fiscal_year_id: covering.id },
    { where: { id: shopId }, transaction },
  );
  return covering;
}

async function getFiscalYearForDate(shopId, date, transaction) {
  const dateOnly = toDateOnly(date);
  if (!dateOnly) {
    const err = new Error('Invalid date');
    err.statusCode = 400;
    throw err;
  }
  const fy = await db.FiscalYear.findOne({
    where: {
      shop_id: shopId,
      start_date: { [Op.lte]: dateOnly },
      end_date: { [Op.gte]: dateOnly },
    },
    // The unique index only covers (shop_id, start_date), so overlapping ranges
    // are possible from hand-edited data. Ordering makes the winner the latest
    // year containing the date rather than whatever the planner returned first,
    // so the same date never resolves two different ways.
    order: [['start_date', 'DESC']],
    transaction,
  });
  if (!fy) {
    const err = new Error(`No fiscal year covers date ${dateOnly}`);
    err.statusCode = 400;
    throw err;
  }
  return fy;
}

// ── ensureFiscalYearCoveringDate ────────────────────────────────────────────
// Opens whatever fiscal years are needed so `date` falls inside one.
//
// Without this the business freezes every 1 July: postVoucher refuses any date
// no year covers, and the only thing that created the next year was a
// successful year-end close. A shop could not record a single sale until an
// admin closed the prior year — and closing is deliberately not allowed until
// after that year has ended.
//
// Years are created contiguously from the shop's latest one, always 'open'.
// Closing the previous year stays a separate bookkeeping step done later.
//
// It also walks BACKWARDS, so a business moving off manual books can enter its
// history: an entry dated last March opens the years between it and the shop's
// first one. Predecessors are only ever created for periods that have no year at
// all, so they can never overlap or reopen a year someone has closed.
//
// Both walks are bounded. Forwards, parseTransactionDate rejects anything more
// than a day ahead, so at most one successor is created. Backwards, the floor is
// the shop's books_start_date — without which a typo of 2016 for 2026 would
// quietly open ten years of empty books. MAX_YEARS_TO_OPEN is a final backstop
// against an unbounded loop.
const MAX_YEARS_TO_OPEN = 25;

// How far back entries may be dated when a shop has not stated when its books
// begin. Wide enough for a normal migration (a year or two of history), narrow
// enough that a mistyped year — 2016 for 2026 — is caught rather than silently
// opening a decade of empty books. Setting books_start_date overrides it.
const DEFAULT_BACKDATE_YEARS = 5;

function backdateFloor(shop) {
  if (shop.books_start_date) return toDateOnly(shop.books_start_date);
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - DEFAULT_BACKDATE_YEARS);
  return d.toISOString().slice(0, 10);
}

async function ensureFiscalYearCoveringDate(shopId, date, transaction) {
  const dateOnly = toDateOnly(date);
  if (!dateOnly) {
    const err = new Error('Invalid date');
    err.statusCode = 400;
    throw err;
  }

  const covering = await db.FiscalYear.findOne({
    where: {
      shop_id: shopId,
      start_date: { [Op.lte]: dateOnly },
      end_date: { [Op.gte]: dateOnly },
    },
    transaction,
  });
  if (covering) return covering;

  // No years at all — bootstrap from history, then re-check.
  let latest = await db.FiscalYear.findOne({
    where: { shop_id: shopId },
    order: [['start_date', 'DESC']],
    transaction,
  });
  if (!latest) {
    await ensureFiscalYearForShop(shopId, transaction);
    latest = await db.FiscalYear.findOne({
      where: { shop_id: shopId },
      order: [['start_date', 'DESC']],
      transaction,
    });
    if (!latest) throw new Error('Could not establish a fiscal year for this shop');
    if (latest.start_date <= dateOnly && latest.end_date >= dateOnly) return latest;
  }

  const shop = await getShopFyConfig(shopId, transaction);
  const endMonth = shop.fiscal_year_end_month || 6;
  const endDay = shop.fiscal_year_end_day || 30;

  const openYear = async (startDate) => {
    const [fy] = await db.FiscalYear.findOrCreate({
      where: { shop_id: shopId, start_date: startDate },
      defaults: {
        shop_id: shopId,
        label: fiscalYearLabelFromStart(startDate),
        start_date: startDate,
        end_date: computeEndDate(startDate, endMonth, endDay),
        status: 'open',
      },
      transaction,
    });
    return fy;
  };

  const earliest = await db.FiscalYear.findOne({
    where: { shop_id: shopId },
    order: [['start_date', 'ASC']],
    transaction,
  });

  // ── Backwards: entering history ──────────────────────────────────────────
  if (earliest && dateOnly < earliest.start_date) {
    const floor = backdateFloor(shop);
    if (dateOnly < floor) {
      const err = new Error(
        shop.books_start_date
          ? `${dateOnly} is before this shop's books start date (${floor}). `
            + 'Change the books start date in setup if you need to record entries this far back.'
          : `${dateOnly} is more than ${DEFAULT_BACKDATE_YEARS} years back. `
            + 'Set your books start date in setup to record entries this far back.',
      );
      err.statusCode = 400;
      throw err;
    }

    let cursor = earliest;
    for (let i = 0; i < MAX_YEARS_TO_OPEN; i += 1) {
      const created = await openYear(previousFiscalYearStart(cursor.start_date));
      if (created.start_date <= dateOnly && created.end_date >= dateOnly) return created;
      if (created.start_date >= cursor.start_date) break; // no progress — bail out
      cursor = created;
    }

    const err = new Error(`No fiscal year covers date ${dateOnly}`);
    err.statusCode = 400;
    throw err;
  }

  // ── Forwards: the next year begins ───────────────────────────────────────
  let cursor = latest;
  for (let i = 0; i < MAX_YEARS_TO_OPEN; i += 1) {
    const created = await openYear(nextFiscalYearStart(cursor.end_date));
    if (created.start_date <= dateOnly && created.end_date >= dateOnly) return created;
    cursor = created;
  }

  const err = new Error(`No fiscal year covers date ${dateOnly}`);
  err.statusCode = 400;
  throw err;
}

async function assertWritableDate(shopId, date, transaction) {
  // Opening the year on demand keeps trading possible the day after year end.
  await ensureFiscalYearCoveringDate(shopId, date, transaction);
  const fy = await getFiscalYearForDate(shopId, date, transaction);
  if (fy.status === 'closed') {
    throw new FiscalYearClosedError(fy.label);
  }
  return fy;
}

async function defaultDateRangeForCurrentFY(shopId, transaction) {
  const fy = await getCurrentFiscalYear(shopId, transaction);
  if (!fy) return null;
  return { from: fy.start_date, to: fy.end_date, fiscal_year_id: fy.id, label: fy.label };
}

const YEAR_END_PROMPT_DAYS = 30;

function daysUntil(endDateStr, fromDateStr) {
  const end = new Date(`${endDateStr}T12:00:00.000Z`);
  const from = new Date(`${fromDateStr}T12:00:00.000Z`);
  return Math.round((end - from) / (24 * 60 * 60 * 1000));
}

function isYearEndOverdue(fy, today = toDateOnly(new Date())) {
  if (!fy || fy.status !== 'open') return false;
  return today > fy.end_date;
}

function isYearEndApproaching(fy, today = toDateOnly(new Date()), windowDays = YEAR_END_PROMPT_DAYS) {
  if (!fy || fy.status !== 'open') return false;
  if (today > fy.end_date) return false;
  const remaining = daysUntil(fy.end_date, today);
  return remaining >= 0 && remaining <= windowDays;
}

/** Whether the UI should show the year-end close prompt. */
async function getYearEndPromptState(shopId) {
  const today = toDateOnly(new Date());
  const current = await getCurrentFiscalYear(shopId);
  if (!current) {
    return {
      prompt: false,
      overdue: false,
      approaching: false,
      days_until_end: null,
      close_target: null,
    };
  }

  // Any open year whose end date has passed must be closed first.
  const overdueOpen = await db.FiscalYear.findOne({
    where: {
      shop_id: shopId,
      status: 'open',
      end_date: { [Op.lt]: today },
    },
    order: [['end_date', 'ASC']],
  });

  const closeTarget = overdueOpen || current;
  const overdue = Boolean(overdueOpen) || isYearEndOverdue(current, today);
  const approaching = !overdue && isYearEndApproaching(current, today);

  return {
    prompt: overdue || approaching,
    overdue,
    approaching,
    days_until_end: daysUntil(current.end_date, today),
    close_target: closeTarget,
  };
}

async function resolveListDateRange(req, shopId) {
  const explicitFrom = req.query.from;
  const explicitTo = req.query.to;
  if (explicitFrom || explicitTo) {
    return { from: explicitFrom || null, to: explicitTo || null, fiscal_year_id: req.query.fiscal_year_id || null };
  }

  const fyId = req.query.fiscal_year_id ? parseInt(req.query.fiscal_year_id, 10) : null;
  if (fyId) {
    const fy = await db.FiscalYear.findOne({ where: { id: fyId, shop_id: shopId } });
    if (fy) return { from: fy.start_date, to: fy.end_date, fiscal_year_id: fy.id, label: fy.label, status: fy.status };
  }

  const current = await defaultDateRangeForCurrentFY(shopId);
  if (current) return { ...current, status: 'open' };
  return { from: null, to: null, fiscal_year_id: null };
}

async function ensureFiscalYearForShop(shopId, transaction) {
  const shop = await db.Shop.findByPk(shopId, { transaction });

  const existing = await db.FiscalYear.findOne({
    where: { shop_id: shopId },
    order: [['start_date', 'DESC']],
    transaction,
  });
  if (existing) {
    // Self-heal: the bootstrap migration failed to stamp this column (it
    // mis-destructured INSERT … RETURNING), leaving every shop with a NULL
    // current year. Returning early without repairing it left the column dead
    // forever, since a fiscal year always existed by then.
    if (shop && !shop.current_fiscal_year_id) {
      const openest = await db.FiscalYear.findOne({
        where: { shop_id: shopId, status: 'open' },
        order: [['start_date', 'DESC']],
        transaction,
      });
      if (openest) await shop.update({ current_fiscal_year_id: openest.id }, { transaction });
    }
    return existing;
  }

  // Dialect-neutral: the raw `MIN(entry_date)::date` cast this used is Postgres
  // syntax and threw on the SQLite dev path the config still supports.
  const glMin = await db.GeneralLedger.min('entry_date', {
    where: { shop_id: shopId },
    transaction,
  });
  const anchor = glMin
    ? toDateOnly(glMin)
    : toDateOnly(shop?.created_at) || toDateOnly(new Date());
  const startDate = alignStartToJuly1(anchor);
  const endMonth = shop?.fiscal_year_end_month || 6;
  const endDay = shop?.fiscal_year_end_day || 30;
  const endDate = computeEndDate(startDate, endMonth, endDay);

  const fy = await db.FiscalYear.create({
    shop_id: shopId,
    label: fiscalYearLabelFromStart(startDate),
    start_date: startDate,
    end_date: endDate,
    status: 'open',
  }, { transaction });

  await shop.update({ current_fiscal_year_id: fy.id }, { transaction });
  return fy;
}

// UTC on both bounds, matching buildEntryDateFilter in financialStatements.js.
// The end bound used to be built without the trailing Z, so it was parsed in the
// server's local zone — a row timestamped near midnight fell inside the range on
// one code path and outside it on the other.
function applyDateRangeToWhere(where, dateField, range) {
  if (!range?.from && !range?.to) return where;
  where[dateField] = {};
  if (range.from) where[dateField][Op.gte] = new Date(`${range.from}T00:00:00.000Z`);
  if (range.to) where[dateField][Op.lte] = new Date(`${range.to}T23:59:59.999Z`);
  return where;
}

// ── sliceHistoryToRange ─────────────────────────────────────────────────────
// Narrows an entity ledger to one fiscal year without losing where the balance
// stood when that year began.
//
// The running balance is computed by replaying the WHOLE history first — never
// by summing only the rows in range. Some ledgers are path-dependent (the
// supplier ledger clamps at zero on every payment, see supplierLedgerController)
// so a balance can't be reconstructed from a subset of the rows. Replaying and
// then slicing keeps each controller's own rules intact and needs no second
// definition of how a balance accumulates.
//
// `historyAsc` must be oldest-first with the balance fields already attached.
// Returns the carried-in position plus the rows inside the range.
function sliceHistoryToRange(historyAsc, range, { balanceKeys = ['running_balance'] } = {}) {
  if (!range?.from && !range?.to) return { opening: null, rows: historyAsc };

  const fromMs = range.from ? new Date(`${range.from}T00:00:00.000Z`).getTime() : null;
  const toMs = range.to ? new Date(`${range.to}T23:59:59.999Z`).getTime() : null;

  let opening = null;
  const rows = [];
  for (const row of historyAsc) {
    const ms = new Date(row.date).getTime();
    if (fromMs !== null && ms < fromMs) {
      opening = {};
      balanceKeys.forEach(k => { opening[k] = row[k]; });
      continue;
    }
    if (toMs !== null && ms > toMs) continue;
    rows.push(row);
  }

  // Range starts before the entity's first transaction — it opens at zero, which
  // is still worth stating explicitly rather than leaving the column blank.
  if (fromMs !== null && !opening) {
    opening = {};
    balanceKeys.forEach(k => { opening[k] = 0; });
  }
  return { opening, rows };
}

// The synthetic "Balance Carried Forward" row a year-scoped ledger opens with.
// It has no id and is not a real transaction, so the UI must not offer to edit
// or delete it — `is_opening` marks it.
function openingBalanceRow(opening, date, balanceKeys = ['running_balance']) {
  if (!opening) return null;
  const row = {
    // A stable non-numeric id: the ledger tables key their rows on it, and a
    // null would produce an invalid React key and a `row-null` DOM id. Callers
    // distinguish it from a real opening_balance transaction via `is_opening`.
    id: 'opening',
    date,
    type: 'opening_balance',
    amount: opening[balanceKeys[0]] ?? 0,
    method: null,
    notes: 'Balance carried forward',
    created_by: null,
    is_opening: true,
  };
  balanceKeys.forEach(k => { row[k] = opening[k] ?? 0; });
  return row;
}

function handleFiscalYearError(res, error) {
  if (error.statusCode === 403 || error.name === 'FiscalYearClosedError') {
    return res.status(403).json({ message: error.message, code: 'FISCAL_YEAR_CLOSED' });
  }
  if (error.statusCode === 400) {
    return res.status(400).json({ message: error.message });
  }
  return null;
}

async function guardWritableDates(shopId, dates, transaction) {
  const list = (Array.isArray(dates) ? dates : [dates]).filter(d => d !== undefined && d !== null && d !== '');
  for (const d of list) {
    await assertWritableDate(shopId, d, transaction);
  }
}

module.exports = {
  round2,
  toDateOnly,
  fiscalYearLabelFromStart,
  computeEndDate,
  nextFiscalYearStart,
  previousFiscalYearStart,
  alignStartToJuly1,
  FiscalYearClosedError,
  getCurrentFiscalYear,
  getFiscalYearForDate,
  ensureFiscalYearCoveringDate,
  assertWritableDate,
  guardWritableDates,
  defaultDateRangeForCurrentFY,
  isYearEndOverdue,
  isYearEndApproaching,
  getYearEndPromptState,
  YEAR_END_PROMPT_DAYS,
  daysUntil,
  resolveListDateRange,
  ensureFiscalYearForShop,
  applyDateRangeToWhere,
  sliceHistoryToRange,
  openingBalanceRow,
  handleFiscalYearError,
};
