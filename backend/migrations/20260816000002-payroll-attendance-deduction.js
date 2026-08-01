'use strict';

/**
 * Payslips itemize deductions (see advance_deduction, added in
 * 20260726000000-payroll-advance-deduction.js) — this adds the same treatment
 * for absence-based deductions, so a payslip can show "7 days absent × Rs
 * 967.74/day = Rs 6,774.19" instead of folding it into one opaque number.
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

    if (!desc.attendance_deduction) {
      await queryInterface.addColumn('payroll', 'attendance_deduction', {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (!desc.absent_days) {
      await queryInterface.addColumn('payroll', 'absent_days', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (!desc.leave_days) {
      await queryInterface.addColumn('payroll', 'leave_days', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  down: async (queryInterface) => {
    if (!(await tableExists(queryInterface, 'payroll'))) return;
    const desc = await queryInterface.describeTable('payroll');
    for (const col of ['attendance_deduction', 'absent_days', 'leave_days']) {
      if (desc[col]) await queryInterface.removeColumn('payroll', col);
    }
  },
};
