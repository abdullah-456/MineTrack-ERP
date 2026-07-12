const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EmployeeTransaction extends Model {
    static associate(models) {
      EmployeeTransaction.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      EmployeeTransaction.belongsTo(models.Employee, { foreignKey: 'employee_id' });
      EmployeeTransaction.belongsTo(models.EmployeeLoan, { foreignKey: 'related_loan_id' });
      EmployeeTransaction.belongsTo(models.Payroll, { foreignKey: 'related_payroll_id' });
      EmployeeTransaction.belongsTo(models.User, { as: 'CreatedBy', foreignKey: 'created_by' });
    }
  }
  EmployeeTransaction.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('salary_due', 'advance_given', 'loan_given', 'payment_made', 'loan_repayment', 'deduction', 'opening_balance', 'adjustment', 'receivable_collected'),
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    method: {
      type: DataTypes.ENUM('cash', 'bank'),
      allowNull: true
    },
    related_loan_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    // Set only on the payment_made row created by giveSalary — lets the slip
    // print page join back to the Payroll row for a full itemized pay slip.
    related_payroll_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    // Only meaningful for type='advance_given': the future salary month this
    // advance is deducted against, auto-cleared when Give Salary runs for it.
    for_month: {
      type: DataTypes.STRING(7),
      allowNull: true
    },
    cleared: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'EmployeeTransaction',
    tableName: 'employee_transactions',
    underscored: true
  });
  return EmployeeTransaction;
};
