'use strict';

/**
 * Links each expense to a real Chart-of-Accounts expense-type account instead
 * of every expense silently posting to one hardcoded '07-OPEX' bucket
 * regardless of its typed-in category. Nullable + defaults to '07-OPEX' at
 * the controller level, so existing rows and any caller that doesn't pass it
 * keep working exactly as before.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('expenses');
    if (!desc.expense_account_id) {
      await queryInterface.addColumn('expenses', 'expense_account_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'chart_of_accounts', key: 'id' },
      });
    }
  },

  down: async (queryInterface) => {
    const desc = await queryInterface.describeTable('expenses');
    if (desc.expense_account_id) {
      await queryInterface.removeColumn('expenses', 'expense_account_id');
    }
  },
};
