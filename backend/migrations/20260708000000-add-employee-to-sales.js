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
    await ensureColumn(queryInterface, Sequelize, 'sales', 'employee_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'employees', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
  },

  down: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.removeColumn('sales', 'employee_id');
    } catch (e) {
      console.log('Skipping column removal for SQLite rollback');
    }
  }
};
