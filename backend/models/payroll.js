const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Payroll extends Model {
    static associate(models) {
      Payroll.belongsTo(models.Employee, { foreignKey: 'employee_id' });
      Payroll.belongsTo(models.Voucher, { foreignKey: 'voucher_id' });
    }
  }
  Payroll.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    month: {
      type: DataTypes.STRING,
      allowNull: false // e.g. "2026-07"
    },
    basic_salary: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    deductions: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    // Portion of `deductions` that came from clearing an uncleared salary
    // advance (see giveSalary) — kept separate so payslips can itemize
    // Advance vs tax Deductions instead of a single combined figure.
    advance_deduction: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    tax_deduction_percent: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00
    },
    tax_deduction: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    bonus: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    // Portion of `deductions` from unpaid absence (see giveSalary) — kept
    // separate, same reasoning as advance_deduction, so payslips can itemize
    // "N days absent × daily rate" instead of a single combined figure.
    attendance_deduction: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    absent_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    leave_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    net_pay: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('draft', 'paid'),
      defaultValue: 'draft'
    },
    voucher_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Payroll',
    tableName: 'payroll',
    underscored: true
  });
  return Payroll;
};
