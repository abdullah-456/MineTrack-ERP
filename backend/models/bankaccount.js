const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BankAccount extends Model {
    static associate(models) {
      BankAccount.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      BankAccount.belongsTo(models.ChartOfAccount, { foreignKey: 'chart_of_account_id' });
    }
  }
  BankAccount.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    account_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    bank_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    account_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    opening_balance: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    current_balance: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    chart_of_account_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    kind: {
      type: DataTypes.ENUM('bank', 'cash'),
      allowNull: false,
      defaultValue: 'bank'
    }
  }, {
    sequelize,
    modelName: 'BankAccount',
    tableName: 'bank_accounts',
    underscored: true
  });
  return BankAccount;
};
