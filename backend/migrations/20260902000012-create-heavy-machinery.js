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
    if (!(await tableExists(queryInterface, 'heavy_machinery'))) {
      await queryInterface.createTable('heavy_machinery', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        shop_id: { type: Sequelize.INTEGER, allowNull: false },
        machine_code: { type: Sequelize.STRING(40), allowNull: false },
        name: { type: Sequelize.STRING(160), allowNull: false },
        machine_type: { type: Sequelize.STRING(30), allowNull: true },
        model: { type: Sequelize.STRING(80), allowNull: true },
        manufacturer: { type: Sequelize.STRING(80), allowNull: true },
        capacity: { type: Sequelize.STRING(40), allowNull: true },
        fuel_type: { type: Sequelize.STRING(30), allowNull: true },
        assigned_branch_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'branches', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'active' },
        acquisition_date: { type: Sequelize.DATEONLY, allowNull: true },
        remarks: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
      await queryInterface.addIndex('heavy_machinery', ['shop_id']);
      await queryInterface.addIndex('heavy_machinery', ['shop_id', 'machine_code'], { unique: true, name: 'heavy_machinery_shop_id_machine_code_unique' });
    }

    if (!(await tableExists(queryInterface, 'heavy_machinery_logs'))) {
      await queryInterface.createTable('heavy_machinery_logs', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        shop_id: { type: Sequelize.INTEGER, allowNull: false },
        heavy_machinery_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'heavy_machinery', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        branch_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'branches', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        log_date: { type: Sequelize.DATEONLY, allowNull: false },
        working_hours: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
        maintenance_hours: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
        fuel_consumed: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        fuel_cost: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        mineral_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'minerals', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        production_quantity: { type: Sequelize.DECIMAL(15, 3), allowNull: false, defaultValue: 0 },
        production_unit: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'kg' },
        notes: { type: Sequelize.TEXT, allowNull: true },
        created_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
      await queryInterface.addIndex('heavy_machinery_logs', ['heavy_machinery_id', 'log_date'], { unique: true, name: 'heavy_machinery_logs_machine_date_unique' });
      await queryInterface.addIndex('heavy_machinery_logs', ['branch_id']);
    }

    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'heavy_machinery'`,
    );
    if (existing.length === 0) {
      const actions = ['create', 'read', 'update', 'delete'];
      await queryInterface.bulkInsert('permissions', actions.map(action => ({
        module: 'heavy_machinery', action, created_at: new Date(), updated_at: new Date(),
      })));

      const [perms] = await queryInterface.sequelize.query(
        `SELECT id, action FROM permissions WHERE module = 'heavy_machinery'`,
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
    for (const table of ['heavy_machinery_logs', 'heavy_machinery']) {
      if (await tableExists(queryInterface, table)) {
        await queryInterface.dropTable(table);
      }
    }

    const [perms] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'heavy_machinery'`,
    );
    if (perms.length > 0) {
      const ids = perms.map(p => p.id).join(',');
      await queryInterface.sequelize.query(`DELETE FROM role_permissions WHERE permission_id IN (${ids})`);
      await queryInterface.sequelize.query(`DELETE FROM permissions WHERE module = 'heavy_machinery'`);
    }
  },
};
