'use strict';

/**
 * System-wide audit log. The `audit_logs` table already existed from the
 * original scaffold (id, user_id, action, entity_type, entity_id, details,
 * ip_address, table_affected, record_id, old_value, new_value) but was never
 * wired up. This migration only ADDS the columns needed for an automatic,
 * request-level audit trail (see middleware/auditLog.js): every authenticated
 * mutating request (POST/PUT/PATCH/DELETE) is logged without per-controller
 * instrumentation. GET requests are deliberately not logged — an audit trail
 * tracks changes, not reads.
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

    if (!(await tableExists(queryInterface, 'audit_logs'))) {
      const now = { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };
      await queryInterface.createTable('audit_logs', {
        id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        user_id:      { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
        action:       { type: DataTypes.STRING, allowNull: false },
        entity_type:  { type: DataTypes.STRING, allowNull: true },
        entity_id:    { type: DataTypes.INTEGER, allowNull: true },
        details:      { type: DataTypes.TEXT, allowNull: true },
        ip_address:   { type: DataTypes.STRING, allowNull: true },
        created_at:   now,
        updated_at:   now,
      });
    }

    await ensureColumn(queryInterface, 'audit_logs', 'shop_id', { type: DataTypes.INTEGER, allowNull: true });
    await ensureColumn(queryInterface, 'audit_logs', 'method', { type: DataTypes.STRING(10), allowNull: true });
    await ensureColumn(queryInterface, 'audit_logs', 'module', { type: DataTypes.STRING(50), allowNull: true });
    await ensureColumn(queryInterface, 'audit_logs', 'path', { type: DataTypes.STRING(255), allowNull: true });
    await ensureColumn(queryInterface, 'audit_logs', 'status_code', { type: DataTypes.INTEGER, allowNull: true });
  },

  down: async (queryInterface) => {
    if (await tableExists(queryInterface, 'audit_logs')) {
      const desc = await queryInterface.describeTable('audit_logs');
      for (const col of ['shop_id', 'method', 'module', 'path', 'status_code']) {
        if (desc[col]) await queryInterface.removeColumn('audit_logs', col);
      }
    }
  },
};
