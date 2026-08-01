const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Attendance extends Model {
    static associate(models) {
      Attendance.belongsTo(models.Employee, { foreignKey: 'employee_id' });
      Attendance.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      Attendance.belongsTo(models.Branch, { foreignKey: 'branch_id' });
      Attendance.belongsTo(models.User, { as: 'MarkedBy', foreignKey: 'marked_by' });
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
    status: {
      type: DataTypes.ENUM('present', 'absent', 'leave'),
      defaultValue: 'present'
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
