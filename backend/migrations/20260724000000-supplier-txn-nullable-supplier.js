'use strict';

/**
 * Allow supplier_transactions.supplier_id to be NULL so a stock receipt that is
 * NOT tied to any supplier (a direct cash/bank purchase) can still be recorded
 * here. These rows are what utils/cashHelpers.computeCashFlow reads to deduct a
 * cash purchase from live cash-in-hand; without a home in this table the cash
 * outflow would be invisible to the dashboard's cash balance.
 *
 * SQLite has no ALTER COLUMN — Sequelize's changeColumn rebuilds the table,
 * which trips "FOREIGN KEY constraint failed" while other tables reference it
 * unless foreign_keys enforcement is toggled off for the rebuild (SQLite's own
 * documented recipe, mirrored from 20260713000000-float-quantities.js).
 */

async function tableExists(queryInterface, table) {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

async function tryChangeColumn(queryInterface, table, column, definition) {
  if (!(await tableExists(queryInterface, table))) return;
  try {
    await queryInterface.sequelize.query('PRAGMA foreign_keys = OFF;');
    await queryInterface.changeColumn(table, column, definition);
    console.log(`  ok: ${table}.${column}`);
  } catch (err) {
    console.warn(`  skipped ${table}.${column} (${err.message.split('\n')[0]})`);
  } finally {
    await queryInterface.sequelize.query('PRAGMA foreign_keys = ON;');
  }
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;
    await tryChangeColumn(queryInterface, 'supplier_transactions', 'supplier_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;
    await tryChangeColumn(queryInterface, 'supplier_transactions', 'supplier_id', {
      type: DataTypes.INTEGER,
      allowNull: false,
    });
  },
};
