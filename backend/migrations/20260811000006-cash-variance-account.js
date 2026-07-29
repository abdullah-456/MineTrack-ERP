'use strict';

/**
 * Add '07-CASH-VAR' (Cash Over / Short).
 *
 * Recording a cash count adjusted `cash_sessions.opening_cash` and nothing else
 * — an asset changing value with no offsetting entry anywhere, which is the
 * plainest possible violation of double entry. It also silently split the two
 * cash figures the app reports: assertCashAvailable gates every cash payment
 * using the session baseline, while the dashboard shows the general-ledger
 * total, and a correction moved one without the other.
 *
 * A counted discrepancy has to land somewhere. Cash Over / Short is the
 * standard destination: the difference between what the drawer holds and what
 * the books say is a real operating gain or loss.
 */

module.exports = {
  up: async (queryInterface) => {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '07-CASH-VAR' LIMIT 1`,
    );
    if (existing.length) return;

    const [parentRows] = await queryInterface.sequelize.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '07-OPEX' LIMIT 1`,
    );
    const parentId = parentRows[0]?.id || null;

    await queryInterface.sequelize.query(
      `INSERT INTO chart_of_accounts
         (account_code, account_name, account_type, parent_account_id, shop_id, is_active, created_at, updated_at)
       VALUES
         ('07-CASH-VAR', 'Cash Over / Short', 'expense', :parentId, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      { replacements: { parentId } },
    );

    console.log('  created 07-CASH-VAR (Cash Over / Short)');
  },

  down: async (queryInterface) => {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*)::int AS n
         FROM general_ledger gl
         JOIN chart_of_accounts coa ON coa.id = gl.account_id
        WHERE coa.account_code = '07-CASH-VAR'`,
    );
    if (rows[0]?.n > 0) return;
    await queryInterface.sequelize.query(
      `DELETE FROM chart_of_accounts WHERE account_code = '07-CASH-VAR'`,
    );
  },
};
