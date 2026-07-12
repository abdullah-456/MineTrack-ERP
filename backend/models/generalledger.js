const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class GeneralLedger extends Model {
    static associate(models) {
      GeneralLedger.belongsTo(models.ChartOfAccount, { foreignKey: 'account_id' });
      GeneralLedger.belongsTo(models.Voucher, { foreignKey: 'voucher_id' });
    }
  }
  GeneralLedger.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    account_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    voucher_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    entry_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    debit: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    credit: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    running_balance: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'GeneralLedger',
    tableName: 'general_ledger',
    underscored: true
  });
  return GeneralLedger;
};
