const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Payroll extends Model {
    static associate(models) {
      Payroll.belongsTo(models.Employee, { foreignKey: 'employee_id' });
      Payroll.belongsTo(models.Voucher, { foreignKey: 'voucher_id' });
    }
  }
  Payroll.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    month: {
      type: DataTypes.STRING,
      allowNull: false // e.g. "2026-07"
    },
    // Snapshot of Employee.employment_type at the time of this run. Everything
    // below that depends on it (wage_days_paid, daily_wage_rate) is snapshotted
    // for the same reason basic_salary is: moving an employee from daily wage
    // to salary later must not rewrite what a past payslip says was paid.
    employment_type: {
      type: DataTypes.STRING(20),
      defaultValue: 'salary',
      allowNull: false
    },
    // For a daily-wage run, basic_salary holds the computed base pay
    // (wage_days_paid × daily_wage_rate) so every downstream total — gross,
    // tax, net, the ledger voucher — needs no special-casing.
    basic_salary: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    // Both 0 on a salary-based run.
    wage_days_paid: {
      type: DataTypes.DECIMAL(6, 2),
      defaultValue: 0
    },
    daily_wage_rate: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0
    },
    deductions: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    // Portion of `deductions` that came from clearing an uncleared salary
    // advance (see giveSalary) — kept separate so payslips can itemize
    // Advance vs tax Deductions instead of a single combined figure.
    advance_deduction: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    tax_deduction_percent: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00
    },
    tax_deduction: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    bonus: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    // Snapshot of the employee's permanent Employee.allowances sum at the
    // time of this run — stored (not re-read live), same reasoning as why
    // basic_salary itself is snapshotted here rather than joined from Employee.
    allowances_total: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    // One-off allowance entered just for this payroll run (Give Salary form),
    // separate from the employee's recurring allowances above.
    temp_allowance: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    // Optional free-text name for THIS run's temp allowance ("Eid Bonus",
    // "Travel Reimbursement"). The fixed "Temporary Allowance" heading stays
    // everywhere; this is shown next to it in parentheses when set. Only
    // stored when temp_allowance > 0 — a label with no amount behind it would
    // print a line item for nothing.
    temp_allowance_label: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    // Truck-loading commission folded into gross pay this run (see
    // truckLoadingController.calculateCommissionForMonth). Snapshotted like
    // every other figure here — editing a mine's rate next month must not
    // change what this payslip says.
    commission: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    // Human-readable breakdown the commission came from, e.g.
    // "North Mine: 120 trucks × Rs 50" — so the payslip can explain the figure
    // without re-querying the truck-loading tables (which may have changed).
    commission_note: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    // Portion of `deductions` from unpaid absence (see giveSalary) — kept
    // separate, same reasoning as advance_deduction, so payslips can itemize
    // "N days absent × daily rate" instead of a single combined figure.
    attendance_deduction: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    absent_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    leave_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    // Mirrors attendance_deduction/absent_days above — the addition side
    // instead of the deduction side (see runGiveSalary's add_overtime flag).
    overtime_hours: {
      type: DataTypes.DECIMAL(6, 2),
      defaultValue: 0
    },
    overtime_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0
    },
    net_pay: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('draft', 'paid'),
      defaultValue: 'draft'
    },
    voucher_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Payroll',
    tableName: 'payroll',
    underscored: true
  });
  return Payroll;
};
