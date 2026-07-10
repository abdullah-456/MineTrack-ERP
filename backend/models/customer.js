const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Customer extends Model {
    static associate(models) {
      Customer.belongsTo(models.Shop,            { foreignKey: 'shop_id' });
      Customer.hasMany(models.Sale,              { foreignKey: 'customer_id' });
      Customer.hasMany(models.InstallmentPlan,   { foreignKey: 'customer_id' });
      Customer.hasMany(models.Guarantor,         { foreignKey: 'customer_id' });
    }
  }
  Customer.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    cnic: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    credit_limit: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    current_balance: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    customer_type: {
      type: DataTypes.ENUM('registered', 'walkin'),
      defaultValue: 'registered'
    },
    status: {
      type: DataTypes.ENUM('active', 'disabled'),
      defaultValue: 'active'
    }
  }, {
    sequelize,
    modelName: 'Customer',
    tableName: 'customers',
    underscored: true
  });
  return Customer;
};
