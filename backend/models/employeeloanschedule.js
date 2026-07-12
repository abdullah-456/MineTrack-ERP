const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EmployeeLoanSchedule extends Model {
    static associate(models) {
      EmployeeLoanSchedule.belongsTo(models.EmployeeLoan, { foreignKey: 'loan_id' });
    }
  }
  EmployeeLoanSchedule.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    loan_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    installment_no: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    due_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    due_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'paid', 'overdue'),
      defaultValue: 'pending'
    }
  }, {
    sequelize,
    modelName: 'EmployeeLoanSchedule',
    tableName: 'employee_loan_schedule',
    underscored: true
  });
  return EmployeeLoanSchedule;
};
