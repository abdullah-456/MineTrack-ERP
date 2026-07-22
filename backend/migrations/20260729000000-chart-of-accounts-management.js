'use strict';

/**
 * Makes the Chart of Accounts writable per-shop (not just the seeded global
 * tree): adds shop_id (NULL = system account shared by every shop, set = a
 * custom account a shop created for itself), is_active (deactivate instead of
 * deleting once an account has ledger history), and created_by for audit.
 *
 * Also links board_members to their auto-provisioned ledger sub-account.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;

    const coaDesc = await queryInterface.describeTable('chart_of_accounts');
    if (!coaDesc.shop_id) {
      await queryInterface.addColumn('chart_of_accounts', 'shop_id', {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'shops', key: 'id' },
      });
    }
    if (!coaDesc.is_active) {
      await queryInterface.addColumn('chart_of_accounts', 'is_active', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }
    if (!coaDesc.created_by) {
      await queryInterface.addColumn('chart_of_accounts', 'created_by', {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
      });
    }

    const boardDesc = await queryInterface.describeTable('board_members');
    if (!boardDesc.chart_of_account_id) {
      await queryInterface.addColumn('board_members', 'chart_of_account_id', {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'chart_of_accounts', key: 'id' },
      });
    }
  },

  down: async (queryInterface) => {
    const boardDesc = await queryInterface.describeTable('board_members');
    if (boardDesc.chart_of_account_id) {
      await queryInterface.removeColumn('board_members', 'chart_of_account_id');
    }

    const coaDesc = await queryInterface.describeTable('chart_of_accounts');
    if (coaDesc.created_by) await queryInterface.removeColumn('chart_of_accounts', 'created_by');
    if (coaDesc.is_active) await queryInterface.removeColumn('chart_of_accounts', 'is_active');
    if (coaDesc.shop_id) await queryInterface.removeColumn('chart_of_accounts', 'shop_id');
  },
};
