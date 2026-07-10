const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SaleReturnItem extends Model {
    static associate(models) {
      SaleReturnItem.belongsTo(models.SaleReturn, { foreignKey: 'return_id' });
      SaleReturnItem.belongsTo(models.SaleItem,   { foreignKey: 'sale_item_id' });
      SaleReturnItem.belongsTo(models.Product,    { foreignKey: 'product_id' });
    }
  }
  SaleReturnItem.init({
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    return_id:    { type: DataTypes.INTEGER, allowNull: false },
    sale_item_id: { type: DataTypes.INTEGER, allowNull: false },
    product_id:   { type: DataTypes.INTEGER, allowNull: false },
    quantity:     { type: DataTypes.INTEGER, allowNull: false },
    unit_price:   { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    line_total:   { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    restock:      { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    condition:    { type: DataTypes.ENUM('resellable', 'damaged'), allowNull: false, defaultValue: 'resellable' },
  }, {
    sequelize,
    modelName: 'SaleReturnItem',
    tableName: 'sale_return_items',
    underscored: true
  });
  return SaleReturnItem;
};
