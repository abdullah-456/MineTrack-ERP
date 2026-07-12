const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Voucher extends Model {
    static associate(models) {
      Voucher.belongsTo(models.User, { as: 'Creator', foreignKey: 'created_by' });
      Voucher.belongsTo(models.User, { as: 'Approver', foreignKey: 'approved_by' });
      Voucher.hasMany(models.VoucherEntry, { foreignKey: 'voucher_id' });
      Voucher.hasMany(models.GeneralLedger, { foreignKey: 'voucher_id' });
    }
  }
  Voucher.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    voucher_number: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    voucher_type: {
      type: DataTypes.ENUM('payment', 'receipt', 'journal', 'contra'),
      allowNull: false
    },
    voucher_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    narration: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    approved_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('draft', 'posted'),
      defaultValue: 'draft'
    }
  }, {
    sequelize,
    modelName: 'Voucher',
    tableName: 'vouchers',
    underscored: true
  });
  return Voucher;
};
