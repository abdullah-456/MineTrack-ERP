const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ChartOfAccount extends Model {
    static associate(models) {
      ChartOfAccount.belongsTo(models.ChartOfAccount, { as: 'Parent', foreignKey: 'parent_account_id' });
      ChartOfAccount.hasMany(models.ChartOfAccount, { as: 'Children', foreignKey: 'parent_account_id' });
      ChartOfAccount.hasMany(models.VoucherEntry, { foreignKey: 'account_id' });
      ChartOfAccount.hasMany(models.GeneralLedger, { foreignKey: 'account_id' });
    }
  }
  ChartOfAccount.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    account_code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    account_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    account_type: {
      type: DataTypes.ENUM('asset', 'liability', 'equity', 'income', 'expense'),
      allowNull: false
    },
    parent_account_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'ChartOfAccount',
    tableName: 'chart_of_accounts',
    underscored: true
  });
  return ChartOfAccount;
};
