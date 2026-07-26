'use strict';

/**
 * Purchase Orders + Goods Receipt Notes (GRN) procurement module.
 * Reintroduces the purchases permission module removed in 20260728000001.
 */

async function tableExists(queryInterface, table) {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;

    if (!(await tableExists(queryInterface, 'purchase_orders'))) {
      await queryInterface.createTable('purchase_orders', {
        id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        shop_id:         { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' } },
        supplier_id:     { type: DataTypes.INTEGER, allowNull: false, references: { model: 'suppliers', key: 'id' } },
        branch_id:       { type: DataTypes.INTEGER, allowNull: true, references: { model: 'branches', key: 'id' } },
        po_number:       { type: DataTypes.STRING, allowNull: false },
        order_date:      { type: DataTypes.DATEONLY, allowNull: false },
        expected_date:   { type: DataTypes.DATEONLY, allowNull: true },
        vendor_reference:{ type: DataTypes.STRING, allowNull: true },
        subtotal:        { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        discount:        { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        tax:             { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        total:           { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        status:          { type: DataTypes.ENUM('draft', 'sent', 'partially_received', 'received', 'cancelled'), allowNull: false, defaultValue: 'draft' },
        notes:           { type: DataTypes.TEXT, allowNull: true },
        created_by:      { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
        created_at:      { type: DataTypes.DATE, allowNull: false },
        updated_at:      { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex('purchase_orders', ['shop_id', 'po_number'], { unique: true, name: 'purchase_orders_shop_po_number' });
    }

    if (!(await tableExists(queryInterface, 'purchase_order_items'))) {
      await queryInterface.createTable('purchase_order_items', {
        id:                 { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        purchase_order_id:  { type: DataTypes.INTEGER, allowNull: false, references: { model: 'purchase_orders', key: 'id' }, onDelete: 'CASCADE' },
        product_id:         { type: DataTypes.INTEGER, allowNull: false, references: { model: 'products', key: 'id' } },
        quantity_ordered:   { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
        quantity_received:  { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
        unit_cost:          { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        line_total:         { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        notes:              { type: DataTypes.TEXT, allowNull: true },
        created_at:         { type: DataTypes.DATE, allowNull: false },
        updated_at:         { type: DataTypes.DATE, allowNull: false },
      });
    }

    if (!(await tableExists(queryInterface, 'goods_receipt_notes'))) {
      await queryInterface.createTable('goods_receipt_notes', {
        id:                      { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        shop_id:                 { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' } },
        supplier_id:             { type: DataTypes.INTEGER, allowNull: false, references: { model: 'suppliers', key: 'id' } },
        purchase_order_id:       { type: DataTypes.INTEGER, allowNull: true, references: { model: 'purchase_orders', key: 'id' } },
        branch_id:               { type: DataTypes.INTEGER, allowNull: false, references: { model: 'branches', key: 'id' } },
        grn_number:              { type: DataTypes.STRING, allowNull: false },
        receipt_date:          { type: DataTypes.DATE, allowNull: false },
        supplier_invoice_number: { type: DataTypes.STRING, allowNull: true },
        subtotal:                { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        total:                   { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        status:                  { type: DataTypes.ENUM('draft', 'posted'), allowNull: false, defaultValue: 'draft' },
        notes:                   { type: DataTypes.TEXT, allowNull: true },
        received_by:             { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
        posted_at:               { type: DataTypes.DATE, allowNull: true },
        created_at:              { type: DataTypes.DATE, allowNull: false },
        updated_at:              { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex('goods_receipt_notes', ['shop_id', 'grn_number'], { unique: true, name: 'grn_shop_number' });
    }

    if (!(await tableExists(queryInterface, 'goods_receipt_note_items'))) {
      await queryInterface.createTable('goods_receipt_note_items', {
        id:                       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        goods_receipt_note_id:    { type: DataTypes.INTEGER, allowNull: false, references: { model: 'goods_receipt_notes', key: 'id' }, onDelete: 'CASCADE' },
        product_id:               { type: DataTypes.INTEGER, allowNull: false, references: { model: 'products', key: 'id' } },
        purchase_order_item_id:   { type: DataTypes.INTEGER, allowNull: true, references: { model: 'purchase_order_items', key: 'id' } },
        branch_id:                { type: DataTypes.INTEGER, allowNull: false, references: { model: 'branches', key: 'id' } },
        quantity_received:        { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
        unit_cost:                { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        line_total:               { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        created_at:               { type: DataTypes.DATE, allowNull: false },
        updated_at:               { type: DataTypes.DATE, allowNull: false },
      });
    }

    if (!(await tableExists(queryInterface, 'purchase_invoice_items'))) {
      await queryInterface.createTable('purchase_invoice_items', {
        id:                   { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        purchase_invoice_id:  { type: DataTypes.INTEGER, allowNull: false, references: { model: 'purchase_invoices', key: 'id' }, onDelete: 'CASCADE' },
        product_id:           { type: DataTypes.INTEGER, allowNull: true, references: { model: 'products', key: 'id' } },
        description:          { type: DataTypes.STRING, allowNull: false },
        quantity:             { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
        unit_cost:            { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        line_total:           { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        created_at:           { type: DataTypes.DATE, allowNull: false },
        updated_at:           { type: DataTypes.DATE, allowNull: false },
      });
    }

    // Re-seed purchases permissions for existing databases
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'purchases' LIMIT 1`
    );
    if (!existing.length) {
      const now = new Date();
      const actions = ['create', 'read', 'update', 'delete', 'approve'];
      const permRows = actions.map(action => ({
        module: 'purchases',
        action,
        created_at: now,
        updated_at: now,
      }));
      await queryInterface.bulkInsert('permissions', permRows);
      const [perms] = await queryInterface.sequelize.query(`SELECT id FROM permissions WHERE module = 'purchases'`);
      const [roles] = await queryInterface.sequelize.query(`SELECT id, name FROM roles WHERE name IN ('super_admin', 'admin', 'accountant')`);
      const links = [];
      for (const role of roles) {
        for (const perm of perms) {
          links.push({ role_id: role.id, permission_id: perm.id });
        }
      }
      if (links.length) await queryInterface.bulkInsert('role_permissions', links);
    }
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE module = 'purchases')`
    );
    await queryInterface.sequelize.query(`DELETE FROM permissions WHERE module = 'purchases'`);
    for (const table of ['purchase_invoice_items', 'goods_receipt_note_items', 'goods_receipt_notes', 'purchase_order_items', 'purchase_orders']) {
      if (await tableExists(queryInterface, table)) {
        await queryInterface.dropTable(table);
      }
    }
  },
};
