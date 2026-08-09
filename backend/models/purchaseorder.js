const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PurchaseOrder extends Model {
    static associate(models) {
      PurchaseOrder.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      PurchaseOrder.belongsTo(models.Supplier, { foreignKey: 'supplier_id' });
      PurchaseOrder.belongsTo(models.Branch, { foreignKey: 'branch_id' });
      PurchaseOrder.belongsTo(models.PurchaseRequisition, { foreignKey: 'purchase_requisition_id' });
      PurchaseOrder.belongsTo(models.User, { as: 'Creator', foreignKey: 'created_by' });
      PurchaseOrder.hasMany(models.PurchaseOrderItem, { foreignKey: 'purchase_order_id', as: 'PurchaseOrderItems' });
      PurchaseOrder.hasMany(models.GoodsReceiptNote, { foreignKey: 'purchase_order_id' });
    }
  }
  PurchaseOrder.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shop_id: { type: DataTypes.INTEGER, allowNull: false },
    supplier_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: true },
    purchase_requisition_id: { type: DataTypes.INTEGER, allowNull: true },
    po_number: { type: DataTypes.STRING, allowNull: false },
    order_date: { type: DataTypes.DATEONLY, allowNull: false },
    expected_date: { type: DataTypes.DATEONLY, allowNull: true },
    vendor_reference: { type: DataTypes.STRING, allowNull: true },
    subtotal: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    discount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    tax: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    total: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    status: {
      type: DataTypes.ENUM('draft', 'sent', 'partially_received', 'received', 'cancelled'),
      allowNull: false,
      defaultValue: 'draft',
    },
    notes: { type: DataTypes.TEXT, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize,
    modelName: 'PurchaseOrder',
    tableName: 'purchase_orders',
    underscored: true,
  });
  return PurchaseOrder;
};
