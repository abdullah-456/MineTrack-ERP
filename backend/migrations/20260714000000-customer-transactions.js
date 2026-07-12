'use strict';

/**
 * Customer Ledger: adds a customer_transactions table mirroring the
 * supplier_transactions / employee_transactions pattern (see
 * 20260711000000-supplier-employee-ledger.js) so every flow that touches
 * Customer.current_balance (credit sales, installment charges, payments,
 * return credits) also leaves an auditable, running-balance-friendly trail.
 */

async function tableExists(queryInterface, table) {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;
    const now = { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };

    if (!(await tableExists(queryInterface, 'customer_transactions'))) {
      await queryInterface.createTable('customer_transactions', {
        id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        shop_id:         { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' } },
        customer_id:     { type: DataTypes.INTEGER, allowNull: false, references: { model: 'customers', key: 'id' }, onDelete: 'CASCADE' },
        date:            { type: DataTypes.DATE, allowNull: false },
        type:            { type: DataTypes.ENUM('sale_charge', 'installment_charge', 'payment_received', 'return_credit', 'opening_balance', 'adjustment'), allowNull: false },
        amount:          { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        method:          { type: DataTypes.ENUM('cash', 'bank', 'card', 'mobile_wallet', 'store_credit'), allowNull: true },
        related_sale_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'sales', key: 'id' } },
        notes:           { type: DataTypes.TEXT, allowNull: true },
        created_by:      { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
        created_at:      now,
        updated_at:      now,
      });
      await queryInterface.addIndex('customer_transactions', ['customer_id', 'date']);
    }
  },

  down: async (queryInterface) => {
    if (await tableExists(queryInterface, 'customer_transactions')) {
      await queryInterface.dropTable('customer_transactions');
    }
  },
};
