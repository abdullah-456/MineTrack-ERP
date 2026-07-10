const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SaleItem extends Model {
    static associate(models) {
      SaleItem.belongsTo(models.Sale, { foreignKey: 'sale_id' });
      SaleItem.belongsTo(models.Product, { foreignKey: 'product_id' });
    }
  }
  SaleItem.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    sale_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    product_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    unit_price: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    discount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    line_total: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'SaleItem',
    tableName: 'sale_items',
    underscored: true
  });
  return SaleItem;
};
