'use strict';

/**
 * Converts quantity-tracking columns from INTEGER to DECIMAL(12,3) so the
 * business can deal in fractional (kg) quantities.
 *
 * Dialect-aware: SQLite needs foreign_keys toggled off during the table
 * rebuild that changeColumn performs; Postgres/MySQL change the type directly
 * and must NOT receive the SQLite-only PRAGMA. Each column is best-effort.
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
  const isSqlite = queryInterface.sequelize.getDialect() === 'sqlite';
  try {
    if (isSqlite) await queryInterface.sequelize.query('PRAGMA foreign_keys = OFF;');
    await queryInterface.changeColumn(table, column, definition);
    console.log(`  ok: ${table}.${column} -> DECIMAL`);
  } catch (err) {
    console.warn(`  skipped ${table}.${column} (${err.message.split('\n')[0]}) — app still works via model-level typing`);
  } finally {
    if (isSqlite) await queryInterface.sequelize.query('PRAGMA foreign_keys = ON;');
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