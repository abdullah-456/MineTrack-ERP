'use strict';

/**
 * Splits commission into two independent bases — per truck and per ton — and
 * moves the RATE from the mine/month log onto each eligible employee.
 *
 * Why the rate moves: two people working the same mine in the same month can be
 * on different commission terms, which a single log-level rate cannot express.
 * The log keeps `rate` (+ the new `ton_rate`) purely as the mine/month DEFAULT
 * that pre-fills an employee row; the employee's own profile default wins over
 * that, and whatever ends up ON THE ROW is what gets paid.
 *
 * Resolution order when an employee is ticked on a log:
 *   employee profile rate (if set) → log default rate → 0
 * Once written to truck_loading_employees the value is a snapshot: editing the
 * employee's profile or the log default later never rewrites an existing row,
 * and never rewrites a month already paid out.
 *
 * The two are additive when both are enabled: trucks × truck_rate + tons ×
 * ton_rate, over that employee's own credited days (confirmed with the user).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ── Employee-level defaults ──────────────────────────────────────────────
    // The checkbox is a DEFAULT, not a hard gate (confirmed with the user): it
    // decides what gets pre-filled when the employee is added to a log, and the
    // log row can still turn either type on or off for that mine/month.
    const emp = await queryInterface.describeTable('employees');
    if (!emp.commission_per_truck_enabled) {
      await queryInterface.addColumn('employees', 'commission_per_truck_enabled', {
        type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false,
      });
    }
    if (!emp.commission_per_truck) {
      await queryInterface.addColumn('employees', 'commission_per_truck', {
        type: Sequelize.DECIMAL(15, 2), allowNull: true,
      });
    }
    if (!emp.commission_per_ton_enabled) {
      await queryInterface.addColumn('employees', 'commission_per_ton_enabled', {
        type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false,
      });
    }
    if (!emp.commission_per_ton) {
      await queryInterface.addColumn('employees', 'commission_per_ton', {
        type: Sequelize.DECIMAL(15, 2), allowNull: true,
      });
    }

    // ── Tons logged alongside trucks, on the same day row ────────────────────
    // Same row rather than a second table: a day's credited-day tick has to
    // count that day's trucks AND tons together, and splitting them would let
    // the two drift out of sync for the same date.
    const days = await queryInterface.describeTable('truck_loading_days');
    if (!days.tons) {
      await queryInterface.addColumn('truck_loading_days', 'tons', {
        type: Sequelize.DECIMAL(15, 3), allowNull: false, defaultValue: 0,
      });
    }

    // ── Mine/month default for the ton rate, mirroring the existing `rate` ───
    const logs = await queryInterface.describeTable('truck_loading_logs');
    if (!logs.ton_rate) {
      await queryInterface.addColumn('truck_loading_logs', 'ton_rate', {
        type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0,
      });
    }

    // ── Per-employee snapshot of what THEY earn on this log ─────────────────
    const links = await queryInterface.describeTable('truck_loading_employees');
    if (!links.truck_rate_enabled) {
      await queryInterface.addColumn('truck_loading_employees', 'truck_rate_enabled', {
        type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false,
      });
    }
    if (!links.truck_rate) {
      await queryInterface.addColumn('truck_loading_employees', 'truck_rate', {
        type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0,
      });
    }
    if (!links.ton_rate_enabled) {
      await queryInterface.addColumn('truck_loading_employees', 'ton_rate_enabled', {
        type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false,
      });
    }
    if (!links.ton_rate) {
      await queryInterface.addColumn('truck_loading_employees', 'ton_rate', {
        type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0,
      });
    }

    // Rows that predate this migration were all paid on the log's single
    // per-truck rate — carry that onto each row so their commission keeps
    // calculating to exactly what it did before.
    await queryInterface.sequelize.query(`
      UPDATE truck_loading_employees tle
      SET truck_rate = l.rate,
          truck_rate_enabled = (l.rate > 0)
      FROM truck_loading_logs l
      WHERE tle.log_id = l.id
        AND tle.truck_rate = 0
        AND tle.truck_rate_enabled = false
    `);
  },

  async down(queryInterface) {
    const drop = async (table, cols) => {
      const desc = await queryInterface.describeTable(table);
      for (const c of cols) {
        if (desc[c]) await queryInterface.removeColumn(table, c);
      }
    };
    await drop('truck_loading_employees', ['truck_rate_enabled', 'truck_rate', 'ton_rate_enabled', 'ton_rate']);
    await drop('truck_loading_logs', ['ton_rate']);
    await drop('truck_loading_days', ['tons']);
    await drop('employees', [
      'commission_per_truck_enabled', 'commission_per_truck',
      'commission_per_ton_enabled', 'commission_per_ton',
    ]);
  },
};
