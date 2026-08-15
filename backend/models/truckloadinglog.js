const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TruckLoadingLog extends Model {
    static associate(models) {
      TruckLoadingLog.belongsTo(models.Shop,   { foreignKey: 'shop_id' });
      TruckLoadingLog.belongsTo(models.Branch, { foreignKey: 'mine_id', as: 'Mine' });
      TruckLoadingLog.belongsTo(models.User,   { foreignKey: 'created_by', as: 'CreatedBy' });
      TruckLoadingLog.hasMany(models.TruckLoadingDay,      { foreignKey: 'log_id', as: 'Days', onDelete: 'CASCADE' });
      TruckLoadingLog.hasMany(models.TruckLoadingEmployee, { foreignKey: 'log_id', as: 'EligibleEmployees', onDelete: 'CASCADE' });
    }
  }
  TruckLoadingLog.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    mine_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    month: {
      type: DataTypes.STRING(7),
      allowNull: false // 'YYYY-MM'
    },
    // Mine/month DEFAULT rates — per truck and per ton. These are only used to
    // pre-fill an employee's row when they're first ticked on this log; the
    // rate that actually gets paid lives on truck_loading_employees, because
    // two people on the same mine can be on different terms.
    //
    // Resolution order when adding an employee:
    //   their own profile rate (if set) → these log defaults → 0
    rate: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0
    },
    ton_rate: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'TruckLoadingLog',
    tableName: 'truck_loading_logs',
    underscored: true
  });
  return TruckLoadingLog;
};
