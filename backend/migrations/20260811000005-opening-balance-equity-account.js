'use strict';

/**
 * Add a dedicated '01-OBE' Opening Balance Equity account.
 *
 * Every opening balance in the system — opening cash, opening bank balances,
 * supplier payables carried in, employee balances carried in, new fund accounts
 * — posted its counter-entry straight to 01-CAPITAL. buildEquityStatement()
 * then reports ANY movement on an equity account as either "Capital
 * contributed" or "Drawings", so migrating a supplier's outstanding payable
 * showed up on the statement of changes in equity as though the owner had
 * injected capital that period. The equity statement was effectively unusable.
 *
 * Separating migration artifacts from real owner activity is the standard
 * treatment (QuickBooks and Xero both ship an Opening Balance Equity account
 * for exactly this). It becomes more important alongside 20260811000003, which
 * moves genuine director capital into equity — without this split the two would
 * land in the same bucket.
 *
 * Created as a system account (shop_id NULL) like 01-CAPITAL, so every shop
 * shares it and utils/postVoucher.js can resolve the code globally.
 *
 * NOTE: this does not rewrite already-posted vouchers. Opening balances
 * recorded before this migration stay on 01-CAPITAL — posted ledger entries
 * should be corrected by an adjusting journal, not edited in place. To move
 * them, post a journal entry (Accounting → Journal Entry) debiting 01-CAPITAL
 * and crediting 01-OBE for the historical opening total.
 */

module.exports = {
  up: async (queryInterface) => {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '01-OBE' LIMIT 1`,
    );
    if (existing.length) return;

    // Top-level on purpose. 01-CAPITAL is created by the seeder, which runs
    // AFTER migrations, so looking it up here would parent this account on an
    // existing database but not on a fresh one. Parentage has no effect on any
    // report (equity accounts are selected by account_type), and a top-level
    // Opening Balance Equity account is the conventional presentation anyway.
    await queryInterface.sequelize.query(
      `INSERT INTO chart_of_accounts
         (account_code, account_name, account_type, parent_account_id, shop_id, is_active, created_at, updated_at)
       VALUES
         ('01-OBE', 'Opening Balance Equity', 'equity', NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    );

    console.log('  created 01-OBE (Opening Balance Equity)');
  },

  down: async (queryInterface) => {
    // Only remove it if nothing was ever posted against it.
    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*)::int AS n
         FROM general_ledger gl
         JOIN chart_of_accounts coa ON coa.id = gl.account_id
        WHERE coa.account_code = '01-OBE'`,
    );
    if (rows[0]?.n > 0) return;
    await queryInterface.sequelize.query(
      `DELETE FROM chart_of_accounts WHERE account_code = '01-OBE'`,
    );
  },
};
