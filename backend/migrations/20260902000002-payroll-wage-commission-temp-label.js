'use strict';

/**
 * Payroll row snapshots for the three new pay components.
 *
 * Every figure here is COPIED onto the payroll row at the time of the run
 * rather than re-derived later from the employee/truck-loading tables — same
 * reasoning as basic_salary and allowances_total already on this table. An
 * employee moved from daily wage to salary, or a mine's commission rate edited
 * next month, must never rewrite what a past payslip says was paid.
 *
 * - employment_type / wage_days_paid / daily_wage_rate: what the base pay was
 *   made of for a daily-wage employee (N days × rate). Null/0 for salaried runs.
 * - commission / commission_note: the truck-loading commission folded into
 *   gross pay, plus the human-readable "N trucks @ Rs X on <mine>" breakdown
 *   it came from, so the payslip can explain the figure without re-querying.
 * - temp_allowance_label: optional free-text name for the one-off allowance
 *   ("Eid Bonus", "Travel Reimbursement"). Only ever stored when
 *   temp_allowance > 0.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('payroll');

    if (!table.employment_type) {
      await queryInterface.addColumn('payroll', 'employment_type', {
        type: Sequelize.STRING(20), allowNull: false, defaultValue: 'salary',
      });
    }
    if (!table.wage_days_paid) {
      await queryInterface.addColumn('payroll', 'wage_days_paid', {
        type: Sequelize.DECIMAL(6, 2), allowNull: false, defaultValue: 0,
      });
    }
    if (!table.daily_wage_rate) {
      await queryInterface.addColumn('payroll', 'daily_wage_rate', {
        type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0,
      });
    }
    if (!table.commission) {
      await queryInterface.addColumn('payroll', 'commission', {
        type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0,
      });
    }
    if (!table.commission_note) {
      await queryInterface.addColumn('payroll', 'commission_note', {
        type: Sequelize.STRING(255), allowNull: true,
      });
    }
    if (!table.temp_allowance_label) {
      await queryInterface.addColumn('payroll', 'temp_allowance_label', {
        type: Sequelize.STRING(60), allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('payroll');
    for (const col of [
      'employment_type', 'wage_days_paid', 'daily_wage_rate',
      'commission', 'commission_note', 'temp_allowance_label',
    ]) {
      if (table[col]) await queryInterface.removeColumn('payroll', col);
    }
  },
};
