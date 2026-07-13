'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDesc = await queryInterface.describeTable('board_members');
    if (!tableDesc.opening_balance) {
      await queryInterface.addColumn('board_members', 'opening_balance', {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0.00,
      });
    }
  },

  down: async (queryInterface) => {
    const tableDesc = await queryInterface.describeTable('board_members');
    if (tableDesc.opening_balance) {
      await queryInterface.removeColumn('board_members', 'opening_balance');
    }
  },
};
