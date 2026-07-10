'use strict';

/**
 * Sales Returns & Exchange module schema.
 *
 * 1. Rebuilds `sale_returns` as a RETURN HEADER (the old table was a single
 *    flat row — product_id/quantity — and has 0 rows in every known DB, so the
 *    rebuild is safe; we still guard by only dropping it when empty).
 * 2. Creates `sale_return_items` (return lines referencing original sale items).
 * 3. Backfills the new 'returns' module permissions + 'sales:override_price'
 *    into EXISTING databases and grants them to roles, mirroring the seeder,
 *    so already-deployed DBs don't need a reseed.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    // ── 1. Rebuild sale_returns as a header ─────────────────────────────
    const tables = await queryInterface.showAllTables();
    if (tables.includes('sale_returns')) {
      const [[{ c }]] = await queryInterface.sequelize.query('SELECT COUNT(*) AS c FROM sale_returns');
      if (Number(c) === 0) {
        await queryInterface.dropTable('sale_returns');
      } else {
        // Extremely defensive: keep legacy data aside instead of destroying it.
        await queryInterface.renameTable('sale_returns', 'sale_returns_legacy');
      }
    }

    await queryInterface.createTable('sale_returns', {
      id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      shop_id:           { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' } },
      sale_id:           { type: DataTypes.INTEGER, allowNull: false, references: { model: 'sales', key: 'id' } },
      customer_id:       { type: DataTypes.INTEGER, allowNull: true,  references: { model: 'customers', key: 'id' } },
      branch_id:         { type: DataTypes.INTEGER, allowNull: false, references: { model: 'branches', key: 'id' } },
      return_number:     { type: DataTypes.STRING,  allowNull: false },
      return_date:       { type: DataTypes.DATE,    allowNull: false },
      return_type:       { type: DataTypes.ENUM('refund', 'exchange'), allowNull: false },
      returned_value:    { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      refund_amount:     { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      exchange_sale_id:  { type: DataTypes.INTEGER, allowNull: true,  references: { model: 'sales', key: 'id' } },
      settlement_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      refund_method:     { type: DataTypes.ENUM('cash', 'card', 'bank', 'mobile_wallet', 'store_credit', 'none'), allowNull: false, defaultValue: 'cash' },
      status:            { type: DataTypes.ENUM('completed', 'void'), allowNull: false, defaultValue: 'completed' },
      processed_by:      { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
      reason:            { type: DataTypes.STRING,  allowNull: true },
      notes:             { type: DataTypes.TEXT,    allowNull: true },
      created_at:        { type: DataTypes.DATE,    allowNull: false },
      updated_at:        { type: DataTypes.DATE,    allowNull: false },
    });
    await queryInterface.addIndex('sale_returns', ['shop_id', 'return_number'], { unique: true, name: 'sale_returns_shop_number_uq' });
    await queryInterface.addIndex('sale_returns', ['sale_id'], { name: 'sale_returns_sale_idx' });
    await queryInterface.addIndex('sale_returns', ['shop_id', 'return_date'], { name: 'sale_returns_shop_date_idx' });

    // ── 2. Return line items ─────────────────────────────────────────────
    await queryInterface.createTable('sale_return_items', {
      id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      return_id:    { type: DataTypes.INTEGER, allowNull: false, references: { model: 'sale_returns', key: 'id' } },
      sale_item_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'sale_items', key: 'id' } },
      product_id:   { type: DataTypes.INTEGER, allowNull: false, references: { model: 'products', key: 'id' } },
      quantity:     { type: DataTypes.INTEGER, allowNull: false },
      unit_price:   { type: DataTypes.DECIMAL(15, 2), allowNull: false },
      line_total:   { type: DataTypes.DECIMAL(15, 2), allowNull: false },
      restock:      { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      condition:    { type: DataTypes.ENUM('resellable', 'damaged'), allowNull: false, defaultValue: 'resellable' },
      created_at:   { type: DataTypes.DATE, allowNull: false },
      updated_at:   { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex('sale_return_items', ['return_id'], { name: 'sri_return_idx' });
    await queryInterface.addIndex('sale_return_items', ['sale_item_id'], { name: 'sri_sale_item_idx' });

    // ── 3. Permissions backfill for EXISTING databases ───────────────────
    // On a FRESH install the permissions table is still empty at migration
    // time (the seeder runs afterwards and already includes the 'returns'
    // module + 'sales:override_price'). Backfilling here too would create
    // duplicates, so we only backfill when the DB has already been seeded.
    const [perms] = await queryInterface.sequelize.query(
      `SELECT id, module, action FROM permissions`
    );
    if (perms.length === 0) return; // fresh DB — seeder will handle permissions
    const have = new Set(perms.map(p => `${p.module}:${p.action}`));
    const now = new Date();
    const toInsert = [];
    ['create', 'read', 'update', 'delete', 'approve'].forEach(a => {
      if (!have.has(`returns:${a}`)) toInsert.push({ module: 'returns', action: a, created_at: now, updated_at: now });
    });
    if (!have.has('sales:override_price')) toInsert.push({ module: 'sales', action: 'override_price', created_at: now, updated_at: now });
    if (toInsert.length) await queryInterface.bulkInsert('permissions', toInsert);

    // Grant to roles (mirrors seeder policy): admin gets all returns actions +
    // override_price; cashier ('user') gets returns create/read.
    const [roles] = await queryInterface.sequelize.query(`SELECT id, name FROM roles`);
    const roleMap = {};
    roles.forEach(r => { roleMap[r.name] = r.id; });

    const [freshPerms] = await queryInterface.sequelize.query(
      `SELECT id, module, action FROM permissions WHERE module = 'returns' OR (module = 'sales' AND action = 'override_price')`
    );
    const [existingRp] = await queryInterface.sequelize.query(`SELECT role_id, permission_id FROM role_permissions`);
    const haveRp = new Set(existingRp.map(rp => `${rp.role_id}:${rp.permission_id}`));

    const rp = [];
    const grant = (roleName, permId) => {
      const rid = roleMap[roleName];
      if (rid && !haveRp.has(`${rid}:${permId}`)) {
        rp.push({ role_id: rid, permission_id: permId });
        haveRp.add(`${rid}:${permId}`);
      }
    };
    freshPerms.forEach(p => {
      if (p.module === 'returns') {
        grant('admin', p.id);
        if (['create', 'read'].includes(p.action)) grant('user', p.id);
        if (p.action === 'read') grant('accountant', p.id);
      }
      if (p.module === 'sales' && p.action === 'override_price') grant('admin', p.id);
      // super_admin bypasses permission checks in middleware, but grant anyway
      grant('super_admin', p.id);
    });
    if (rp.length) await queryInterface.bulkInsert('role_permissions', rp);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sale_return_items');
    await queryInterface.dropTable('sale_returns');
    const tables = await queryInterface.showAllTables();
    if (tables.includes('sale_returns_legacy')) {
      await queryInterface.renameTable('sale_returns_legacy', 'sale_returns');
    }
  },
};
