'use strict';

async function tableExists(queryInterface, table) {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

async function ensureColumn(queryInterface, Sequelize, table, column, definition) {
  if (!(await tableExists(queryInterface, table))) return;
  const desc = await queryInterface.describeTable(table);
  if (!desc[column]) {
    await queryInterface.addColumn(table, column, definition);
  }
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;
    await ensureColumn(queryInterface, Sequelize, 'installment_plans', 'number_of_installments', {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    });
    await ensureColumn(queryInterface, Sequelize, 'installment_plans', 'frequency', {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'monthly'
    });
    await ensureColumn(queryInterface, Sequelize, 'installment_plans', 'markup_rate', {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: 0.00
    });
  },

  down: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.removeColumn('installment_plans', 'number_of_installments');
      await queryInterface.removeColumn('installment_plans', 'frequency');
      await queryInterface.removeColumn('installment_plans', 'markup_rate');
    } catch (e) {
      console.log('Skipping column removal for SQLite rollback');
    }
  }
};
