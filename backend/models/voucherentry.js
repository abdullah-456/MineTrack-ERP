const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class VoucherEntry extends Model {
    static associate(models) {
      VoucherEntry.belongsTo(models.Voucher, { foreignKey: 'voucher_id' });
      VoucherEntry.belongsTo(models.ChartOfAccount, { foreignKey: 'account_id' });
    }
  }
  VoucherEntry.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    voucher_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    account_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    debit_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    credit_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    }
  }, {
    sequelize,
    modelName: 'VoucherEntry',
    tableName: 'voucher_entries',
    underscored: true
  });
  return VoucherEntry;
};
