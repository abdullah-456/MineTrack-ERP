const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BoardMemberTransaction extends Model {
    static associate(models) {
      BoardMemberTransaction.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      BoardMemberTransaction.belongsTo(models.BoardMember, { foreignKey: 'board_member_id' });
      BoardMemberTransaction.belongsTo(models.BankAccount, { foreignKey: 'bank_account_id' });
      BoardMemberTransaction.belongsTo(models.User, { as: 'CreatedBy', foreignKey: 'created_by' });
    }
  }
  BoardMemberTransaction.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    board_member_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('opening_balance', 'contribution', 'withdrawal', 'adjustment'),
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    method: {
      type: DataTypes.ENUM('cash', 'bank'),
      allowNull: true
    },
    bank_account_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'BoardMemberTransaction',
    tableName: 'board_member_transactions',
    underscored: true
  });
  return BoardMemberTransaction;
};
