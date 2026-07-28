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
      autoIncrement: true,
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    employment_id: {
      type: DataTypes.STRING(40),
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    father_name: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    gender: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    designation: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    cnic: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    cnic_normalized: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    cnic_expiry: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    home_tel: {
      type: DataTypes.STRING(40),
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    date_of_birth: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    age: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    place_of_birth: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    marital_status: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    religion: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },
    language: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },
    emergency_name: { type: DataTypes.STRING(120), allowNull: true },
    emergency_relation: { type: DataTypes.STRING(60), allowNull: true },
    emergency_cell: { type: DataTypes.STRING(40), allowNull: true },
    emergency_residence: { type: DataTypes.STRING(40), allowNull: true },
    education_institute: { type: DataTypes.STRING(160), allowNull: true },
    education_degree: { type: DataTypes.STRING(120), allowNull: true },
    education_specialization: { type: DataTypes.STRING(120), allowNull: true },
    education_grade: { type: DataTypes.STRING(60), allowNull: true },
    education_year: { type: DataTypes.STRING(10), allowNull: true },
    experience: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    dependants: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    remarks: { type: DataTypes.TEXT, allowNull: true },
    hr_remarks: { type: DataTypes.TEXT, allowNull: true },
    basic_salary: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    hire_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    branch_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('active', 'suspended', 'terminated'),
      defaultValue: 'active',
    },
    current_payable: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00,
    },
    terminated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    termination_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'Employee',
    tableName: 'employees',
    underscored: true,
  });
  return Employee;
};
