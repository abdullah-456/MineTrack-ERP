const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProductSupplier extends Model {
    static associate(models) {
      ProductSupplier.belongsTo(models.Product, { foreignKey: 'product_id' });
      ProductSupplier.belongsTo(models.Supplier, { foreignKey: 'supplier_id' });
    }
  }
  ProductSupplier.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    supplier_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    supplier_product_code: {
      type: DataTypes.STRING,
      allowNull: true
    },
    supplier_barcode: {
      type: DataTypes.STRING,
      allowNull: true
    },
    purchase_price: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    currency: {
      type: DataTypes.STRING,
      defaultValue: 'PKR'
    },
    minimum_order_quantity: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    lead_time_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    preferred_supplier: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    last_purchase_price: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true
    },
    last_purchase_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'disabled'),
      defaultValue: 'active'
    }
  }, {
    sequelize,
    modelName: 'ProductSupplier',
    tableName: 'product_suppliers',
    underscored: true
  });
  return ProductSupplier;
};
