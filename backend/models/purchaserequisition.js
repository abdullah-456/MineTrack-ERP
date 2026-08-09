const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PurchaseRequisition extends Model {
    static associate(models) {
      PurchaseRequisition.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      PurchaseRequisition.belongsTo(models.Branch, { foreignKey: 'branch_id' });
      PurchaseRequisition.belongsTo(models.Employee, { as: 'Requester', foreignKey: 'requested_by' });
      PurchaseRequisition.belongsTo(models.User, { as: 'Creator', foreignKey: 'created_by' });
      PurchaseRequisition.hasMany(models.PurchaseRequisitionItem, {
        foreignKey: 'purchase_requisition_id',
        as: 'PurchaseRequisitionItems',
      });
      PurchaseRequisition.hasOne(models.DepartmentalApproval, { foreignKey: 'purchase_requisition_id' });
      PurchaseRequisition.hasOne(models.PurchaseOrder, { foreignKey: 'purchase_requisition_id' });
    }
  }
  PurchaseRequisition.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shop_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: true },
    requested_by: { type: DataTypes.INTEGER, allowNull: true },
    pr_number: { type: DataTypes.STRING, allowNull: false },
    requisition_date: { type: DataTypes.DATEONLY, allowNull: false },
    required_date: { type: DataTypes.DATEONLY, allowNull: true },
    department: { type: DataTypes.STRING, allowNull: true },
    priority: {
      type: DataTypes.ENUM('normal', 'urgent'),
      allowNull: false,
      defaultValue: 'normal',
    },
    purpose: { type: DataTypes.TEXT, allowNull: true },
    subtotal: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    total: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    status: {
      type: DataTypes.ENUM('draft', 'submitted', 'approved', 'rejected', 'closed'),
      allowNull: false,
      defaultValue: 'draft',
    },
    notes: { type: DataTypes.TEXT, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize,
    modelName: 'PurchaseRequisition',
    tableName: 'purchase_requisitions',
    underscored: true,
  });
  return PurchaseRequisition;
};
