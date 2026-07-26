const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class GoodsReceiptNoteItem extends Model {
    static associate(models) {
      GoodsReceiptNoteItem.belongsTo(models.GoodsReceiptNote, { foreignKey: 'goods_receipt_note_id' });
      GoodsReceiptNoteItem.belongsTo(models.Product, { foreignKey: 'product_id' });
      GoodsReceiptNoteItem.belongsTo(models.PurchaseOrderItem, { foreignKey: 'purchase_order_item_id' });
      GoodsReceiptNoteItem.belongsTo(models.Branch, { foreignKey: 'branch_id' });
    }
  }
  GoodsReceiptNoteItem.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    goods_receipt_note_id: { type: DataTypes.INTEGER, allowNull: false },
    product_id: { type: DataTypes.INTEGER, allowNull: false },
    purchase_order_item_id: { type: DataTypes.INTEGER, allowNull: true },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    quantity_received: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
    unit_cost: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    line_total: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
  }, {
    sequelize,
    modelName: 'GoodsReceiptNoteItem',
    tableName: 'goods_receipt_note_items',
    underscored: true,
  });
  return GoodsReceiptNoteItem;
};
