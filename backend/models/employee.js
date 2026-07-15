const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Employee extends Model {
    static associate(models) {
      Employee.belongsTo(models.Shop,       { foreignKey: 'shop_id' });
      Employee.belongsTo(models.Branch,     { foreignKey: 'branch_id' });
      Employee.hasMany(models.Attendance,   { foreignKey: 'employee_id' });
      Employee.hasMany(models.Payroll,      { foreignKey: 'employee_id' });
      Employee.hasOne(models.User,          { foreignKey: 'employee_id' });
      Employee.hasMany(models.EmployeeTransaction, { foreignKey: 'employee_id' });
      Employee.hasMany(models.EmployeeLoan,        { foreignKey: 'employee_id' });
    }
  }
  Employee.init({
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
      type: DataTypes.STRING,
      allowNull: false
    },
    designation: {
      type: DataTypes.STRING,
      allowNull: true
    },
    cnic: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    basic_salary: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    hire_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    branch_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('active', 'suspended', 'terminated'),
      defaultValue: 'active'
    },
    current_payable: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    terminated_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    termination_notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Employee',
    tableName: 'employees',
    underscored: true
  });
  return Employee;
};
