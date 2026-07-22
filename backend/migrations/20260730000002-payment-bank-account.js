'use strict';

/**
 * Records which specific bank account a sale payment went into (audit trail /
 * future per-account reporting) — payments themselves are never reversed in
 * place (a return/refund is a separate SaleReturn transaction), so unlike
 * Expense this is not needed for correctness, just visibility.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('payments');
    if (!desc.bank_account_id) {
      await queryInterface.addColumn('payments', 'bank_account_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'bank_accounts', key: 'id' },
      });
    }
  },

  down: async (queryInterface) => {
    const desc = await queryInterface.describeTable('payments');
    if (desc.bank_account_id) {
      await queryInterface.removeColumn('payments', 'bank_account_id');
    }
  },
};
