const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BoardMemberTransaction extends Model {
    static associate(models) {
      BoardMemberTransaction.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      BoardMemberTransaction.belongsTo(models.BoardMember, { foreignKey: 'board_member_id' });
      BoardMemberTransaction.belongsTo(models.BankAccount, { foreignKey: 'bank_account_id' });
      BoardMemberTransaction.belongsTo(models.Voucher, { foreignKey: 'voucher_id' });
      BoardMemberTransaction.belongsTo(models.User, { as: 'CreatedBy', foreignKey: 'created_by' });
    }
  }
  BoardMemberTransaction.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    board_member_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM(
        'opening_balance',
        'contribution',
        'withdrawal',
        'adjustment',
        'personal_deposit',
        'transfer_to_capital',
        'transfer_from_capital',
        'current_payment',
        'current_receipt',
      ),
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00,
    },
    method: {
      type: DataTypes.ENUM('cash', 'bank'),
      allowNull: true,
    },
    bank_account_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    voucher_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    account_bucket: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    fund_origin: {
      type: DataTypes.STRING(16),
      allowNull: true,
    },
    // The actual split behind fund_origin. Stored rather than inferred: a
    // 'mixed' row carries both, and the ledger previously had to guess it back
    // out (and got it wrong — see migrations/20260812000001).
    personal_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
    },
    company_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
    },
    counterpart_method: {
      type: DataTypes.STRING(16),
      allowNull: true,
    },
    counterpart_bank_account_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'BoardMemberTransaction',
    tableName: 'board_member_transactions',
    underscored: true,
  });
  return BoardMemberTransaction;
};
