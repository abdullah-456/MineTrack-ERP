const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Attendance extends Model {
    static associate(models) {
      Attendance.belongsTo(models.Employee, { foreignKey: 'employee_id' });
      Attendance.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      Attendance.belongsTo(models.Branch, { foreignKey: 'branch_id' });
      Attendance.belongsTo(models.User, { as: 'MarkedBy', foreignKey: 'marked_by' });
      Attendance.belongsTo(models.LeaveType, { foreignKey: 'leave_type_id', as: 'LeaveType' });
    }
  }
  Attendance.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    // Denormalized from the employee — same precedent as
    // EmployeeTransaction.shop_id — so roster queries need no join.
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    branch_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    check_in: {
      type: DataTypes.TIME,
      allowNull: true
    },
    check_out: {
      type: DataTypes.TIME,
      allowNull: true
    },
    // 'half_day' and 'short_leave' are native Postgres enum values added by
    // 20260902000000-attendance-half-day-short-leave.js — changing this list
    // alone is not enough, the database type has to know them too.
    status: {
      type: DataTypes.ENUM('present', 'absent', 'leave', 'half_day', 'short_leave'),
      defaultValue: 'present'
    },
    shift: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    overtime_hours: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0,
    },
    leave_type_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    marked_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'Attendance',
    tableName: 'attendance',
    underscored: true
  });
  return Attendance;
};
