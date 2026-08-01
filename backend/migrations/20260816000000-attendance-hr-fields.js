'use strict';

/**
 * The `attendance` table has existed since the original schema but was never
 * wired to anything — no controller, no routes, no UI. This migration extends
 * it to be actually usable:
 *
 *   - shop_id, branch_id: denormalized from the employee, same precedent as
 *     EmployeeTransaction.shop_id — avoids joining Employee on every roster
 *     query and lets the day/month grid queries be scoped directly.
 *   - notes: optional free-text reason (e.g. "half day", "family emergency").
 *   - marked_by: who recorded it, for audit.
 *   - a UNIQUE index on (employee_id, date): attendance marking is an upsert,
 *     one record per employee per day. Without this, marking the same
 *     employee twice for the same day would silently create a duplicate row
 *     and any daily/monthly summary would double-count them.
 */

async function tableExists(queryInterface, table) {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;
    if (!(await tableExists(queryInterface, 'attendance'))) return;
    const desc = await queryInterface.describeTable('attendance');

    if (!desc.shop_id) {
      await queryInterface.addColumn('attendance', 'shop_id', {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'shops', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      });
    }
    if (!desc.branch_id) {
      await queryInterface.addColumn('attendance', 'branch_id', {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
    if (!desc.notes) {
      await queryInterface.addColumn('attendance', 'notes', {
        type: DataTypes.TEXT,
        allowNull: true,
      });
    }
    if (!desc.marked_by) {
      await queryInterface.addColumn('attendance', 'marked_by', {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }

    // shop_id/branch_id are nullable at the column level (existing rows, if
    // any, predate this migration and have no shop to backfill from without
    // guessing) but every new row the controller writes always sets them —
    // the app-level contract is "required going forward".

    const existingIndexes = await queryInterface.showIndex('attendance');
    if (!existingIndexes.some(i => i.name === 'attendance_employee_date_unique')) {
      await queryInterface.addIndex('attendance', ['employee_id', 'date'], {
        unique: true,
        name: 'attendance_employee_date_unique',
      });
    }
    if (!existingIndexes.some(i => i.name === 'attendance_shop_date_idx')) {
      await queryInterface.addIndex('attendance', ['shop_id', 'date'], {
        name: 'attendance_shop_date_idx',
      });
    }
    if (!existingIndexes.some(i => i.name === 'attendance_branch_date_idx')) {
      await queryInterface.addIndex('attendance', ['branch_id', 'date'], {
        name: 'attendance_branch_date_idx',
      });
    }
  },

  down: async (queryInterface) => {
    if (!(await tableExists(queryInterface, 'attendance'))) return;
    const existingIndexes = await queryInterface.showIndex('attendance').catch(() => []);
    for (const name of ['attendance_employee_date_unique', 'attendance_shop_date_idx', 'attendance_branch_date_idx']) {
      if (existingIndexes.some(i => i.name === name)) {
        await queryInterface.removeIndex('attendance', name);
      }
    }
    const desc = await queryInterface.describeTable('attendance');
    for (const col of ['marked_by', 'notes', 'branch_id', 'shop_id']) {
      if (desc[col]) await queryInterface.removeColumn('attendance', col);
    }
  },
};
