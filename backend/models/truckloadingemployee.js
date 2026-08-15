const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TruckLoadingEmployee extends Model {
    static associate(models) {
      TruckLoadingEmployee.belongsTo(models.TruckLoadingLog, { foreignKey: 'log_id', as: 'Log' });
      TruckLoadingEmployee.belongsTo(models.Employee,        { foreignKey: 'employee_id', as: 'Employee' });
    }
  }
  TruckLoadingEmployee.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    log_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    // This employee's own list of 'YYYY-MM-DD' strings they earn commission
    // for on this log — not a boolean flag, so someone who only worked part of
    // the month at this mine is credited for exactly their days.
    //
    // NULL is meaningfully different from []: NULL means "every day logged on
    // this log, including days entered later" (the common full-month case,
    // which is why it's the default and costs zero clicks), while a stored
    // empty array credits nothing at all.
    credited_days: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    // What THIS employee earns on THIS log — snapshotted when they're added
    // (pre-filled from their profile default, falling back to the log default)
    // and never re-read from either afterwards. Editing an employee's profile
    // rate, or the log's default, must not silently rewrite a row that has
    // already been used to pay a month out.
    //
    // The two bases are independent and additive: an employee with both enabled
    // earns trucks × truck_rate + tons × ton_rate over their credited days.
    truck_rate_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    truck_rate: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0
    },
    ton_rate_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    ton_rate: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'TruckLoadingEmployee',
    tableName: 'truck_loading_employees',
    underscored: true
  });
  return TruckLoadingEmployee;
};
