const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Branch extends Model {
    static associate(models) {
      Branch.belongsTo(models.Shop,         { foreignKey: 'shop_id' });
      Branch.belongsTo(models.Godown,       { foreignKey: 'godown_id' });
      Branch.belongsTo(models.Employee,     { foreignKey: 'manager_id', as: 'Manager' });
      Branch.belongsTo(models.Mineral,      { foreignKey: 'mineral_id', as: 'Mineral' });
      Branch.hasMany(models.Pit,            { foreignKey: 'mine_id', as: 'Pits' });
      Branch.hasMany(models.ProductionEntry, { foreignKey: 'mine_id', as: 'ProductionEntries' });
      Branch.hasMany(models.Vehicle,        { foreignKey: 'assigned_branch_id', as: 'Vehicles' });
      Branch.hasMany(models.User,           { foreignKey: 'branch_id' });
      Branch.hasMany(models.Stock,          { foreignKey: 'branch_id' });
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
    godown_id: {
      type: DataTypes.INTEGER,
      allowNull: true
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
      type: DataTypes.STRING(30),
      defaultValue: 'active'
    },
    mine_code: {
      type: DataTypes.STRING(40),
      allowNull: true
    },
    company: {
      type: DataTypes.STRING(160),
      allowNull: true
    },
    mineral_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    province: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    district: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    gps_coordinates: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    lease_number: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    lease_start_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    lease_expiry_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    area: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    manager_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Branch',
    tableName: 'branches',
    underscored: true
  });
  return Branch;
};
