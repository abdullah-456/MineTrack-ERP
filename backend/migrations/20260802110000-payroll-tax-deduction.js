'use strict';

/** Store tax deduction as a percentage of gross (basic + bonus) and the computed amount. */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('payroll');
    if (!desc.tax_deduction_percent) {
      await queryInterface.addColumn('payroll', 'tax_deduction_percent', {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (!desc.tax_deduction) {
      await queryInterface.addColumn('payroll', 'tax_deduction', {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }

    // Legacy rows: manual portion was deductions − advance_deduction.
    await queryInterface.sequelize.query(`
      UPDATE payroll
      SET tax_deduction = CASE
        WHEN (COALESCE(deductions, 0) - COALESCE(advance_deduction, 0)) > 0
        THEN (COALESCE(deductions, 0) - COALESCE(advance_deduction, 0))
        ELSE 0
      END
      WHERE tax_deduction = 0
        AND (COALESCE(deductions, 0) - COALESCE(advance_deduction, 0)) > 0
    `);
  },

  down: async (queryInterface) => {
    const desc = await queryInterface.describeTable('payroll');
    if (desc.tax_deduction) await queryInterface.removeColumn('payroll', 'tax_deduction');
    if (desc.tax_deduction_percent) await queryInterface.removeColumn('payroll', 'tax_deduction_percent');
  },
};
