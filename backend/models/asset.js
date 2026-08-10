'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Asset extends Model {
    static associate(models) {
      Asset.belongsTo(models.Branch, { foreignKey: 'branch_id' });
      Asset.belongsTo(models.BankAccount, { foreignKey: 'bank_account_id', as: 'BankAccount' });
      Asset.belongsTo(models.BankAccount, { foreignKey: 'disposal_bank_account_id', as: 'DisposalBankAccount' });
      Asset.belongsTo(models.ChartOfAccount, { foreignKey: 'fixed_asset_account_id', as: 'FixedAssetAccount' });
      Asset.belongsTo(models.Voucher, { foreignKey: 'voucher_id', as: 'Voucher' });
      Asset.belongsTo(models.Voucher, { foreignKey: 'disposal_voucher_id', as: 'DisposalVoucher' });
      Asset.belongsTo(models.User, { foreignKey: 'created_by', as: 'CreatedBy' });
    }
  }
  Asset.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shop_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: true },
    asset_name: { type: DataTypes.STRING(160), allowNull: false },
    category: { type: DataTypes.STRING(60), allowNull: false },
    asset_code: { type: DataTypes.STRING(40), allowNull: true },
    purchase_date: { type: DataTypes.DATEONLY, allowNull: false },
    purchase_cost: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    salvage_value: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    useful_life_years: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    depreciation_percentage: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    depreciation_years_posted: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    accumulated_depreciation_posted: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    is_paid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    paid_via: { type: DataTypes.STRING(10), allowNull: true },
    bank_account_id: { type: DataTypes.INTEGER, allowNull: true },
    fixed_asset_account_id: { type: DataTypes.INTEGER, allowNull: true },
    voucher_id: { type: DataTypes.INTEGER, allowNull: true },
    insurance_provider: { type: DataTypes.STRING(160), allowNull: true },
    insurance_policy_number: { type: DataTypes.STRING(80), allowNull: true },
    insurance_premium: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    insurance_expiry: { type: DataTypes.DATEONLY, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    disposal_date: { type: DataTypes.DATEONLY, allowNull: true },
    disposal_value: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    disposal_via: { type: DataTypes.STRING(10), allowNull: true },
    disposal_bank_account_id: { type: DataTypes.INTEGER, allowNull: true },
    disposal_voucher_id: { type: DataTypes.INTEGER, allowNull: true },
    disposal_notes: { type: DataTypes.TEXT, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize,
    modelName: 'Asset',
    tableName: 'assets',
    underscored: true,
  });
  return Asset;
};
