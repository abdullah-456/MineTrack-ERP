'use strict';

/**
 * purchase_invoices.grn_id still references goods_receipt_notes, but the GRN /
 * purchase-order sub-module was removed (20260728000000-remove-purchase-orders.js).
 * Any INSERT into purchase_invoices — stock receipt with a supplier, or a new
 * product with supplier + initial quantity — fails with:
 *   SQLITE_ERROR: no such table: main.goods_receipt_notes
 *
 * Rebuild grn_id as a plain nullable INTEGER with no FK.
 */

async function tableExists(queryInterface, table) {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

async function rebuildPurchaseInvoicesSqlite(queryInterface) {
  await queryInterface.sequelize.query('PRAGMA foreign_keys = OFF;');
  await queryInterface.sequelize.query(`
    CREATE TABLE purchase_invoices_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE NO ACTION ON UPDATE CASCADE,
      grn_id INTEGER,
      invoice_number VARCHAR(255) NOT NULL,
      invoice_date DATETIME NOT NULL,
      due_date DATETIME,
      amount DECIMAL(15,2) NOT NULL,
      status TEXT DEFAULT 'unpaid',
      voucher_id INTEGER REFERENCES vouchers(id) ON DELETE SET NULL ON UPDATE CASCADE,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `);
  await queryInterface.sequelize.query(`
    INSERT INTO purchase_invoices_new
      (id, supplier_id, grn_id, invoice_number, invoice_date, due_date, amount, status, voucher_id, created_at, updated_at)
    SELECT
      id, supplier_id, grn_id, invoice_number, invoice_date, due_date, amount, status, voucher_id, created_at, updated_at
    FROM purchase_invoices
  `);
  await queryInterface.sequelize.query('DROP TABLE purchase_invoices');
  await queryInterface.sequelize.query('ALTER TABLE purchase_invoices_new RENAME TO purchase_invoices');
  await queryInterface.sequelize.query('PRAGMA foreign_keys = ON;');
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    if (!(await tableExists(queryInterface, 'purchase_invoices'))) return;

    const dialect = queryInterface.sequelize.getDialect();
    const { DataTypes } = Sequelize;

    try {
      if (dialect === 'sqlite') {
        const [[{ sql }]] = await queryInterface.sequelize.query(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='purchase_invoices'"
        );
        if (!sql || !sql.includes('goods_receipt_notes')) {
          console.log('  skip: purchase_invoices.grn_id already has no goods_receipt_notes FK');
          return;
        }
        await rebuildPurchaseInvoicesSqlite(queryInterface);
      } else if (dialect === 'mysql') {
        const [fks] = await queryInterface.sequelize.query(`
          SELECT CONSTRAINT_NAME
          FROM information_schema.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'purchase_invoices'
            AND COLUMN_NAME = 'grn_id'
            AND REFERENCED_TABLE_NAME IS NOT NULL
        `);
        for (const fk of fks) {
          await queryInterface.removeConstraint('purchase_invoices', fk.CONSTRAINT_NAME);
        }
        await queryInterface.changeColumn('purchase_invoices', 'grn_id', {
          type: DataTypes.INTEGER,
          allowNull: true,
        });
      } else {
        await queryInterface.changeColumn('purchase_invoices', 'grn_id', {
          type: DataTypes.INTEGER,
          allowNull: true,
        });
      }
      console.log('  ok: purchase_invoices.grn_id — orphaned goods_receipt_notes FK removed');
    } catch (err) {
      console.warn(`  skipped purchase_invoices.grn_id (${err.message.split('\n')[0]})`);
      if (dialect === 'sqlite') {
        await queryInterface.sequelize.query('PRAGMA foreign_keys = ON;');
      }
    }
  },

  down: async () => {
    // Irreversible: goods_receipt_notes no longer exists.
  },
};
