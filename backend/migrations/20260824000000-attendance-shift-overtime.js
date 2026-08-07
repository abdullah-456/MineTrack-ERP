'use strict';

/** Adds per-day shift + overtime hours to attendance, and an hourly overtime rate to employees. */
module.exports = {
  async up(queryInterface, Sequelize) {
    const attTable = await queryInterface.describeTable('attendance');
    if (!attTable.shift) {
      await queryInterface.addColumn('attendance', 'shift', { type: Sequelize.STRING(20), allowNull: true });
    }
    if (!attTable.overtime_hours) {
      await queryInterface.addColumn('attendance', 'overtime_hours', { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 });
    }

    const empTable = await queryInterface.describeTable('employees');
    if (!empTable.overtime_rate) {
      await queryInterface.addColumn('employees', 'overtime_rate', { type: Sequelize.DECIMAL(10, 2), allowNull: true });
    }

    // Payslip itemization, same treatment as attendance_deduction/absent_days/
    // leave_days (20260816000002-payroll-attendance-deduction.js).
    let payrollTable = {};
    try { payrollTable = await queryInterface.describeTable('payroll'); } catch { /* table not created yet */ }
    if (payrollTable.month) {
      if (!payrollTable.overtime_hours) {
        await queryInterface.addColumn('payroll', 'overtime_hours', { type: Sequelize.DECIMAL(6, 2), allowNull: false, defaultValue: 0 });
      }
      if (!payrollTable.overtime_amount) {
        await queryInterface.addColumn('payroll', 'overtime_amount', { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 });
      }
    }
  },

  async down(queryInterface) {
    const attTable = await queryInterface.describeTable('attendance');
    if (attTable.shift) await queryInterface.removeColumn('attendance', 'shift');
    if (attTable.overtime_hours) await queryInterface.removeColumn('attendance', 'overtime_hours');

    const empTable = await queryInterface.describeTable('employees');
    if (empTable.overtime_rate) await queryInterface.removeColumn('employees', 'overtime_rate');

    let payrollTable = {};
    try { payrollTable = await queryInterface.describeTable('payroll'); } catch { /* table not created */ }
    if (payrollTable.overtime_hours) await queryInterface.removeColumn('payroll', 'overtime_hours');
    if (payrollTable.overtime_amount) await queryInterface.removeColumn('payroll', 'overtime_amount');
  },
};
