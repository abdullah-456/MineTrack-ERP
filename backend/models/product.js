const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Product extends Model {
    static associate(models) {
      Product.belongsTo(models.Shop,            { foreignKey: 'shop_id' });
      Product.belongsTo(models.Category,        { foreignKey: 'category_id' });
      Product.hasMany(models.Stock,             { foreignKey: 'product_id', as: 'Stock' });
      Product.hasMany(models.ProductSupplier,   { foreignKey: 'product_id', as: 'ProductSuppliers' });
      Product.hasMany(models.PurchaseOrderItem, { foreignKey: 'product_id' });
      Product.hasMany(models.SaleItem,          { foreignKey: 'product_id' });
      Product.hasMany(models.StockTransferItem, { foreignKey: 'product_id' });
      Product.hasMany(models.StockAdjustment,   { foreignKey: 'product_id' });
      Product.hasMany(models.StockMovement,     { foreignKey: 'product_id' });
    }
  }
  Product.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sku: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    barcode: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    brand: {
      type: DataTypes.STRING,
      allowNull: true
    },
    unit: {
      type: DataTypes.STRING,
      defaultValue: 'Pcs'
    },
    tax_rate: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00
    },
    reorder_level: {
      type: DataTypes.INTEGER,
      defaultValue: 5
    },
    cost_price: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    sale_price: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('active', 'disabled'),
      defaultValue: 'active'
    },
    image_url: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Product',
    tableName: 'products',
    underscored: true
  });
  return Product;
};
