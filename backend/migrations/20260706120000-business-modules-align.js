'use strict';

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

    // ── suppliers ─────────────────────────────────────────────
    await ensureColumn(queryInterface, Sequelize, 'suppliers', 'supplier_code', { type: DataTypes.STRING, allowNull: true });
    await ensureColumn(queryInterface, Sequelize, 'suppliers', 'company_name', { type: DataTypes.STRING, allowNull: true });
    await ensureColumn(queryInterface, Sequelize, 'suppliers', 'contact_person', { type: DataTypes.STRING, allowNull: true });
    await ensureColumn(queryInterface, Sequelize, 'suppliers', 'tax_number', { type: DataTypes.STRING, allowNull: true });
    await ensureColumn(queryInterface, Sequelize, 'suppliers', 'payment_terms', { type: DataTypes.STRING, allowNull: true });
    await ensureColumn(queryInterface, Sequelize, 'suppliers', 'credit_limit', { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 });
    await ensureColumn(queryInterface, Sequelize, 'suppliers', 'status', { type: DataTypes.STRING, defaultValue: 'active' });

    if (await tableExists(queryInterface, 'suppliers')) {
      await queryInterface.sequelize.query(`
        UPDATE suppliers SET company_name = COALESCE(company_name, name),
        supplier_code = COALESCE(supplier_code, 'SUP-' || printf('%04d', id))
        WHERE company_name IS NULL OR supplier_code IS NULL
      `).catch(() => {});
    }

    // ── customers ─────────────────────────────────────────────
    await ensureColumn(queryInterface, Sequelize, 'customers', 'credit_limit', { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 });
    await ensureColumn(queryInterface, Sequelize, 'customers', 'current_balance', { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 });
    await ensureColumn(queryInterface, Sequelize, 'customers', 'status', { type: DataTypes.STRING, defaultValue: 'active' });

    if (await tableExists(queryInterface, 'customers')) {
      await queryInterface.sequelize.query(`
        UPDATE customers SET current_balance = COALESCE(current_balance, opening_balance, 0)
        WHERE current_balance IS NULL
      `).catch(() => {});
    }

    // ── employees ─────────────────────────────────────────────
    await ensureColumn(queryInterface, Sequelize, 'employees', 'basic_salary', { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 });
    await ensureColumn(queryInterface, Sequelize, 'employees', 'hire_date', { type: DataTypes.DATE, allowNull: true });

    if (await tableExists(queryInterface, 'employees')) {
      await queryInterface.sequelize.query(`
        UPDATE employees SET basic_salary = COALESCE(basic_salary, base_salary, 0),
        hire_date = COALESCE(hire_date, date_of_joining)
        WHERE basic_salary IS NULL OR hire_date IS NULL
      `).catch(() => {});
    }

    // ── categories ────────────────────────────────────────────
    await ensureColumn(queryInterface, Sequelize, 'categories', 'parent_category_id', { type: DataTypes.INTEGER, allowNull: true });
    if (await tableExists(queryInterface, 'categories')) {
      await queryInterface.sequelize.query(`
        UPDATE categories SET parent_category_id = parent_id WHERE parent_category_id IS NULL AND parent_id IS NOT NULL
      `).catch(() => {});
    }

    // ── products ──────────────────────────────────────────────
    await ensureColumn(queryInterface, Sequelize, 'products', 'brand', { type: DataTypes.STRING, allowNull: true });
    await ensureColumn(queryInterface, Sequelize, 'products', 'tax_rate', { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 });
    await ensureColumn(queryInterface, Sequelize, 'products', 'reorder_level', { type: DataTypes.INTEGER, defaultValue: 5 });
    await ensureColumn(queryInterface, Sequelize, 'products', 'cost_price', { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 });
    await ensureColumn(queryInterface, Sequelize, 'products', 'image_url', { type: DataTypes.STRING, allowNull: true });

    if (await tableExists(queryInterface, 'products')) {
      await queryInterface.sequelize.query(`
        UPDATE products SET cost_price = COALESCE(cost_price, purchase_price, 0),
        reorder_level = COALESCE(reorder_level, min_stock_level, 5),
        sku = COALESCE(sku, 'SKU-' || printf('%05d', id))
        WHERE cost_price IS NULL OR sku IS NULL
      `).catch(() => {});
    }

    // ── sales ─────────────────────────────────────────────────
    await ensureColumn(queryInterface, Sequelize, 'sales', 'cashier_id', { type: DataTypes.INTEGER, allowNull: true });
    await ensureColumn(queryInterface, Sequelize, 'sales', 'sale_type', { type: DataTypes.STRING, defaultValue: 'cash' });
    await ensureColumn(queryInterface, Sequelize, 'sales', 'tax', { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 });

    if (await tableExists(queryInterface, 'sales')) {
      await queryInterface.sequelize.query(`
        UPDATE sales SET cashier_id = COALESCE(cashier_id, user_id),
        sale_type = COALESCE(sale_type, payment_method, 'cash')
        WHERE cashier_id IS NULL
      `).catch(() => {});
    }

    // ── sale_items ────────────────────────────────────────────
    await ensureColumn(queryInterface, Sequelize, 'sale_items', 'line_total', { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 });
    if (await tableExists(queryInterface, 'sale_items')) {
      await queryInterface.sequelize.query(`
        UPDATE sale_items SET line_total = COALESCE(line_total, total, 0) WHERE line_total IS NULL OR line_total = 0
      `).catch(() => {});
    }

    // ── stock (branch inventory / current stock) ────────────
    if (!(await tableExists(queryInterface, 'stock'))) {
      await queryInterface.createTable('stock', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        product_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'products', key: 'id' }, onDelete: 'CASCADE' },
        branch_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'branches', key: 'id' }, onDelete: 'CASCADE' },
        quantity_on_hand: { type: DataTypes.INTEGER, defaultValue: 0 },
        quantity_reserved: { type: DataTypes.INTEGER, defaultValue: 0 },
        created_at: now,
        updated_at: now,
      });
      await queryInterface.addIndex('stock', ['product_id', 'branch_id'], { unique: true, name: 'stock_product_branch_unique' });
    }

    // ── stock_movements ───────────────────────────────────────
    if (!(await tableExists(queryInterface, 'stock_movements'))) {
      await queryInterface.createTable('stock_movements', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        product_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'products', key: 'id' } },
        branch_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'branches', key: 'id' } },
        ref_type: { type: DataTypes.STRING, allowNull: false },
        ref_id: { type: DataTypes.INTEGER, allowNull: false },
        quantity: { type: DataTypes.INTEGER, allowNull: false },
        balance_after: { type: DataTypes.INTEGER, allowNull: false },
        created_at: now,
      });
    }

    // ── product_suppliers ─────────────────────────────────────
    if (!(await tableExists(queryInterface, 'product_suppliers'))) {
      await queryInterface.createTable('product_suppliers', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        product_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'products', key: 'id' }, onDelete: 'CASCADE' },
        supplier_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'suppliers', key: 'id' }, onDelete: 'CASCADE' },
        supplier_product_code: { type: DataTypes.STRING, allowNull: true },
        supplier_barcode: { type: DataTypes.STRING, allowNull: true },
        purchase_price: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        currency: { type: DataTypes.STRING, defaultValue: 'PKR' },
        minimum_order_quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
        lead_time_days: { type: DataTypes.INTEGER, defaultValue: 0 },
        preferred_supplier: { type: DataTypes.BOOLEAN, defaultValue: false },
        last_purchase_price: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
        last_purchase_date: { type: DataTypes.DATE, allowNull: true },
        status: { type: DataTypes.STRING, defaultValue: 'active' },
        created_at: now,
        updated_at: now,
      });
      await queryInterface.addIndex('product_suppliers', ['product_id', 'supplier_id'], { unique: true, name: 'product_supplier_unique' });
    }

    // ── payments ──────────────────────────────────────────────
    if (!(await tableExists(queryInterface, 'payments'))) {
      await queryInterface.createTable('payments', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        sale_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'sales', key: 'id' }, onDelete: 'CASCADE' },
        amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
        payment_method: { type: DataTypes.STRING, allowNull: false },
        payment_date: { type: DataTypes.DATE, allowNull: false },
        voucher_id: { type: DataTypes.INTEGER, allowNull: true },
        created_at: now,
        updated_at: now,
      });
    }
  },

  down: async (queryInterface) => {
    const tables = ['payments', 'product_suppliers', 'stock_movements', 'stock'];
    for (const table of tables) {
      if (await tableExists(queryInterface, table)) {
        await queryInterface.dropTable(table);
      }
    }
  },
};
