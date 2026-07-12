const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EmployeeLoan extends Model {
    static associate(models) {
      EmployeeLoan.belongsTo(models.Employee, { foreignKey: 'employee_id' });
      EmployeeLoan.belongsTo(models.User, { as: 'CreatedBy', foreignKey: 'created_by' });
      EmployeeLoan.hasMany(models.EmployeeLoanSchedule, { foreignKey: 'loan_id' });
      EmployeeLoan.hasMany(models.EmployeeTransaction, { foreignKey: 'related_loan_id' });
    }
  }
  EmployeeLoan.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    principal_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    number_of_installments: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    frequency: {
      type: DataTypes.ENUM('weekly', 'monthly'),
      defaultValue: 'monthly'
    },
    start_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('active', 'closed'),
      defaultValue: 'active'
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'EmployeeLoan',
    tableName: 'employee_loans',
    underscored: true
  });
  return EmployeeLoan;
};
