const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Voucher extends Model {
    static associate(models) {
      Voucher.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      Voucher.belongsTo(models.User, { as: 'Creator', foreignKey: 'created_by' });
      Voucher.belongsTo(models.User, { as: 'Approver', foreignKey: 'approved_by' });
      Voucher.belongsTo(models.Branch, { foreignKey: 'branch_id' });
      Voucher.hasMany(models.VoucherEntry, { foreignKey: 'voucher_id' });
      Voucher.hasMany(models.GeneralLedger, { foreignKey: 'voucher_id' });
      Voucher.belongsTo(models.FiscalYear, { foreignKey: 'fiscal_year_id' });
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
    branch_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    voucher_number: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    voucher_type: {
      // 'opening' marks setup / opening-balance journals so live cash figures
      // can exclude them by purpose rather than by guessing from account type
      // (see openingVoucherIds in utils/cashHelpers.js).
      type: DataTypes.ENUM('payment', 'receipt', 'journal', 'contra', 'opening', 'closing'),
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
    },
    fiscal_year_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'Voucher',
    tableName: 'vouchers',
    underscored: true
  });
  return Voucher;
};
