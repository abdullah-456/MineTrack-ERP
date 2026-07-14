'use strict';

/**
 * Widen shops.logo_url from VARCHAR(255) to MEDIUMTEXT so a company logo can be
 * stored as a base64 data URL (used on every report / invoice letterhead).
 *
 * Follows the SQLite-safe changeColumn recipe used across this project's
 * migrations (see 20260724000000-supplier-txn-nullable-supplier.js): SQLite has
 * no ALTER COLUMN, so Sequelize rebuilds the table and foreign-key enforcement
 * is toggled off around the rebuild. On SQLite every TEXT flavour is unlimited,
 * so the size hint is a no-op there and simply maps to MEDIUMTEXT on MySQL.
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
    await tryChangeColumn(queryInterface, 'shops', 'logo_url', {
      type: DataTypes.TEXT('medium'),
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;
    await tryChangeColumn(queryInterface, 'shops', 'logo_url', {
      type: DataTypes.STRING,
      allowNull: true,
    });
  },
};
