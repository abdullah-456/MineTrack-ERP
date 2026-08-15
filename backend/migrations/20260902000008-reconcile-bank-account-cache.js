'use strict';

/**
 * One-time reconciliation: bank_accounts.current_balance is a hand-maintained
 * cache of the general ledger, updated by cashHelpers.debitBankAccount /
 * creditBankAccount at every known write site. Before this release those
 * functions adjusted the cache RELATIVE to whatever the column already held
 * (`current_balance ± amount`), which trusts the cache to already be correct —
 * an assumption that fails silently the moment any write path posts to the
 * ledger without going through them (a manual journal entry is the one
 * confirmed case). Once that happens, every later ± adjustment compounds the
 * same wrong number forever, with nothing to signal it happened.
 *
 * cashHelpers now re-derives the balance from the ledger on every write
 * instead of trusting the column (see utils/cashHelpers.js), which makes the
 * cache self-healing from here on. This migration corrects the drift that had
 * already accumulated before that fix existed, so bank_accounts.current_balance
 * agrees with the ledger for every account as of this release — found via
 * fundAccounts.test.js, which asserts exactly this invariant.
 */
module.exports = {
  async up(queryInterface) {
    const [accounts] = await queryInterface.sequelize.query(`
      SELECT ba.id, ba.current_balance, ba.chart_of_account_id, ba.shop_id,
             COALESCE(gl.debit_sum, 0) - COALESCE(gl.credit_sum, 0) AS ledger_balance
      FROM bank_accounts ba
      LEFT JOIN (
        SELECT account_id, SUM(debit) AS debit_sum, SUM(credit) AS credit_sum
        FROM general_ledger
        GROUP BY account_id
      ) gl ON gl.account_id = ba.chart_of_account_id
      WHERE ba.is_active = true AND ba.chart_of_account_id IS NOT NULL
    `);

    for (const acct of accounts) {
      const cached = Math.round(parseFloat(acct.current_balance) * 100) / 100;
      const truth = Math.round(parseFloat(acct.ledger_balance) * 100) / 100;
      if (Math.abs(cached - truth) < 0.005) continue;
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(
        'UPDATE bank_accounts SET current_balance = :truth WHERE id = :id',
        { replacements: { truth, id: acct.id } },
      );
      // eslint-disable-next-line no-console
      console.log(`Reconciled bank_accounts #${acct.id} (shop ${acct.shop_id}): ${cached} -> ${truth}`);
    }
  },

  // Not reversible: the pre-migration value was wrong (that is the entire
  // premise of this migration), so there is nothing correct to restore it to.
  async down() {},
};
