'use strict';

/**
 * Payslips need to itemize the advance-clearing portion of a salary's
 * deductions separately from manual deductions (see Payroll.jsx's give-salary
 * preview, which already splits "Manual Deductions" vs "Advance Deduction").
 * Until now that split only lived in giveSalary()'s in-memory calculation —
 * Payroll.deductions stored just the combined total, so the payslip itself
 * couldn't show an "Advance" line. This column persists the advance portion
 * so `deductions - advance_deduction` recovers the manual-only amount.
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
    if (!(await tableExists(queryInterface, 'payroll'))) return;
    const desc = await queryInterface.describeTable('payroll');
    if (desc.advance_deduction) return;
    await queryInterface.addColumn('payroll', 'advance_deduction', {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    });
  },

  down: async (queryInterface) => {
    if (!(await tableExists(queryInterface, 'payroll'))) return;
    const desc = await queryInterface.describeTable('payroll');
    if (!desc.advance_deduction) return;
    await queryInterface.removeColumn('payroll', 'advance_deduction');
  },
};
