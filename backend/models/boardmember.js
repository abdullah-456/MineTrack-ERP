const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BoardMember extends Model {
    static associate(models) {
      BoardMember.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      BoardMember.belongsTo(models.ChartOfAccount, { foreignKey: 'chart_of_account_id' });
      BoardMember.belongsTo(models.ChartOfAccount, { as: 'DueFromAccount', foreignKey: 'due_from_coa_id' });
      BoardMember.belongsTo(models.ChartOfAccount, { as: 'CurrentCashAccount', foreignKey: 'current_cash_coa_id' });
      BoardMember.belongsTo(models.ChartOfAccount, { as: 'CurrentBankAccount', foreignKey: 'current_bank_coa_id' });
      BoardMember.hasMany(models.BoardMemberTransaction, { foreignKey: 'board_member_id' });
    }
  }
  BoardMember.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    cnic: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    cnic_normalized: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    opening_balance: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
    },
    // Legacy alias — kept in sync with investment_balance for older callers
    current_balance: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
    },
    investment_balance: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
    },
    current_cash_balance: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
    },
    current_bank_balance: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
    },
    current_cash_name: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    current_bank_name: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    due_from_balance: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
    },
    chart_of_account_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    due_from_coa_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    current_cash_coa_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    current_bank_coa_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'BoardMember',
    tableName: 'board_members',
    underscored: true,
  });
  return BoardMember;
};
