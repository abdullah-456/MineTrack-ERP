'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;

    // ── shops ────────────────────────────────────────────────
    await queryInterface.createTable('shops', {
      id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name:       { type: DataTypes.STRING,  allowNull: false },
      owner_name: { type: DataTypes.STRING,  allowNull: true },
      email:      { type: DataTypes.STRING,  allowNull: true },
      phone:      { type: DataTypes.STRING,  allowNull: true },
      address:    { type: DataTypes.TEXT,    allowNull: true },
      logo_url:   { type: DataTypes.STRING,  allowNull: true },
      status:     { type: DataTypes.ENUM('active','suspended','trial'), defaultValue: 'trial' },
      plan:       { type: DataTypes.ENUM('basic','pro','enterprise'),   defaultValue: 'basic' },
      created_at: { type: DataTypes.DATE,    allowNull: false },
      updated_at: { type: DataTypes.DATE,    allowNull: false }
    });

    // ── roles ────────────────────────────────────────────────
    await queryInterface.createTable('roles', {
      id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name:        { type: DataTypes.STRING,  allowNull: false, unique: true },
      description: { type: DataTypes.TEXT,    allowNull: true },
      created_at:  { type: DataTypes.DATE,    allowNull: false },
      updated_at:  { type: DataTypes.DATE,    allowNull: false }
    });

    // ── permissions ──────────────────────────────────────────
    await queryInterface.createTable('permissions', {
      id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      module:     { type: DataTypes.STRING,  allowNull: false },
      action:     { type: DataTypes.STRING,  allowNull: false },
      created_at: { type: DataTypes.DATE,    allowNull: false },
      updated_at: { type: DataTypes.DATE,    allowNull: false }
    });

    // ── role_permissions ─────────────────────────────────────
    await queryInterface.createTable('role_permissions', {
      role_id:       { type: DataTypes.INTEGER, references: { model: 'roles',       key: 'id' }, onDelete: 'CASCADE' },
      permission_id: { type: DataTypes.INTEGER, references: { model: 'permissions', key: 'id' }, onDelete: 'CASCADE' }
    });

    // ── branches ─────────────────────────────────────────────
    await queryInterface.createTable('branches', {
      id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      shop_id:    { type: DataTypes.INTEGER, references: { model: 'shops', key: 'id' }, onDelete: 'SET NULL', allowNull: true },
      name:       { type: DataTypes.STRING,  allowNull: false },
      address:    { type: DataTypes.TEXT,    allowNull: true },
      phone:      { type: DataTypes.STRING,  allowNull: true },
      is_default: { type: DataTypes.BOOLEAN, defaultValue: false },
      status:     { type: DataTypes.ENUM('active','inactive'), defaultValue: 'active' },
      created_at: { type: DataTypes.DATE,    allowNull: false },
      updated_at: { type: DataTypes.DATE,    allowNull: false }
    });

    // ── users ────────────────────────────────────────────────
    await queryInterface.createTable('users', {
      id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name:          { type: DataTypes.STRING,  allowNull: false },
      email:         { type: DataTypes.STRING,  allowNull: false, unique: true },
      password_hash: { type: DataTypes.STRING,  allowNull: false },
      role_id:       { type: DataTypes.INTEGER, references: { model: 'roles',    key: 'id' } },
      employee_id:   { type: DataTypes.INTEGER, allowNull: true },
      branch_id:     { type: DataTypes.INTEGER, references: { model: 'branches', key: 'id' }, allowNull: true },
      shop_id:       { type: DataTypes.INTEGER, references: { model: 'shops',    key: 'id' }, allowNull: true },
      status:        { type: DataTypes.ENUM('active','disabled'), defaultValue: 'active' },
      last_login_at: { type: DataTypes.DATE,    allowNull: true },
      created_at:    { type: DataTypes.DATE,    allowNull: false },
      updated_at:    { type: DataTypes.DATE,    allowNull: false }
    });

    // ── employees ────────────────────────────────────────────
    await queryInterface.createTable('employees', {
      id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      shop_id:       { type: DataTypes.INTEGER, references: { model: 'shops',    key: 'id' }, allowNull: true },
      branch_id:     { type: DataTypes.INTEGER, references: { model: 'branches', key: 'id' }, allowNull: true },
      name:          { type: DataTypes.STRING,  allowNull: false },
      designation:   { type: DataTypes.STRING,  allowNull: true },
      phone:         { type: DataTypes.STRING,  allowNull: true },
      email:         { type: DataTypes.STRING,  allowNull: true },
      cnic:          { type: DataTypes.STRING,  allowNull: true },
      address:       { type: DataTypes.TEXT,    allowNull: true },
      date_of_joining: { type: DataTypes.DATEONLY, allowNull: true },
      base_salary:   { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      status:        { type: DataTypes.ENUM('active','inactive'), defaultValue: 'active' },
      created_at:    { type: DataTypes.DATE,    allowNull: false },
      updated_at:    { type: DataTypes.DATE,    allowNull: false }
    });

    // ── suppliers ────────────────────────────────────────────
    await queryInterface.createTable('suppliers', {
      id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      shop_id:     { type: DataTypes.INTEGER, references: { model: 'shops', key: 'id' }, allowNull: true },
      name:        { type: DataTypes.STRING,  allowNull: false },
      company:     { type: DataTypes.STRING,  allowNull: true },
      phone:       { type: DataTypes.STRING,  allowNull: true },
      email:       { type: DataTypes.STRING,  allowNull: true },
      address:     { type: DataTypes.TEXT,    allowNull: true },
      balance:     { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      created_at:  { type: DataTypes.DATE,    allowNull: false },
      updated_at:  { type: DataTypes.DATE,    allowNull: false }
    });

    // ── customers ────────────────────────────────────────────
    await queryInterface.createTable('customers', {
      id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      shop_id:       { type: DataTypes.INTEGER, references: { model: 'shops', key: 'id' }, allowNull: true },
      name:          { type: DataTypes.STRING,  allowNull: false },
      phone:         { type: DataTypes.STRING,  allowNull: true },
      cnic:          { type: DataTypes.STRING,  allowNull: true },
      address:       { type: DataTypes.TEXT,    allowNull: true },
      opening_balance: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
      created_at:    { type: DataTypes.DATE,    allowNull: false },
      updated_at:    { type: DataTypes.DATE,    allowNull: false }
    });

    // ── categories ───────────────────────────────────────────
    await queryInterface.createTable('categories', {
      id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name:       { type: DataTypes.STRING,  allowNull: false },
      parent_id:  { type: DataTypes.INTEGER, allowNull: true },
      created_at: { type: DataTypes.DATE,    allowNull: false },
      updated_at: { type: DataTypes.DATE,    allowNull: false }
    });

    // ── products ─────────────────────────────────────────────
    await queryInterface.createTable('products', {
      id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      shop_id:        { type: DataTypes.INTEGER, references: { model: 'shops',      key: 'id' }, allowNull: true },
      category_id:    { type: DataTypes.INTEGER, references: { model: 'categories', key: 'id' }, allowNull: true },
      name:           { type: DataTypes.STRING,  allowNull: false },
      sku:            { type: DataTypes.STRING,  allowNull: true },
      barcode:        { type: DataTypes.STRING,  allowNull: true },
      description:    { type: DataTypes.TEXT,    allowNull: true },
      purchase_price: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
      sale_price:     { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
      stock_quantity: { type: DataTypes.INTEGER, defaultValue: 0 },
      min_stock_level:{ type: DataTypes.INTEGER, defaultValue: 5 },
      unit:           { type: DataTypes.STRING,  defaultValue: 'kg' },
      status:         { type: DataTypes.ENUM('active','inactive'), defaultValue: 'active' },
      created_at:     { type: DataTypes.DATE,    allowNull: false },
      updated_at:     { type: DataTypes.DATE,    allowNull: false }
    });

    // ── sales ────────────────────────────────────────────────
    await queryInterface.createTable('sales', {
      id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      shop_id:        { type: DataTypes.INTEGER, references: { model: 'shops',     key: 'id' }, allowNull: true },
      branch_id:      { type: DataTypes.INTEGER, references: { model: 'branches',  key: 'id' }, allowNull: true },
      customer_id:    { type: DataTypes.INTEGER, references: { model: 'customers', key: 'id' }, allowNull: true },
      user_id:        { type: DataTypes.INTEGER, references: { model: 'users',     key: 'id' }, allowNull: true },
      invoice_number: { type: DataTypes.STRING,  allowNull: true },
      sale_date:      { type: DataTypes.DATEONLY, allowNull: false },
      subtotal:       { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
      discount:       { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
      total:          { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
      paid_amount:    { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
      balance_due:    { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
      payment_method: { type: DataTypes.ENUM('cash','card','installment','bank_transfer'), defaultValue: 'cash' },
      status:         { type: DataTypes.ENUM('completed','held','cancelled'), defaultValue: 'completed' },
      notes:          { type: DataTypes.TEXT,    allowNull: true },
      created_at:     { type: DataTypes.DATE,    allowNull: false },
      updated_at:     { type: DataTypes.DATE,    allowNull: false }
    });

    // ── sale_items ───────────────────────────────────────────
    await queryInterface.createTable('sale_items', {
      id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      sale_id:        { type: DataTypes.INTEGER, references: { model: 'sales',    key: 'id' }, onDelete: 'CASCADE' },
      product_id:     { type: DataTypes.INTEGER, references: { model: 'products', key: 'id' }, allowNull: true },
      product_name:   { type: DataTypes.STRING,  allowNull: false },
      quantity:       { type: DataTypes.INTEGER,  defaultValue: 1 },
      unit_price:     { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
      discount:       { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
      total:          { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
      created_at:     { type: DataTypes.DATE,    allowNull: false },
      updated_at:     { type: DataTypes.DATE,    allowNull: false }
    });

    // ── installment_plans ────────────────────────────────────
    await queryInterface.createTable('installment_plans', {
      id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      sale_id:         { type: DataTypes.INTEGER, references: { model: 'sales',     key: 'id' }, allowNull: true },
      customer_id:     { type: DataTypes.INTEGER, references: { model: 'customers', key: 'id' }, allowNull: true },
      total_amount:    { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
      down_payment:    { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
      installment_amount: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
      total_installments: { type: DataTypes.INTEGER, defaultValue: 0 },
      paid_installments:  { type: DataTypes.INTEGER, defaultValue: 0 },
      start_date:      { type: DataTypes.DATEONLY, allowNull: true },
      status:          { type: DataTypes.ENUM('active','completed','defaulted'), defaultValue: 'active' },
      created_at:      { type: DataTypes.DATE,    allowNull: false },
      updated_at:      { type: DataTypes.DATE,    allowNull: false }
    });

    // ── purchase_orders ──────────────────────────────────────
    await queryInterface.createTable('purchase_orders', {
      id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      shop_id:      { type: DataTypes.INTEGER, references: { model: 'shops',     key: 'id' }, allowNull: true },
      supplier_id:  { type: DataTypes.INTEGER, references: { model: 'suppliers', key: 'id' }, allowNull: true },
      po_number:    { type: DataTypes.STRING,  allowNull: true },
      order_date:   { type: DataTypes.DATEONLY, allowNull: false },
      expected_date:{ type: DataTypes.DATEONLY, allowNull: true },
      total:        { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
      status:       { type: DataTypes.ENUM('draft','sent','received','cancelled'), defaultValue: 'draft' },
      notes:        { type: DataTypes.TEXT,    allowNull: true },
      created_at:   { type: DataTypes.DATE,    allowNull: false },
      updated_at:   { type: DataTypes.DATE,    allowNull: false }
    });

    // ── chart_of_accounts ────────────────────────────────────
    await queryInterface.createTable('chart_of_accounts', {
      id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      account_code:      { type: DataTypes.STRING,  allowNull: false },
      account_name:      { type: DataTypes.STRING,  allowNull: false },
      account_type:      { type: DataTypes.ENUM('asset','liability','equity','income','expense'), allowNull: false },
      parent_account_id: { type: DataTypes.INTEGER, allowNull: true },
      created_at:        { type: DataTypes.DATE,    allowNull: false },
      updated_at:        { type: DataTypes.DATE,    allowNull: false }
    });

    // ── vouchers ─────────────────────────────────────────────
    await queryInterface.createTable('vouchers', {
      id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      shop_id:        { type: DataTypes.INTEGER, references: { model: 'shops', key: 'id' }, allowNull: true },
      voucher_number: { type: DataTypes.STRING,  allowNull: true },
      voucher_type:   { type: DataTypes.ENUM('payment','receipt','journal','contra'), allowNull: false },
      voucher_date:   { type: DataTypes.DATEONLY, allowNull: false },
      description:    { type: DataTypes.TEXT,    allowNull: true },
      total_amount:   { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
      created_by:     { type: DataTypes.INTEGER, allowNull: true },
      created_at:     { type: DataTypes.DATE,    allowNull: false },
      updated_at:     { type: DataTypes.DATE,    allowNull: false }
    });

    // ── audit_logs ───────────────────────────────────────────
    await queryInterface.createTable('audit_logs', {
      id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      user_id:     { type: DataTypes.INTEGER, references: { model: 'users', key: 'id' }, allowNull: true },
      action:      { type: DataTypes.STRING,  allowNull: false },
      entity_type: { type: DataTypes.STRING,  allowNull: true },
      entity_id:   { type: DataTypes.INTEGER, allowNull: true },
      details:     { type: DataTypes.TEXT,    allowNull: true },
      ip_address:  { type: DataTypes.STRING,  allowNull: true },
      created_at:  { type: DataTypes.DATE,    allowNull: false },
      updated_at:  { type: DataTypes.DATE,    allowNull: false }
    });
  },

  down: async (queryInterface) => {
    const tables = [
      'audit_logs', 'vouchers', 'chart_of_accounts', 'purchase_orders',
      'installment_plans', 'sale_items', 'sales', 'products', 'categories',
      'customers', 'suppliers', 'employees', 'users', 'branches',
      'role_permissions', 'permissions', 'roles', 'shops'
    ];
    for (const table of tables) {
      await queryInterface.dropTable(table, { force: true });
    }
  }
};
