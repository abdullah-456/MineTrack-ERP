const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FiscalYearSnapshot extends Model {
    static associate(models) {
      FiscalYearSnapshot.belongsTo(models.FiscalYear, { foreignKey: 'fiscal_year_id' });
      FiscalYearSnapshot.belongsTo(models.ChartOfAccount, { foreignKey: 'account_id' });
    }
  }
  FiscalYearSnapshot.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    fiscal_year_id: { type: DataTypes.INTEGER, allowNull: false },
    account_id: { type: DataTypes.INTEGER, allowNull: false },
    debit: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    credit: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    balance: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
  }, {
    sequelize,
    modelName: 'FiscalYearSnapshot',
    tableName: 'fiscal_year_snapshots',
    underscored: true,
  });
  return FiscalYearSnapshot;
};
