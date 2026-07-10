const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Expense extends Model {
    static associate(models) {
      Expense.belongsTo(models.Voucher, { foreignKey: 'voucher_id' });
      Expense.belongsTo(models.Branch, { foreignKey: 'branch_id' });
    }
  }
  Expense.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false // e.g. Rent, Utilities, Office Supplies
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    expense_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    paid_via: {
      type: DataTypes.ENUM('cash', 'bank'),
      allowNull: false
    },
    voucher_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    branch_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'Expense',
    tableName: 'expenses',
    underscored: true
  });
  return Expense;
};
