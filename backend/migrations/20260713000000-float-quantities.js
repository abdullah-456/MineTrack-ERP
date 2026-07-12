'use strict';

/**
 * The business now deals in fractional (kg) quantities, not just whole units.
 * Converts every quantity-tracking column that was INTEGER to DECIMAL(12,3).
 *
 * SQLite has no native ALTER COLUMN TYPE — Sequelize's changeColumn rebuilds
 * the table (create new, copy, drop old, rename), which fails with
 * "FOREIGN KEY constraint failed" if foreign_keys enforcement is on and
 * another table references the one being rebuilt. Toggling the pragma off
 * for the duration of each rebuild avoids that (SQLite's own documented
 * recipe for this exact situation). Each column change is attempted
 * independently and best-effort — SQLite's dynamic typing means the app
 * works correctly even if a particular ALTER can't be applied, since values
 * are read/written according to the Sequelize model's declared type either way.
 */

async function tableExists(queryInterface, table) {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

async function tryChangeColumn(queryInterface, Sequelize, table, column, definition) {
  if (!(await tableExists(queryInterface, table))) return;
  try {
    await queryInterface.sequelize.query('PRAGMA foreign_keys = OFF;');
    await queryInterface.changeColumn(table, column, definition);
    console.log(`  ok: ${table}.${column} -> DECIMAL`);
  } catch (err) {
    console.warn(`  skipped ${table}.${column} (${err.message.split('\n')[0]}) — app still works via model-level typing`);
  } finally {
    await queryInterface.sequelize.query('PRAGMA foreign_keys = ON;');
  }
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;
    const qty = { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 };
    const qtyNullableDefault0 = { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 };

    await tryChangeColumn(queryInterface, Sequelize, 'stock', 'quantity_on_hand', qtyNullableDefault0);
    await tryChangeColumn(queryInterface, Sequelize, 'stock', 'quantity_reserved', qtyNullableDefault0);
    await tryChangeColumn(queryInterface, Sequelize, 'stock_movements', 'quantity', { type: DataTypes.DECIMAL(12, 3), allowNull: false });
    await tryChangeColumn(queryInterface, Sequelize, 'stock_movements', 'balance_after', { type: DataTypes.DECIMAL(12, 3), allowNull: false });
    await tryChangeColumn(queryInterface, Sequelize, 'sale_items', 'quantity', qty);
    await tryChangeColumn(queryInterface, Sequelize, 'sale_return_items', 'quantity', qty);
  },

  down: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;
    await tryChangeColumn(queryInterface, Sequelize, 'stock', 'quantity_on_hand', { type: DataTypes.INTEGER, defaultValue: 0 });
    await tryChangeColumn(queryInterface, Sequelize, 'stock', 'quantity_reserved', { type: DataTypes.INTEGER, defaultValue: 0 });
    await tryChangeColumn(queryInterface, Sequelize, 'stock_movements', 'quantity', { type: DataTypes.INTEGER, allowNull: false });
    await tryChangeColumn(queryInterface, Sequelize, 'stock_movements', 'balance_after', { type: DataTypes.INTEGER, allowNull: false });
    await tryChangeColumn(queryInterface, Sequelize, 'sale_items', 'quantity', { type: DataTypes.INTEGER, allowNull: false });
    await tryChangeColumn(queryInterface, Sequelize, 'sale_return_items', 'quantity', { type: DataTypes.INTEGER, allowNull: false });
  },
};
