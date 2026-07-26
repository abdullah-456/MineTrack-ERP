const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PurchaseOrderItem extends Model {
    static associate(models) {
      PurchaseOrderItem.belongsTo(models.PurchaseOrder, { foreignKey: 'purchase_order_id' });
      PurchaseOrderItem.belongsTo(models.Product, { foreignKey: 'product_id' });
      PurchaseOrderItem.hasMany(models.GoodsReceiptNoteItem, { foreignKey: 'purchase_order_item_id' });
    }
  }
  PurchaseOrderItem.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    purchase_order_id: { type: DataTypes.INTEGER, allowNull: false },
    product_id: { type: DataTypes.INTEGER, allowNull: false },
    quantity_ordered: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
    quantity_received: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
    unit_cost: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    line_total: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    notes: { type: DataTypes.TEXT, allowNull: true },
  }, {
    sequelize,
    modelName: 'PurchaseOrderItem',
    tableName: 'purchase_order_items',
    underscored: true,
  });
  return PurchaseOrderItem;
};
