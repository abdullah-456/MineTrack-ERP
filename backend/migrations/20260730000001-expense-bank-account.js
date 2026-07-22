'use strict';

/**
 * Expenses can be edited/voided after posting, which reverses the original
 * bank effect before applying a new one (see expenseController.update /
 * performVoidExpense). That reversal needs to know exactly which bank account
 * the money originally came out of — not just "whichever is first active" —
 * so this stores it on the expense row itself.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('expenses');
    if (!desc.bank_account_id) {
      await queryInterface.addColumn('expenses', 'bank_account_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'bank_accounts', key: 'id' },
      });
    }
  },

  down: async (queryInterface) => {
    const desc = await queryInterface.describeTable('expenses');
    if (desc.bank_account_id) {
      await queryInterface.removeColumn('expenses', 'bank_account_id');
    }
  },
};
