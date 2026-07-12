const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StockMovement extends Model {
    static associate(models) {
      StockMovement.belongsTo(models.Product, { foreignKey: 'product_id' });
      StockMovement.belongsTo(models.Branch, { foreignKey: 'branch_id' });
    }
  }
  StockMovement.init({
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
    ref_type: {
      type: DataTypes.ENUM('purchase', 'sale', 'transfer', 'adjustment', 'return'),
      allowNull: false
    },
    ref_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    quantity: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: false // Signed quantity representation of the change
    },
    balance_after: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'StockMovement',
    tableName: 'stock_movements',
    underscored: true,
    updatedAt: false // Disable updates on this model
  });
  return StockMovement;
};
