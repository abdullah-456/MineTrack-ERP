const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class HeavyMachineryLog extends Model {
    static associate(models) {
      HeavyMachineryLog.belongsTo(models.HeavyMachinery, { foreignKey: 'heavy_machinery_id' });
      HeavyMachineryLog.belongsTo(models.Branch, { foreignKey: 'branch_id' });
      HeavyMachineryLog.belongsTo(models.Mineral, { foreignKey: 'mineral_id' });
      HeavyMachineryLog.belongsTo(models.User, { foreignKey: 'created_by' });
    }
  }
  HeavyMachineryLog.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    heavy_machinery_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    branch_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    log_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    working_hours: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },
    maintenance_hours: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },
    fuel_consumed: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    fuel_cost: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    mineral_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    production_quantity: {
      type: DataTypes.DECIMAL(15, 3),
      allowNull: false,
      defaultValue: 0,
    },
    production_unit: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'kg',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'HeavyMachineryLog',
    tableName: 'heavy_machinery_logs',
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['heavy_machinery_id', 'log_date'],
      },
    ],
  });
  return HeavyMachineryLog;
};
