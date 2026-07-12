'use strict';

/**
 * Payslip system: links the "payment_made" EmployeeTransaction created by
 * giveSalary back to its Payroll row, so the generic slip print page
 * (EmployeeSlipPrint.jsx) can render a full itemized pay slip (basic salary,
 * bonus, deductions, net pay) instead of just a bare amount.
 */

async function tableExists(queryInterface, table) {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

async function ensureColumn(queryInterface, table, column, definition) {
  if (!(await tableExists(queryInterface, table))) return;
  const desc = await queryInterface.describeTable(table);
  if (!desc[column]) {
    await queryInterface.addColumn(table, column, definition);
  }
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;
    await ensureColumn(queryInterface, 'employee_transactions', 'related_payroll_id', { type: DataTypes.INTEGER, allowNull: true });
  },

  down: async (queryInterface) => {
    if (await tableExists(queryInterface, 'employee_transactions')) {
      const desc = await queryInterface.describeTable('employee_transactions');
      if (desc.related_payroll_id) await queryInterface.removeColumn('employee_transactions', 'related_payroll_id');
    }
  },
};
