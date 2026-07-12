'use strict';

/**
 * Employee ledger redesign: advances are now always tied to a specific future
 * salary month (auto-cleared when that month's salary is given) instead of
 * being a generic cash-out. Adds the linkage + clearing-state columns to the
 * existing employee_transactions table (see 20260711000000-supplier-employee-ledger.js).
 */

async function tableExists(queryInterface, table) {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

async function ensureColumn(queryInterface, table, column, definition) {
  if (!(await tableExists(queryInterface, table))) return;
  const desc = await queryInterface.describeTable(table);
  if (!desc[column]) {
    await queryInterface.addColumn(table, column, definition);
  }
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;
    await ensureColumn(queryInterface, 'employee_transactions', 'for_month', { type: DataTypes.STRING(7), allowNull: true });
    await ensureColumn(queryInterface, 'employee_transactions', 'cleared', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
  },

  down: async (queryInterface) => {
    if (await tableExists(queryInterface, 'employee_transactions')) {
      const desc = await queryInterface.describeTable('employee_transactions');
      if (desc.for_month) await queryInterface.removeColumn('employee_transactions', 'for_month');
      if (desc.cleared) await queryInterface.removeColumn('employee_transactions', 'cleared');
    }
  },
};
