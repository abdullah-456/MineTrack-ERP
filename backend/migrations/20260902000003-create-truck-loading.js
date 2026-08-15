'use strict';

/**
 * Truck-loading log — per-mine, per-month record of trucks loaded, the
 * commission rate that applies to that month, and which employees earn
 * commission from it.
 *
 * Three tables rather than one:
 *  - truck_loading_logs      one row per mine per month, carrying THAT month's
 *                            rate. The rate lives here (not on the mine) so
 *                            changing it next month can never rewrite what a
 *                            past month's already-paid commission was worth.
 *  - truck_loading_days      one row per day logged under that log (date +
 *                            truck count). Kept as its own table instead of a
 *                            JSON blob so a day can be indexed, summed in SQL,
 *                            and corrected independently.
 *  - truck_loading_employees one row per employee marked eligible on that log,
 *                            carrying THEIR OWN credited-day list — this is
 *                            what makes partial-month credit (someone who only
 *                            worked part of the month at that mine) possible
 *                            without a second schema change later.
 *
 * credited_days semantics: NULL means "every day logged on this log, including
 * days added after this employee was marked eligible" — the common full-month
 * case, which is why it's the default and needs zero clicks. An explicit array
 * of 'YYYY-MM-DD' strings pins the employee to exactly those days. A stored
 * empty array is therefore meaningfully different from NULL: it credits nothing.
 *
 * Commission is paid in FULL to each eligible employee (confirmed with the
 * user) — it is deliberately NOT split between them, so nothing here needs to
 * know how many people are on the log.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('truck_loading_logs', {
      id:         { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      shop_id:    { type: Sequelize.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' }, onDelete: 'CASCADE' },
      mine_id:    { type: Sequelize.INTEGER, allowNull: false, references: { model: 'branches', key: 'id' }, onDelete: 'CASCADE' },
      month:      { type: Sequelize.STRING(7), allowNull: false }, // 'YYYY-MM'
      rate:       { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      remarks:    { type: Sequelize.TEXT, allowNull: true },
      created_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('truck_loading_logs', ['shop_id']);
    await queryInterface.addIndex('truck_loading_logs', ['month']);
    // One log per mine per month — re-opening the same mine/month must edit the
    // existing log (and its rate), never create a second one that would double
    // every eligible employee's commission.
    await queryInterface.addIndex('truck_loading_logs', ['mine_id', 'month'], {
      unique: true, name: 'truck_loading_logs_mine_month_unique',
    });

    await queryInterface.createTable('truck_loading_days', {
      id:         { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      log_id:     { type: Sequelize.INTEGER, allowNull: false, references: { model: 'truck_loading_logs', key: 'id' }, onDelete: 'CASCADE' },
      date:       { type: Sequelize.DATEONLY, allowNull: false },
      trucks:     { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      remarks:    { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('truck_loading_days', ['log_id', 'date'], {
      unique: true, name: 'truck_loading_days_log_date_unique',
    });

    await queryInterface.createTable('truck_loading_employees', {
      id:            { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      log_id:        { type: Sequelize.INTEGER, allowNull: false, references: { model: 'truck_loading_logs', key: 'id' }, onDelete: 'CASCADE' },
      employee_id:   { type: Sequelize.INTEGER, allowNull: false, references: { model: 'employees', key: 'id' }, onDelete: 'CASCADE' },
      credited_days: { type: Sequelize.JSONB, allowNull: true },
      created_at:    { type: Sequelize.DATE, allowNull: false },
      updated_at:    { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('truck_loading_employees', ['employee_id']);
    await queryInterface.addIndex('truck_loading_employees', ['log_id', 'employee_id'], {
      unique: true, name: 'truck_loading_employees_log_employee_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('truck_loading_employees');
    await queryInterface.dropTable('truck_loading_days');
    await queryInterface.dropTable('truck_loading_logs');
  },
};
