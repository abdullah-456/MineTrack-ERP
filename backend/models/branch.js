const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Branch extends Model {
    static associate(models) {
      Branch.belongsTo(models.Shop,         { foreignKey: 'shop_id' });
      Branch.hasMany(models.User,           { foreignKey: 'branch_id' });
      Branch.hasMany(models.Stock,          { foreignKey: 'branch_id' });
      Branch.hasMany(models.PurchaseOrder,  { foreignKey: 'branch_id' });
      Branch.hasMany(models.Sale,           { foreignKey: 'branch_id' });
      Branch.hasMany(models.Employee,       { foreignKey: 'branch_id' });
      Branch.hasMany(models.Expense,        { foreignKey: 'branch_id' });
    }
  }
  Branch.init({
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
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_default: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    status: {
      type: DataTypes.ENUM('active', 'disabled'),
      defaultValue: 'active'
    }
  }, {
    sequelize,
    modelName: 'Branch',
    tableName: 'branches',
    underscored: true
  });
  return Branch;
};
