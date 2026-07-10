const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PurchaseReturn extends Model {
    static associate(models) {
      PurchaseReturn.belongsTo(models.PurchaseOrder, { foreignKey: 'po_id' });
      PurchaseReturn.belongsTo(models.Product, { foreignKey: 'product_id' });
      PurchaseReturn.belongsTo(models.User, { as: 'Creator', foreignKey: 'created_by' });
    }
  }
  PurchaseReturn.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    po_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: true
    },
    refund_or_credit: {
      type: DataTypes.ENUM('refund', 'credit'),
      allowNull: false
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'PurchaseReturn',
    tableName: 'purchase_returns',
    underscored: true
  });
  return PurchaseReturn;
};
