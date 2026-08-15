'use strict';

/**
 * Migration to add temporary deduction and custom deduction label to payroll.
 *
 * - temp_deduction: one-off deduction amount entered during Give Salary.
 * - temp_deduction_label: optional free-text label (e.g. "Late Fine", "Uniform", "Damage").
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('payroll');

    if (!table.temp_deduction) {
      await queryInterface.addColumn('payroll', 'temp_deduction', {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0.00,
      });
    }

    if (!table.temp_deduction_label) {
      await queryInterface.addColumn('payroll', 'temp_deduction_label', {
        type: Sequelize.STRING(60),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('payroll');
    for (const col of ['temp_deduction', 'temp_deduction_label']) {
      if (table[col]) await queryInterface.removeColumn('payroll', col);
    }
  },
};
