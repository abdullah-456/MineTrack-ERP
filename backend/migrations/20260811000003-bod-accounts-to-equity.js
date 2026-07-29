'use strict';

/**
 * Reclassify director / investor capital from liability to equity.
 *
 * Every board member's "— Investment" account, and the "Directors & Investors"
 * parent they hang off, were created as `liability` under Current Liabilities.
 * Director capital is owner equity, and because all four financial statements
 * branch on `account_type`, that single wrong value produced four wrong reports:
 *
 *   • Balance Sheet    — capital counted in Total Liabilities, so equity was
 *                        understated and liabilities overstated.
 *   • Cash Flow        — cashFlowCategory() routes anything typed 'liability'
 *                        that is not long-term debt to OPERATING, so capital
 *                        injections and withdrawals were reported as operating
 *                        cash flow instead of financing.
 *   • Equity Statement — buildEquityStatement() only walks equity accounts, so
 *                        director capital never appeared at all.
 *   • Cash dashboards  — equityVoucherIds()/getMoneyFlow() exclude owner-capital
 *                        movements by testing for account_type 'equity', so BOD
 *                        transfers leaked into operational money-flow totals.
 *
 * Account CODES are intentionally left alone. Each member sub-account derives
 * its code from the parent ('03-BOD-01', '03-BOD-02', ...), so renaming the
 * parent would strand the children and cause existing shops to grow a second
 * parent account. The '03' prefix is now only a legacy label.
 *
 * Note the sibling BOD asset accounts — '05-BOD-DUE' (money the company is owed
 * by directors holding its cash) and the '05-BOD-CUR-*' wallets — are correctly
 * typed `asset` already and are deliberately untouched.
 */

module.exports = {
  up: async (queryInterface) => {
    const [capitalRows] = await queryInterface.sequelize.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '01-CAPITAL' LIMIT 1`,
    );
    const capitalId = capitalRows[0]?.id || null;

    // Retype the whole directors tree: the '03-BOD' parent and every
    // '03-BOD-NN' member investment account beneath it.
    const [, retyped] = await queryInterface.sequelize.query(
      `UPDATE chart_of_accounts
          SET account_type = 'equity'
        WHERE account_code LIKE '03-BOD%'
          AND account_type <> 'equity'`,
    );

    // Reparent the directors parent under Capital so the account tree reads
    // correctly and ancestor-code checks (e.g. cashFlowCategory's '01-CAPITAL'
    // financing test) resolve through it.
    if (capitalId) {
      await queryInterface.sequelize.query(
        `UPDATE chart_of_accounts
            SET parent_account_id = :capitalId
          WHERE account_code = '03-BOD'
            AND (parent_account_id IS DISTINCT FROM :capitalId)`,
        { replacements: { capitalId } },
      );
    } else {
      console.warn('  01-CAPITAL not found — directors parent retyped but not reparented');
    }

    console.log(`  reclassified director capital accounts to equity${retyped?.rowCount != null ? ` (${retyped.rowCount} rows)` : ''}`);
  },

  down: async (queryInterface) => {
    const [liabRows] = await queryInterface.sequelize.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '03-CUR-LIAB' LIMIT 1`,
    );
    const curLiabId = liabRows[0]?.id || null;

    await queryInterface.sequelize.query(
      `UPDATE chart_of_accounts SET account_type = 'liability' WHERE account_code LIKE '03-BOD%'`,
    );
    if (curLiabId) {
      await queryInterface.sequelize.query(
        `UPDATE chart_of_accounts SET parent_account_id = :curLiabId WHERE account_code = '03-BOD'`,
        { replacements: { curLiabId } },
      );
    }
  },
};
