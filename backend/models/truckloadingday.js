const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TruckLoadingDay extends Model {
    static associate(models) {
      TruckLoadingDay.belongsTo(models.TruckLoadingLog, { foreignKey: 'log_id', as: 'Log' });
    }
  }
  TruckLoadingDay.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    log_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    trucks: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    // Tonnage moved on the same day. Kept on this row rather than in a second
    // table because an employee's credited-day tick has to count that day's
    // trucks AND tons together — two tables would let the same date exist in
    // one and not the other.
    tons: {
      type: DataTypes.DECIMAL(15, 3),
      defaultValue: 0
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'TruckLoadingDay',
    tableName: 'truck_loading_days',
    underscored: true
  });
  return TruckLoadingDay;
};
