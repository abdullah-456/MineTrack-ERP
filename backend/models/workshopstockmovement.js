const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class WorkshopStockMovement extends Model {
    static associate(models) {
      WorkshopStockMovement.belongsTo(models.WorkshopItem, { foreignKey: 'workshop_item_id' });
      WorkshopStockMovement.belongsTo(models.Branch, { foreignKey: 'branch_id' });
      WorkshopStockMovement.belongsTo(models.User, { foreignKey: 'created_by' });
    }
  }
  WorkshopStockMovement.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    workshop_item_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    branch_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    ref_type: {
      type: DataTypes.ENUM('stock_in', 'job_usage', 'adjustment_in', 'adjustment_out'),
      allowNull: false,
    },
    ref_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    quantity: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: false,
    },
    unit_cost: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    balance_after: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: false,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'WorkshopStockMovement',
    tableName: 'workshop_stock_movements',
    underscored: true,
    updatedAt: false,
  });
  return WorkshopStockMovement;
};
