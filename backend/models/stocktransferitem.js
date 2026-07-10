const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StockTransferItem extends Model {
    static associate(models) {
      StockTransferItem.belongsTo(models.StockTransfer, { foreignKey: 'transfer_id' });
      StockTransferItem.belongsTo(models.Product, { foreignKey: 'product_id' });
    }
  }
  StockTransferItem.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    transfer_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'StockTransferItem',
    tableName: 'stock_transfer_items',
    underscored: true
  });
  return StockTransferItem;
};
