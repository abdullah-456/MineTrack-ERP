'use strict';

async function tableExists(queryInterface, table) {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'workshop_items'))) {
      await queryInterface.createTable('workshop_items', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        shop_id: { type: Sequelize.INTEGER, allowNull: false },
        item_code: { type: Sequelize.STRING(40), allowNull: false },
        name: { type: Sequelize.STRING(160), allowNull: false },
        unit: { type: Sequelize.STRING(20), allowNull: false },
        category: { type: Sequelize.STRING(60), allowNull: true },
        unit_price: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'active' },
        remarks: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
      await queryInterface.addIndex('workshop_items', ['shop_id']);
      await queryInterface.addIndex('workshop_items', ['shop_id', 'item_code'], { unique: true, name: 'workshop_items_shop_id_item_code_unique' });
    }

    if (!(await tableExists(queryInterface, 'workshop_stock'))) {
      await queryInterface.createTable('workshop_stock', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        workshop_item_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'workshop_items', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        branch_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'branches', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        quantity_on_hand: { type: Sequelize.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
        avg_cost: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
      await queryInterface.addIndex('workshop_stock', ['workshop_item_id', 'branch_id'], { unique: true, name: 'workshop_stock_item_branch_unique' });
    }

    if (!(await tableExists(queryInterface, 'workshop_stock_movements'))) {
      await queryInterface.createTable('workshop_stock_movements', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        workshop_item_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'workshop_items', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        branch_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'branches', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        ref_type: { type: Sequelize.ENUM('stock_in', 'job_usage', 'adjustment_in', 'adjustment_out'), allowNull: false },
        ref_id: { type: Sequelize.INTEGER, allowNull: true },
        quantity: { type: Sequelize.DECIMAL(12, 3), allowNull: false },
        unit_cost: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        balance_after: { type: Sequelize.DECIMAL(12, 3), allowNull: false },
        note: { type: Sequelize.TEXT, allowNull: true },
        created_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
      await queryInterface.addIndex('workshop_stock_movements', ['workshop_item_id', 'branch_id']);
    }

    if (!(await tableExists(queryInterface, 'workshop_jobs'))) {
      await queryInterface.createTable('workshop_jobs', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        shop_id: { type: Sequelize.INTEGER, allowNull: false },
        job_number: { type: Sequelize.STRING(40), allowNull: false },
        branch_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'branches', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        vehicle_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'vehicles', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        employee_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'employees', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        mechanic_name: { type: Sequelize.STRING(120), allowNull: true },
        date_in: { type: Sequelize.DATEONLY, allowNull: false },
        date_out: { type: Sequelize.DATEONLY, allowNull: true },
        status: { type: Sequelize.ENUM('in_progress', 'completed', 'cancelled'), allowNull: false, defaultValue: 'in_progress' },
        odometer_reading: { type: Sequelize.INTEGER, allowNull: true },
        work_description: { type: Sequelize.TEXT, allowNull: true },
        labor_cost: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        parts_cost: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        total_cost: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        notes: { type: Sequelize.TEXT, allowNull: true },
        created_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
      await queryInterface.addIndex('workshop_jobs', ['shop_id']);
      await queryInterface.addIndex('workshop_jobs', ['shop_id', 'job_number'], { unique: true, name: 'workshop_jobs_shop_id_job_number_unique' });
      await queryInterface.addIndex('workshop_jobs', ['vehicle_id']);
    }

    if (!(await tableExists(queryInterface, 'workshop_job_items'))) {
      await queryInterface.createTable('workshop_job_items', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        workshop_job_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'workshop_jobs', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        workshop_item_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'workshop_items', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        branch_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'branches', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        quantity: { type: Sequelize.DECIMAL(12, 3), allowNull: false },
        unit_cost: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        line_total: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
      await queryInterface.addIndex('workshop_job_items', ['workshop_job_id']);
    }

    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'workshops'`,
    );
    if (existing.length === 0) {
      const actions = ['create', 'read', 'update', 'delete'];
      await queryInterface.bulkInsert('permissions', actions.map(action => ({
        module: 'workshops', action, created_at: new Date(), updated_at: new Date(),
      })));

      const [perms] = await queryInterface.sequelize.query(
        `SELECT id, action FROM permissions WHERE module = 'workshops'`,
      );
      const [roles] = await queryInterface.sequelize.query(
        `SELECT id, name FROM roles WHERE name IN ('super_admin', 'admin')`,
      );

      const rolePermissions = [];
      roles.forEach(role => {
        perms.forEach(p => rolePermissions.push({ role_id: role.id, permission_id: p.id }));
      });
      if (rolePermissions.length > 0) {
        await queryInterface.bulkInsert('role_permissions', rolePermissions);
      }
    }
  },

  async down(queryInterface) {
    for (const table of ['workshop_job_items', 'workshop_jobs', 'workshop_stock_movements', 'workshop_stock', 'workshop_items']) {
      if (await tableExists(queryInterface, table)) {
        await queryInterface.dropTable(table);
      }
    }
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_workshop_stock_movements_ref_type"').catch(() => {});
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_workshop_jobs_status"').catch(() => {});

    const [perms] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'workshops'`,
    );
    if (perms.length > 0) {
      const ids = perms.map(p => p.id).join(',');
      await queryInterface.sequelize.query(`DELETE FROM role_permissions WHERE permission_id IN (${ids})`);
      await queryInterface.sequelize.query(`DELETE FROM permissions WHERE module = 'workshops'`);
    }
  },
};
