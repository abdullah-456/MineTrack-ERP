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
    bonus: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
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
