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
    // Free-text note/description entered by the cashier when making a sale.
    await ensureColumn(queryInterface, Sequelize, 'sales', 'description', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.removeColumn('sales', 'description');
    } catch (e) {
      console.log('Skipping column removal for SQLite rollback');
    }
  }
};
