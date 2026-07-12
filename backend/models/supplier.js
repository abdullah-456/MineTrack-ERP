const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Supplier extends Model {
    static associate(models) {
      Supplier.belongsTo(models.Shop,           { foreignKey: 'shop_id' });
      Supplier.hasMany(models.ProductSupplier,  { foreignKey: 'supplier_id', as: 'ProductSuppliers' });
      Supplier.hasMany(models.PurchaseOrder,    { foreignKey: 'supplier_id' });
      Supplier.hasMany(models.PurchaseInvoice,  { foreignKey: 'supplier_id' });
      Supplier.hasMany(models.SupplierTransaction, { foreignKey: 'supplier_id' });
    }
  }
  Supplier.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    supplier_code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    company_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    contact_person: {
      type: DataTypes.STRING,
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    tax_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    payment_terms: {
      type: DataTypes.STRING,
      allowNull: true // e.g., Net 30, COD
    },
    credit_limit: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    cnic: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'disabled'),
      defaultValue: 'active'
    },
    current_payable: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    credit_balance: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    // Legacy columns kept for DB compatibility
    name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    company: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Supplier',
    tableName: 'suppliers',
    underscored: true,
    hooks: {
      beforeValidate: (supplier) => {
        if (supplier.company_name) {
          supplier.name = supplier.company_name;
          supplier.company = supplier.company_name;
        }
      },
    },
  });
  return Supplier;
};
