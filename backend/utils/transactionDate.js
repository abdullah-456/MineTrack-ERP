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

function parseTransactionDate(value, fieldName = 'date') {
  if (value === undefined || value === null || value === '') return new Date();

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
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

module.exports = { parseTransactionDate, MAX_FUTURE_SKEW_MS };
