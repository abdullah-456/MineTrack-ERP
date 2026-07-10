const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Stock extends Model {
    static associate(models) {
      Stock.belongsTo(models.Product, { foreignKey: 'product_id' });
      Stock.belongsTo(models.Branch, { foreignKey: 'branch_id' });
    }
  }
  Stock.init({
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
    quantity_on_hand: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    quantity_reserved: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'Stock',
    tableName: 'stock',
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['product_id', 'branch_id']
      }
    ]
  });
  return Stock;
};
