'use strict';

/**
 * Phase 6: Supplier & Employee Ledger.
 *
 * Adds running-payable columns to suppliers/employees (mirrors the existing
 * customers.current_balance pattern) and four new ledger tables:
 *   - supplier_transactions   (stock received / payments / opening balance / adjustment)
 *   - employee_transactions   (salary due / advances / loans / payments / deductions / opening balance)
 *   - employee_loans          (loan header — isolated from the sales installment tables)
 *   - employee_loan_schedule  (per-installment due rows, mirrors installment_schedule)
 */

async function tableExists(queryInterface, table) {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

async function ensureColumn(queryInterface, Sequelize, table, column, definition) {
  if (!(await tableExists(queryInterface, table))) return;
  const desc = await queryInterface.describeTable(table);
  if (!desc[column]) {
    await queryInterface.addColumn(table, column, definition);
  }
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;
    const now = { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };

    // ── suppliers: payable + credit balance ──────────────────────────
    await ensureColumn(queryInterface, Sequelize, 'suppliers', 'current_payable', { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 });
    await ensureColumn(queryInterface, Sequelize, 'suppliers', 'credit_balance', { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 });

    // ── employees: payable (can go negative) ─────────────────────────
    await ensureColumn(queryInterface, Sequelize, 'employees', 'current_payable', { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 });

    // ── supplier_transactions ─────────────────────────────────────────
    if (!(await tableExists(queryInterface, 'supplier_transactions'))) {
      await queryInterface.createTable('supplier_transactions', {
        id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        shop_id:           { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' } },
        supplier_id:       { type: DataTypes.INTEGER, allowNull: false, references: { model: 'suppliers', key: 'id' }, onDelete: 'CASCADE' },
        date:              { type: DataTypes.DATE, allowNull: false },
        type:              { type: DataTypes.ENUM('stock_received', 'payment_made', 'opening_balance', 'adjustment'), allowNull: false },
        total_amount:      { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        paid_amount:       { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        remaining_amount:  { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        method:            { type: DataTypes.ENUM('cash', 'bank', 'supplier_credit'), allowNull: true },
        stock_batch_id:    { type: DataTypes.INTEGER, allowNull: true, references: { model: 'purchase_invoices', key: 'id' } },
        notes:             { type: DataTypes.TEXT, allowNull: true },
        created_by:        { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
        created_at:        now,
        updated_at:        now,
      });
      await queryInterface.addIndex('supplier_transactions', ['supplier_id', 'date']);
    }

    // ── employee_loans (header) ───────────────────────────────────────
    if (!(await tableExists(queryInterface, 'employee_loans'))) {
      await queryInterface.createTable('employee_loans', {
        id:                     { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        employee_id:            { type: DataTypes.INTEGER, allowNull: false, references: { model: 'employees', key: 'id' }, onDelete: 'CASCADE' },
        principal_amount:       { type: DataTypes.DECIMAL(15, 2), allowNull: false },
        number_of_installments: { type: DataTypes.INTEGER, allowNull: false },
        frequency:              { type: DataTypes.ENUM('weekly', 'monthly'), allowNull: false, defaultValue: 'monthly' },
        start_date:             { type: DataTypes.DATE, allowNull: false },
        status:                 { type: DataTypes.ENUM('active', 'closed'), allowNull: false, defaultValue: 'active' },
        created_by:             { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
        created_at:             now,
        updated_at:             now,
      });
    }

    // ── employee_loan_schedule ─────────────────────────────────────────
    if (!(await tableExists(queryInterface, 'employee_loan_schedule'))) {
      await queryInterface.createTable('employee_loan_schedule', {
        id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        loan_id:         { type: DataTypes.INTEGER, allowNull: false, references: { model: 'employee_loans', key: 'id' }, onDelete: 'CASCADE' },
        installment_no:  { type: DataTypes.INTEGER, allowNull: false },
        due_date:        { type: DataTypes.DATE, allowNull: false },
        due_amount:      { type: DataTypes.DECIMAL(15, 2), allowNull: false },
        status:          { type: DataTypes.ENUM('pending', 'paid', 'overdue'), allowNull: false, defaultValue: 'pending' },
        created_at:      now,
        updated_at:      now,
      });
    }

    // ── employee_transactions ──────────────────────────────────────────
    if (!(await tableExists(queryInterface, 'employee_transactions'))) {
      await queryInterface.createTable('employee_transactions', {
        id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        shop_id:          { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' } },
        employee_id:      { type: DataTypes.INTEGER, allowNull: false, references: { model: 'employees', key: 'id' }, onDelete: 'CASCADE' },
        date:             { type: DataTypes.DATE, allowNull: false },
        type:             { type: DataTypes.ENUM('salary_due', 'advance_given', 'loan_given', 'payment_made', 'deduction', 'opening_balance'), allowNull: false },
        amount:           { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        method:           { type: DataTypes.ENUM('cash', 'bank'), allowNull: true },
        related_loan_id:  { type: DataTypes.INTEGER, allowNull: true, references: { model: 'employee_loans', key: 'id' } },
        notes:            { type: DataTypes.TEXT, allowNull: true },
        created_by:       { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
        created_at:       now,
        updated_at:       now,
      });
      await queryInterface.addIndex('employee_transactions', ['employee_id', 'date']);
    }
  },

  down: async (queryInterface) => {
    const tables = ['employee_transactions', 'employee_loan_schedule', 'employee_loans', 'supplier_transactions'];
    for (const table of tables) {
      if (await tableExists(queryInterface, table)) {
        await queryInterface.dropTable(table);
      }
    }
  },
};
