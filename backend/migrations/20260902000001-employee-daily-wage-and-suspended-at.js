'use strict';

/**
 * Two independent employee-record additions:
 *
 * 1. Daily-wage pay type. An employee is now EITHER salary-based (fixed
 *    monthly basic_salary, the existing behaviour) OR daily-wage-based
 *    (daily_wage × paid days that month). basic_salary therefore becomes
 *    nullable — "exactly one of the two is set" is enforced in
 *    employeeController validation rather than as a DB constraint, so an
 *    existing row that predates this column is never rejected by the database
 *    on an unrelated update.
 *
 * 2. suspended_at — the missing other end of the employment lifecycle.
 *    hire_date and terminated_at were both already recorded; a suspension had
 *    no date at all, so an export could show "suspended" with no way to tell
 *    when. Mirrors terminated_at exactly (stamped on the transition, cleared
 *    when the employee goes back to active).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('employees');

    if (!table.employment_type) {
      await queryInterface.addColumn('employees', 'employment_type', {
        type: Sequelize.STRING(20), allowNull: false, defaultValue: 'salary',
      });
    }
    if (!table.daily_wage) {
      await queryInterface.addColumn('employees', 'daily_wage', {
        type: Sequelize.DECIMAL(15, 2), allowNull: true,
      });
    }
    if (!table.suspended_at) {
      await queryInterface.addColumn('employees', 'suspended_at', {
        type: Sequelize.DATE, allowNull: true,
      });
    }

    // Existing rows all keep their basic_salary — this only stops the column
    // from rejecting daily-wage employees that legitimately have none.
    if (table.basic_salary && table.basic_salary.allowNull === false) {
      await queryInterface.changeColumn('employees', 'basic_salary', {
        type: Sequelize.DECIMAL(15, 2), allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('employees');
    if (table.employment_type) await queryInterface.removeColumn('employees', 'employment_type');
    if (table.daily_wage) await queryInterface.removeColumn('employees', 'daily_wage');
    if (table.suspended_at) await queryInterface.removeColumn('employees', 'suspended_at');

    // Only safe to restore NOT NULL if nothing relies on the nullable form —
    // backfill the daily-wage rows that would otherwise block it.
    await queryInterface.sequelize.query(
      `UPDATE employees SET basic_salary = 0 WHERE basic_salary IS NULL`,
    );
    await queryInterface.changeColumn('employees', 'basic_salary', {
      type: Sequelize.DECIMAL(15, 2), allowNull: false,
    });
  },
};
