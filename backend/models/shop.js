const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Shop extends Model {
    static associate(models) {
      Shop.hasMany(models.Branch,       { foreignKey: 'shop_id' });
      Shop.hasMany(models.User,         { foreignKey: 'shop_id' });
      Shop.hasMany(models.Product,      { foreignKey: 'shop_id' });
      Shop.hasMany(models.Sale,         { foreignKey: 'shop_id' });
      Shop.hasMany(models.Customer,     { foreignKey: 'shop_id' });
      Shop.hasMany(models.Employee,     { foreignKey: 'shop_id' });
      Shop.hasMany(models.Expense,      { foreignKey: 'shop_id' });
      Shop.hasMany(models.Supplier,     { foreignKey: 'shop_id' });
      Shop.hasMany(models.BankAccount,  { foreignKey: 'shop_id' });
      Shop.hasMany(models.CashSession,  { foreignKey: 'shop_id' });
    }
  }
  Shop.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    owner_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: { isEmail: true }
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    logo_url: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'suspended', 'trial'),
      defaultValue: 'trial'
    },
    plan: {
      type: DataTypes.ENUM('basic', 'pro', 'enterprise'),
      defaultValue: 'basic'
    },
    setup_completed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'Shop',
    tableName: 'shops',
    underscored: true
  });
  return Shop;
};
