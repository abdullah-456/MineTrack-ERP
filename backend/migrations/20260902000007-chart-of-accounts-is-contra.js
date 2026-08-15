'use strict';

/**
 * Marks an account as a CONTRA account — one whose balance is, by design,
 * opposite to the natural balance of its type, and which therefore reduces the
 * section it sits in rather than adding to it. Accumulated Depreciation is the
 * canonical case: an asset-type account that always carries a credit balance.
 *
 * Why a stored flag rather than inferring it from the sign: after
 * naturalAmount() (utils/financialStatements.js) signs every account so its
 * natural balance is positive, a negative figure means only "contrary to the
 * natural balance" — which conflates two completely different things:
 *
 *   • a structural deduction (Accumulated Depreciation, Treasury Stock,
 *     Drawings) — always negative, expected, not a finding; and
 *   • a genuinely abnormal balance (an overdrawn bank account, an accumulated
 *     deficit) — negative because something actually is.
 *
 * A reader must be able to tell those apart at a glance, so statements print
 * the first as a positive figure under a "Less:" label and reserve the negative
 * presentation for the second. The sign alone cannot carry that distinction;
 * only the account's own definition can.
 *
 * Defaults to false, so every existing account keeps its current presentation.
 * Only 04-ACCUM-DEP is backfilled, because it is the sole contra account the
 * system creates for itself (see chartOfAccounts.getOrCreateAccumulatedDepreciationAccount).
 * Any others are shop-specific and get flagged by hand on the account form.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('chart_of_accounts');
    if (!table.is_contra) {
      await queryInterface.addColumn('chart_of_accounts', 'is_contra', {
        type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false,
      });
    }
    await queryInterface.sequelize.query(
      "UPDATE chart_of_accounts SET is_contra = true WHERE account_code = '04-ACCUM-DEP'",
    );
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('chart_of_accounts');
    if (table.is_contra) await queryInterface.removeColumn('chart_of_accounts', 'is_contra');
  },
};
