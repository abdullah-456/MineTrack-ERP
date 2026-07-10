const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StockTransfer extends Model {
    static associate(models) {
      StockTransfer.belongsTo(models.Branch, { as: 'FromBranch', foreignKey: 'from_branch_id' });
      StockTransfer.belongsTo(models.Branch, { as: 'ToBranch', foreignKey: 'to_branch_id' });
      StockTransfer.belongsTo(models.User, { as: 'Creator', foreignKey: 'created_by' });
      StockTransfer.hasMany(models.StockTransferItem, { foreignKey: 'transfer_id' });
    }
  }
  StockTransfer.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    from_branch_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    to_branch_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    transfer_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'in_transit', 'completed'),
      defaultValue: 'pending'
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'StockTransfer',
    tableName: 'stock_transfers',
    underscored: true
  });
  return StockTransfer;
};
