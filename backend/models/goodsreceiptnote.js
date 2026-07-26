const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class GoodsReceiptNote extends Model {
    static associate(models) {
      GoodsReceiptNote.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      GoodsReceiptNote.belongsTo(models.Supplier, { foreignKey: 'supplier_id' });
      GoodsReceiptNote.belongsTo(models.PurchaseOrder, { foreignKey: 'purchase_order_id' });
      GoodsReceiptNote.belongsTo(models.Branch, { foreignKey: 'branch_id' });
      GoodsReceiptNote.belongsTo(models.User, { as: 'Receiver', foreignKey: 'received_by' });
      GoodsReceiptNote.hasMany(models.GoodsReceiptNoteItem, { foreignKey: 'goods_receipt_note_id', as: 'GoodsReceiptNoteItems' });
      GoodsReceiptNote.hasOne(models.PurchaseInvoice, { foreignKey: 'grn_id' });
    }
  }
  GoodsReceiptNote.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shop_id: { type: DataTypes.INTEGER, allowNull: false },
    supplier_id: { type: DataTypes.INTEGER, allowNull: false },
    purchase_order_id: { type: DataTypes.INTEGER, allowNull: true },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    grn_number: { type: DataTypes.STRING, allowNull: false },
    receipt_date: { type: DataTypes.DATE, allowNull: false },
    supplier_invoice_number: { type: DataTypes.STRING, allowNull: true },
    subtotal: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    total: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.ENUM('draft', 'posted'), allowNull: false, defaultValue: 'draft' },
    notes: { type: DataTypes.TEXT, allowNull: true },
    received_by: { type: DataTypes.INTEGER, allowNull: true },
    posted_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    sequelize,
    modelName: 'GoodsReceiptNote',
    tableName: 'goods_receipt_notes',
    underscored: true,
  });
  return GoodsReceiptNote;
};
