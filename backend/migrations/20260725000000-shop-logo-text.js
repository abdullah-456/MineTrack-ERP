'use strict';
async function tableExists(queryInterface, table) {
  try { await queryInterface.describeTable(table); return true; } catch { return false; }
}
async function tryChangeColumn(queryInterface, table, column, definition) {
  if (!(await tableExists(queryInterface, table))) return;
  const isSqlite = queryInterface.sequelize.getDialect() === 'sqlite';
  try {
    if (isSqlite) await queryInterface.sequelize.query('PRAGMA foreign_keys = OFF;');
    await queryInterface.changeColumn(table, column, definition);
    console.log(`  ok: ${table}.${column}`);
  } catch (err) {
    console.warn(`  skipped ${table}.${column} (${err.message.split('\n')[0]})`);
  } finally {
    if (isSqlite) await queryInterface.sequelize.query('PRAGMA foreign_keys = ON;');
  }
}
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;
    await tryChangeColumn(queryInterface, 'shops', 'logo_url', { type: DataTypes.TEXT('medium'), allowNull: true });
  },
  down: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;
    await tryChangeColumn(queryInterface, 'shops', 'logo_url', { type: DataTypes.STRING, allowNull: true });
  },
};
