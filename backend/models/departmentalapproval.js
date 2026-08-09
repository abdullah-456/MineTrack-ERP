const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DepartmentalApproval extends Model {
    static associate(models) {
      DepartmentalApproval.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      DepartmentalApproval.belongsTo(models.PurchaseRequisition, { foreignKey: 'purchase_requisition_id' });
      DepartmentalApproval.belongsTo(models.User, { as: 'Creator', foreignKey: 'created_by' });
    }
  }
  DepartmentalApproval.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shop_id: { type: DataTypes.INTEGER, allowNull: false },
    purchase_requisition_id: { type: DataTypes.INTEGER, allowNull: false },
    da_number: { type: DataTypes.STRING, allowNull: false },
    approval_date: { type: DataTypes.DATEONLY, allowNull: false },
    decision: {
      type: DataTypes.ENUM('approved', 'rejected'),
      allowNull: false,
    },
    remarks: { type: DataTypes.TEXT, allowNull: true },
    attachment_path: { type: DataTypes.STRING(500), allowNull: true },
    attachment_name: { type: DataTypes.STRING(255), allowNull: true },
    attachment_mime: { type: DataTypes.STRING(100), allowNull: true },
    attachment_size: { type: DataTypes.INTEGER, allowNull: true },
    attachment_description: { type: DataTypes.TEXT, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize,
    modelName: 'DepartmentalApproval',
    tableName: 'departmental_approvals',
    underscored: true,
  });
  return DepartmentalApproval;
};
