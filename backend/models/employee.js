const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Employee extends Model {
    static associate(models) {
      Employee.belongsTo(models.Shop,       { foreignKey: 'shop_id' });
      Employee.belongsTo(models.Branch,     { foreignKey: 'branch_id' });
      Employee.belongsTo(models.Designation, { foreignKey: 'designation_id', as: 'Designation' });
      Employee.hasMany(models.Attendance,   { foreignKey: 'employee_id' });
      Employee.hasMany(models.Payroll,      { foreignKey: 'employee_id' });
      Employee.hasOne(models.User,          { foreignKey: 'employee_id' });
      Employee.hasMany(models.EmployeeTransaction, { foreignKey: 'employee_id' });
      Employee.hasMany(models.EmployeeLoan,        { foreignKey: 'employee_id' });
      Employee.hasMany(models.EmployeeDocument,    { foreignKey: 'employee_id' });
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
    designation_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    shift: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    overtime_rate: {
      type: DataTypes.DECIMAL(10, 2),
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
    // An employee is EITHER salary-based (fixed monthly basic_salary) OR
    // daily-wage-based (daily_wage × paid days that month). Exactly one of the
    // two amounts is required — enforced in employeeController validation, not
    // at the DB level, so a row written before this column existed can still be
    // updated for unrelated reasons without being rejected.
    // Deliberately a plain STRING rather than a native DB enum (unlike
    // `status` below): a native Postgres enum needs an ALTER TYPE migration
    // before a new value can even be inserted, which is exactly the trap the
    // attendance status enum hit. Allowed values are validated in
    // employeeController instead.
    employment_type: {
      type: DataTypes.STRING(20),
      defaultValue: 'salary',
      allowNull: false,
    },
    basic_salary: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
    },
    daily_wage: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
    },
    // Truck-loading commission defaults. Two independent bases that stack when
    // both are on: trucks × commission_per_truck + tons × commission_per_ton.
    //
    // These are DEFAULTS, not a hard gate — they pre-fill the employee's row
    // when they're ticked on a Truck Commission log, and that row can still
    // switch either type on or off for that mine/month. What ends up on the row
    // is what gets paid; nothing here is read back at payroll time.
    commission_per_truck_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    commission_per_truck: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
    },
    commission_per_ton_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    commission_per_ton: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
    },
    // Recurring named top-ups on basic_salary — [{ name, amount }] — folded
    // into gross pay every month by employeeLedgerController.runGiveSalary.
    allowances: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
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
    // The other end of the lifecycle that terminated_at already covered —
    // stamped when the employee is suspended, cleared when they go back to
    // active, so an export can show when a suspension actually took effect.
    suspended_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    termination_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    photo_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    cnic_image_path: {
      type: DataTypes.STRING(500),
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
