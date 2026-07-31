'use strict';

/**
 * Guard for client-supplied transaction dates.
 *
 * Every money-moving endpoint accepted whatever `date` the request carried, with
 * no bounds at all. A typo or a bad client clock could post a sale, payment or
 * payroll run years into the future, where it silently skews every "as of"
 * balance and period report while being invisible in the current month's view.
 *
 * Backdating stays allowed on purpose — recording something that genuinely
 * happened last week is normal bookkeeping, and there is no period-close in the
 * system to protect. Only the future is rejected.
 *
 * A day of slack absorbs client/server clock skew and timezone differences, so
 * a user in a timezone ahead of the server is never blocked from recording
 * today's work.
 */

const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

// ── toBusinessDate ──────────────────────────────────────────────────────────
// A transaction's date is a calendar day, not an instant. Which day a sale
// belongs to is a business fact — it decides the fiscal year, the period a
// report covers, and where the entry sorts in a ledger — and it must not depend
// on the server's clock offset.
//
// The database runs UTC while shops run UTC+5, and the old code fed a raw
// `datetime-local` string straight into `new Date()`. Anything entered between
// midnight and 05:00 local therefore resolved to the PREVIOUS day once read back
// in UTC, so a sale at 02:00 on 1 July was filed under the fiscal year that had
// just ended.
//
// Fixed by taking the calendar day the user actually typed — from LOCAL
// components — and anchoring it at midday UTC. Midday leaves a 12-hour margin on
// both sides, so no timezone on earth can shift the day. The same trick is
// already used by alignStartToJuly1 and nextFiscalYearStart in utils/fiscalYear.js.
function toBusinessDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), 12));
  }

  const str = String(value ?? '').trim();
  if (!str) return null;

  // A plain YYYY-MM-DD is already a calendar day — never let Date() reinterpret
  // it through a timezone.
  const dateOnly = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12));
  }

  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12));
}

function parseTransactionDate(value, fieldName = 'date') {
  if (value === undefined || value === null || value === '') return toBusinessDate(new Date());

  const parsed = toBusinessDate(value);
  if (!parsed) {
    const err = new Error(`${fieldName} is not a valid date`);
    err.statusCode = 400;
    throw err;
  }

  if (parsed.getTime() > Date.now() + MAX_FUTURE_SKEW_MS) {
    const err = new Error(`${fieldName} cannot be in the future`);
    err.statusCode = 400;
    throw err;
  }

  return parsed;
}

module.exports = { parseTransactionDate, toBusinessDate, MAX_FUTURE_SKEW_MS };
