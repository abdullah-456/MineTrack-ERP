'use strict';

/**
 * Persist the personal/company split on board_member_transactions.
 *
 * transferToCapital and postPayFromBodCurrent both divide an amount between a
 * company portion (settling Due-from — money the director was holding for the
 * business) and a personal portion (the director's own money, which raises
 * their Investment). Only a coarse `fund_origin` label was stored, so the
 * ledger had to guess the split back out — and guessed wrong:
 *
 *   boardMemberLedgerController.js: `if (t.fund_origin === 'personal')`
 *
 * while its own comment says "personal/mixed". For a `mixed` transfer the
 * personal portion was therefore counted as zero, so the running investment
 * shown per row never reconciled with the member's actual investment_balance,
 * which had been incremented correctly at post time.
 *
 * Storing the two amounts removes the guess entirely.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;
    const desc = await queryInterface.describeTable('board_member_transactions');

    if (!desc.personal_amount) {
      await queryInterface.addColumn('board_member_transactions', 'personal_amount', {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0.00,
      });
    }
    if (!desc.company_amount) {
      await queryInterface.addColumn('board_member_transactions', 'company_amount', {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0.00,
      });
    }

    // Backfill the two unambiguous cases. 'mixed' rows cannot be reconstructed
    // — the split was never recorded — so they are left at 0/0 and simply stop
    // contributing a guessed figure.
    await queryInterface.sequelize.query(`
      UPDATE board_member_transactions
         SET personal_amount = CASE WHEN fund_origin = 'personal' THEN amount ELSE 0 END,
             company_amount  = CASE WHEN fund_origin = 'company'  THEN amount ELSE 0 END
       WHERE fund_origin IN ('personal', 'company')
         AND personal_amount = 0
         AND company_amount = 0
    `);
  },

  down: async (queryInterface) => {
    const desc = await queryInterface.describeTable('board_member_transactions');
    if (desc.personal_amount) await queryInterface.removeColumn('board_member_transactions', 'personal_amount');
    if (desc.company_amount) await queryInterface.removeColumn('board_member_transactions', 'company_amount');
  },
};
