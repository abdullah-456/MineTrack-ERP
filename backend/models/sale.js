const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Sale extends Model {
    static associate(models) {
      Sale.belongsTo(models.Shop,     { foreignKey: 'shop_id' });
      Sale.belongsTo(models.Customer, { foreignKey: 'customer_id' });
      Sale.belongsTo(models.Branch,   { foreignKey: 'branch_id' });
      Sale.belongsTo(models.User,     { as: 'Cashier', foreignKey: 'cashier_id' });
      Sale.belongsTo(models.Employee, { foreignKey: 'employee_id' });
      Sale.hasMany(models.SaleItem,   { foreignKey: 'sale_id', as: 'SaleItems' });
      Sale.hasMany(models.Payment,    { foreignKey: 'sale_id', as: 'Payments' });
      Sale.hasMany(models.SaleReturn, { foreignKey: 'sale_id' });
      Sale.hasOne(models.InstallmentPlan, { foreignKey: 'sale_id' });
    }
  }
  Sale.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    invoice_number: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: true // Nullable for walk-in customers
    },
    branch_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    cashier_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sale_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    sale_type: {
      type: DataTypes.ENUM('cash', 'card', 'bank', 'credit', 'installment'),
      allowNull: false
    },
    subtotal: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    discount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    tax: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    total: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('completed', 'held', 'cancelled'),
      defaultValue: 'completed'
    }
  }, {
    sequelize,
    modelName: 'Sale',
    tableName: 'sales',
    underscored: true
  });
  return Sale;
};
