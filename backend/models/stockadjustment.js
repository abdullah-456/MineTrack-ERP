const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StockAdjustment extends Model {
    static associate(models) {
      StockAdjustment.belongsTo(models.Product, { foreignKey: 'product_id' });
      StockAdjustment.belongsTo(models.Branch, { foreignKey: 'branch_id' });
      StockAdjustment.belongsTo(models.User, { as: 'Approver', foreignKey: 'approved_by' });
    }
  }
  StockAdjustment.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    branch_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    quantity_change: {
      type: DataTypes.INTEGER,
      allowNull: false // Signed integer, e.g. -5, +3
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: false
    },
    approved_by: {
      type: DataTypes.INTEGER,
      allowNull: true // Nullable until approved or if auto-approved
    }
  }, {
    sequelize,
    modelName: 'StockAdjustment',
    tableName: 'stock_adjustments',
    underscored: true
  });
  return StockAdjustment;
};
