'use strict';

/**
 * Board member (director/investor) money movement: contributions in,
 * withdrawals out, each optionally tied to a specific bank account — mirrors
 * customer_transactions / supplier_transactions / employee_transactions.
 * current_balance on board_members is the running total, same pattern as
 * Customer.current_balance.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;
    const now = { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };

    const boardDesc = await queryInterface.describeTable('board_members');
    if (!boardDesc.current_balance) {
      await queryInterface.addColumn('board_members', 'current_balance', {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0.00,
      });
    }

    const exists = await queryInterface.describeTable('board_member_transactions').catch(() => null);
    if (!exists) {
      await queryInterface.createTable('board_member_transactions', {
        id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        shop_id:         { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' } },
        board_member_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'board_members', key: 'id' } },
        date:            { type: DataTypes.DATE, allowNull: false },
        type:            { type: DataTypes.ENUM('opening_balance', 'contribution', 'withdrawal', 'adjustment'), allowNull: false },
        amount:          { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0.00 },
        method:          { type: DataTypes.ENUM('cash', 'bank'), allowNull: true },
        bank_account_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'bank_accounts', key: 'id' } },
        notes:           { type: DataTypes.TEXT, allowNull: true },
        created_by:      { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
        created_at:      now,
        updated_at:      now,
      });
    }
  },

  down: async (queryInterface) => {
    const exists = await queryInterface.describeTable('board_member_transactions').catch(() => null);
    if (exists) await queryInterface.dropTable('board_member_transactions');

    const boardDesc = await queryInterface.describeTable('board_members');
    if (boardDesc.current_balance) {
      await queryInterface.removeColumn('board_members', 'current_balance');
    }
  },
};
