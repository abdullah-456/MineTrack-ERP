const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FiscalYear extends Model {
    static associate(models) {
      FiscalYear.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      FiscalYear.belongsTo(models.User, { as: 'ClosedBy', foreignKey: 'closed_by' });
      FiscalYear.belongsTo(models.Voucher, { as: 'ClosingVoucher', foreignKey: 'closing_voucher_id' });
      FiscalYear.belongsTo(models.Voucher, { as: 'OpeningVoucher', foreignKey: 'opening_voucher_id' });
      FiscalYear.hasMany(models.FiscalYearSnapshot, { foreignKey: 'fiscal_year_id' });
    }
  }
  FiscalYear.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shop_id: { type: DataTypes.INTEGER, allowNull: false },
    label: { type: DataTypes.STRING, allowNull: false },
    start_date: { type: DataTypes.DATEONLY, allowNull: false },
    end_date: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM('open', 'closed'), allowNull: false, defaultValue: 'open' },
    closed_at: { type: DataTypes.DATE, allowNull: true },
    closed_by: { type: DataTypes.INTEGER, allowNull: true },
    closing_voucher_id: { type: DataTypes.INTEGER, allowNull: true },
    opening_voucher_id: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize,
    modelName: 'FiscalYear',
    tableName: 'fiscal_years',
    underscored: true,
  });
  return FiscalYear;
};
