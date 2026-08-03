'use strict';

/**
 * Employee compensation gains a recurring "allowances" list (name + amount,
 * same JSONB-array shape as experience/dependants) that tops up basic_salary
 * every month. Give Salary also gains a one-off "temp_allowance" per run.
 * Both are folded into gross pay — see employeeLedgerController.runGiveSalary.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const employees = await queryInterface.describeTable('employees');
    if (!employees.allowances) {
      await queryInterface.addColumn('employees', 'allowances', {
        type: Sequelize.JSONB, allowNull: true, defaultValue: [],
      });
    }

    const payroll = await queryInterface.describeTable('payroll');
    if (!payroll.allowances_total) {
      await queryInterface.addColumn('payroll', 'allowances_total', {
        type: Sequelize.DECIMAL(15, 2), defaultValue: 0.00,
      });
    }
    if (!payroll.temp_allowance) {
      await queryInterface.addColumn('payroll', 'temp_allowance', {
        type: Sequelize.DECIMAL(15, 2), defaultValue: 0.00,
      });
    }
  },

  async down(queryInterface) {
    try { await queryInterface.removeColumn('employees', 'allowances'); } catch (_) { /* */ }
    try { await queryInterface.removeColumn('payroll', 'allowances_total'); } catch (_) { /* */ }
    try { await queryInterface.removeColumn('payroll', 'temp_allowance'); } catch (_) { /* */ }
  },
};
