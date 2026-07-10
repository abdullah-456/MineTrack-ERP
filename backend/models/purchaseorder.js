const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PurchaseOrder extends Model {
    static associate(models) {
      PurchaseOrder.belongsTo(models.Supplier, { foreignKey: 'supplier_id' });
      PurchaseOrder.belongsTo(models.Branch, { foreignKey: 'branch_id' });
      PurchaseOrder.belongsTo(models.User, { as: 'Creator', foreignKey: 'created_by' });
      PurchaseOrder.hasMany(models.PurchaseOrderItem, { foreignKey: 'po_id' });
      PurchaseOrder.hasMany(models.GoodsReceiptNote, { foreignKey: 'po_id' });
      PurchaseOrder.hasMany(models.PurchaseReturn, { foreignKey: 'po_id' });
    }
  }
  PurchaseOrder.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    po_number: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    supplier_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    branch_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    order_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    expected_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('draft', 'sent', 'partial', 'received', 'closed'),
      defaultValue: 'draft'
    },
    total_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'PurchaseOrder',
    tableName: 'purchase_orders',
    underscored: true
  });
  return PurchaseOrder;
};
