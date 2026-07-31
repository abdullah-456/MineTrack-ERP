const db = require('../models');
const { parseTransactionDate } = require('./transactionDate');
const { assertWritableDate } = require('./fiscalYear');

// A voucher is rejected if its debits and credits differ by more than this.
// Shared with the financial statements so a report can never call itself
// balanced by a margin the posting engine would have refused.
const BALANCE_TOLERANCE = 0.01;

// Chart-of-accounts codes are stable at runtime, so a small cache avoids a
// lookup per voucher line. It is NOT populated from inside the caller's
// transaction any more: doing so cached ids read from uncommitted rows, and a
// rollback (or an account deleted and its code later reused, which
// chartOfAccountController.remove permits) left the cache resolving a code to a
// row that no longer exists — silently misposting every later voucher until the
// process restarted. Entries are added only once the id is known to be durable,
// and invalidateAccountCache() lets the chart-of-accounts controller clear
// them on any create/update/delete.
const accountIdCache = new Map();

function invalidateAccountCache(code) {
  if (code) accountIdCache.delete(code);
  else accountIdCache.clear();
}

async function getAccountId(code, transaction) {
  if (accountIdCache.has(code)) return accountIdCache.get(code);
  const account = await db.ChartOfAccount.findOne({ where: { account_code: code }, transaction });
  if (!account) throw new Error(`Chart of accounts code not found: ${code}`);

  // Only cache once the reading transaction has committed. Without a
  // transaction the row is already durable, so cache immediately.
  if (transaction) {
    transaction.afterCommit(() => accountIdCache.set(code, account.id));
  } else {
    accountIdCache.set(code, account.id);
  }
  return account.id;
}

// Draws the next number from this shop's own counter. The previous COUNT(*)+1
// approach produced the same number in two different shops (while the model
// declares voucher_number unique) and handed the same number to two concurrent
// posts in one shop. The upsert below increments under a row lock, so it is
// race-free, and it rolls back with the caller's transaction so no gaps appear.
async function generateVoucherNumber(shopId, transaction) {
  const [rows] = await db.sequelize.query(
    `INSERT INTO voucher_sequences (shop_id, next_number, created_at, updated_at)
     VALUES (:shopId, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (shop_id) DO UPDATE
       SET next_number = voucher_sequences.next_number + 1,
           updated_at  = CURRENT_TIMESTAMP
     RETURNING next_number`,
    { replacements: { shopId }, transaction },
  );

  // The statement returns the counter AFTER incrementing, so the number to use
  // is one below it (a fresh row starts at 2 and issues 1).
  const nextNumber = parseInt(rows[0].next_number, 10) - 1;
  return `VCH-${String(nextNumber).padStart(5, '0')}`;
}

// ── postVoucher ────────────────────────────────────────────────────────────────
// shopId: tenant scope for the voucher + GL running balance.
// { type, date, narration, createdBy, lines }
//   type: 'payment' | 'receipt' | 'journal' | 'contra'
//   lines: [{ accountCode, debit?, credit? }, ...] — sum(debit) must equal sum(credit).
// Must be called inside the caller's existing DB transaction — purely additive,
// never mutates any of the caller's own business rows.
async function postVoucher(shopId, { type, date, narration, createdBy, lines, branchId }, transaction) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('postVoucher requires at least one line');
  }

  const round = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
  const totalDebit = round(lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0));
  const totalCredit = round(lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0));
  if (Math.abs(totalDebit - totalCredit) > BALANCE_TOLERANCE) {
    throw new Error(`Voucher does not balance: debit ${totalDebit} != credit ${totalCredit}`);
  }

  // Validated here rather than at each of the ~25 call sites: every money
  // movement in the system funnels through postVoucher, so guarding it means no
  // future-dated entry can reach the ledger at all. Callers create their own
  // sub-ledger rows inside the same transaction, so a rejection here rolls those
  // back too. Backdating remains allowed — see utils/transactionDate.js.
  const voucherDate = parseTransactionDate(date, 'voucher date');

  // Same reasoning as the date guard above: every posting funnels through here,
  // so one check keeps closed years sealed everywhere. It also opens the next
  // fiscal year on demand, so trading never stops the day after a year ends.
  const fiscalYear = await assertWritableDate(shopId, voucherDate, transaction);

  const voucher_number = await generateVoucherNumber(shopId, transaction);
  const voucher = await db.Voucher.create({
    shop_id: shopId,
    branch_id: branchId || null,
    voucher_number,
    voucher_type: type,
    voucher_date: voucherDate,
    narration: narration || null,
    created_by: createdBy,
    status: 'posted',
    // Stamped from the year the date resolves to, so every voucher is
    // attributable. Only the year-end closing voucher used to carry this.
    fiscal_year_id: fiscalYear?.id || null,
  }, { transaction });

  for (const line of lines) {
    const debit = round(line.debit);
    const credit = round(line.credit);
    if (debit === 0 && credit === 0) continue;

    const accountId = await getAccountId(line.accountCode, transaction);

    await db.VoucherEntry.create({
      voucher_id: voucher.id,
      account_id: accountId,
      debit_amount: debit,
      credit_amount: credit,
    }, { transaction });

    // running_balance is no longer maintained here. It was seeded from the
    // most recently INSERTED row for the account, while the ledger is read
    // ordered by entry_date — so a single backdated voucher made the whole
    // column non-monotonic and wrong from that point on. Reading the previous
    // row without a lock also made two concurrent posts to the same account
    // (05-CASH is touched by nearly every sale and payment) overwrite each
    // other's balance.
    //
    // The ledger now derives it per query with a window function ordered by
    // entry_date — see listEntries in controllers/generalLedgerController.js —
    // which is correct for backdated entries and has no race. The column is
    // kept (written as 0) rather than dropped so historical rows survive.
    await db.GeneralLedger.create({
      shop_id: shopId,
      account_id: accountId,
      voucher_id: voucher.id,
      entry_date: voucher.voucher_date,
      debit,
      credit,
      running_balance: 0,
    }, { transaction });
  }

  return voucher;
}

module.exports = { postVoucher, getAccountId, invalidateAccountCache, BALANCE_TOLERANCE };
