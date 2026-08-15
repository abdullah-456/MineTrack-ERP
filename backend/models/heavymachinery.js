const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class HeavyMachinery extends Model {
    static associate(models) {
      HeavyMachinery.belongsTo(models.Branch, { foreignKey: 'assigned_branch_id', as: 'AssignedMine' });
      HeavyMachinery.hasMany(models.HeavyMachineryLog, { foreignKey: 'heavy_machinery_id' });
    }
  }
  HeavyMachinery.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    machine_code: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(160),
      allowNull: false,
    },
    machine_type: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    model: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    manufacturer: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    capacity: {
      type: DataTypes.STRING(40),
      allowNull: true,
    },
    fuel_type: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    assigned_branch_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
    },
    acquisition_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'HeavyMachinery',
    tableName: 'heavy_machinery',
    underscored: true,
  });
  return HeavyMachinery;
};
