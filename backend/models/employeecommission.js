const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EmployeeCommission extends Model {
    static associate(models) {
      EmployeeCommission.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      EmployeeCommission.belongsTo(models.Employee, { foreignKey: 'employee_id' });
      EmployeeCommission.belongsTo(models.Payroll, { as: 'PaidPayroll', foreignKey: 'paid_payroll_id' });
      EmployeeCommission.belongsTo(models.User, { as: 'CreatedBy', foreignKey: 'created_by' });
    }
  }
  EmployeeCommission.init({
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
    // The month the commission was EARNED (truck-loading data it was computed
    // from) — not necessarily the month it eventually gets paid in.
    earned_month: {
      type: DataTypes.STRING(7),
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    note: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('deferred', 'paid'),
      allowNull: false,
      defaultValue: 'deferred'
    },
    paid_payroll_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    paid_month: {
      type: DataTypes.STRING(7),
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'EmployeeCommission',
    tableName: 'employee_commissions',
    underscored: true
  });
  return EmployeeCommission;
};
