const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class GoodsReceiptNote extends Model {
    static associate(models) {
      GoodsReceiptNote.belongsTo(models.PurchaseOrder, { foreignKey: 'po_id' });
      GoodsReceiptNote.belongsTo(models.User, { as: 'Receiver', foreignKey: 'received_by' });
      GoodsReceiptNote.belongsTo(models.Branch, { as: 'Warehouse', foreignKey: 'warehouse_id' });
      GoodsReceiptNote.hasMany(models.PurchaseInvoice, { foreignKey: 'grn_id' });
    }
  }
  GoodsReceiptNote.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    po_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    received_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    received_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    warehouse_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'GoodsReceiptNote',
    tableName: 'goods_receipt_notes',
    underscored: true
  });
  return GoodsReceiptNote;
};
