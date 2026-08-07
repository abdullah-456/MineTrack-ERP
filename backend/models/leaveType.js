const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LeaveType extends Model {
    static associate(models) {
      LeaveType.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      LeaveType.hasMany(models.LeaveRecord, { foreignKey: 'leave_type_id' });
      LeaveType.hasMany(models.Attendance, { foreignKey: 'leave_type_id' });
    }
  }
  LeaveType.init({
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
      type: DataTypes.STRING(80),
      allowNull: false
    },
    is_paid: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    default_annual_days: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'LeaveType',
    tableName: 'leave_types',
    underscored: true
  });
  return LeaveType;
};
