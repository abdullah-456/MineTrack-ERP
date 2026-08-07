const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LeaveRecord extends Model {
    static associate(models) {
      LeaveRecord.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      LeaveRecord.belongsTo(models.Employee, { foreignKey: 'employee_id' });
      LeaveRecord.belongsTo(models.LeaveType, { foreignKey: 'leave_type_id', as: 'LeaveType' });
      LeaveRecord.belongsTo(models.User, { foreignKey: 'created_by', as: 'CreatedBy' });
    }
  }
  LeaveRecord.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    leave_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'LeaveRecord',
    tableName: 'leave_records',
    underscored: true
  });
  return LeaveRecord;
};
