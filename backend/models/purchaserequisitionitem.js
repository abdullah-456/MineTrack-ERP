const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PurchaseRequisitionItem extends Model {
    static associate(models) {
      PurchaseRequisitionItem.belongsTo(models.PurchaseRequisition, { foreignKey: 'purchase_requisition_id' });
      PurchaseRequisitionItem.belongsTo(models.Product, { foreignKey: 'product_id' });
    }
  }
  PurchaseRequisitionItem.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    purchase_requisition_id: { type: DataTypes.INTEGER, allowNull: false },
    product_id: { type: DataTypes.INTEGER, allowNull: true },
    description: { type: DataTypes.STRING, allowNull: false },
    quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
    unit: { type: DataTypes.STRING(30), allowNull: true },
    estimated_unit_cost: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    line_total: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    notes: { type: DataTypes.TEXT, allowNull: true },
  }, {
    sequelize,
    modelName: 'PurchaseRequisitionItem',
    tableName: 'purchase_requisition_items',
    underscored: true,
  });
  return PurchaseRequisitionItem;
};
