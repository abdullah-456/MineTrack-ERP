const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ChartOfAccount extends Model {
    static associate(models) {
      ChartOfAccount.belongsTo(models.ChartOfAccount, { as: 'Parent', foreignKey: 'parent_account_id' });
      ChartOfAccount.hasMany(models.ChartOfAccount, { as: 'Children', foreignKey: 'parent_account_id' });
      ChartOfAccount.hasMany(models.VoucherEntry, { foreignKey: 'account_id' });
      ChartOfAccount.hasMany(models.GeneralLedger, { foreignKey: 'account_id' });
      ChartOfAccount.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      ChartOfAccount.belongsTo(models.User, { as: 'CreatedBy', foreignKey: 'created_by' });
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
    },
    // NULL = system account shared by every shop (the seeded tree); set = a
    // custom account a shop created for itself (e.g. a director's sub-account).
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    // A contra account's balance is opposite to its type's natural balance BY
    // DESIGN — Accumulated Depreciation is an asset that always sits in credit.
    // Statements print these as a positive figure under a "Less:" label, and
    // reserve the negative presentation for balances that are abnormal rather
    // than merely contrary. The sign alone can't tell those apart.
    is_contra: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    created_by: {
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
