const db = require('../models');

// Chart-of-accounts codes never change at runtime (seeded once via migration),
// so a simple in-process cache avoids a lookup query per voucher line.
const accountIdCache = new Map();

async function getAccountId(code, transaction) {
  if (accountIdCache.has(code)) return accountIdCache.get(code);
  const account = await db.ChartOfAccount.findOne({ where: { account_code: code }, transaction });
  if (!account) throw new Error(`Chart of accounts code not found: ${code}`);
  accountIdCache.set(code, account.id);
  return account.id;
}

async function generateVoucherNumber(shopId, transaction) {
  const count = await db.Voucher.count({ where: { shop_id: shopId }, transaction });
  return `VCH-${String(count + 1).padStart(5, '0')}`;
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
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Voucher does not balance: debit ${totalDebit} != credit ${totalCredit}`);
  }

  const voucher_number = await generateVoucherNumber(shopId, transaction);
  const voucher = await db.Voucher.create({
    shop_id: shopId,
    branch_id: branchId || null,
    voucher_number,
    voucher_type: type,
    voucher_date: date ? new Date(date) : new Date(),
    narration: narration || null,
    created_by: createdBy,
    status: 'posted',
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

    // running_balance is scoped to THIS shop even though chart_of_accounts
    // rows are shared/global across shops — otherwise different shops' cash
    // would blend into one running number.
    const lastEntry = await db.GeneralLedger.findOne({
      where: { account_id: accountId, shop_id: shopId },
      order: [['id', 'DESC']],
      transaction,
    });
    const previousBalance = parseFloat(lastEntry?.running_balance || 0);
    const runningBalance = round(previousBalance + debit - credit);

    await db.GeneralLedger.create({
      shop_id: shopId,
      account_id: accountId,
      voucher_id: voucher.id,
      entry_date: voucher.voucher_date,
      debit,
      credit,
      running_balance: runningBalance,
    }, { transaction });
  }

  return voucher;
}

module.exports = { postVoucher, getAccountId };
