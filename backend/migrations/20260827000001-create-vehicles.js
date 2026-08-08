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
    if (!(await tableExists(queryInterface, 'vehicles'))) {
      await queryInterface.createTable('vehicles', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        shop_id: { type: Sequelize.INTEGER, allowNull: false },
        vehicle_number: { type: Sequelize.STRING(40), allowNull: false },
        vehicle_type: { type: Sequelize.STRING(30), allowNull: true },
        owner_name: { type: Sequelize.STRING(160), allowNull: true },
        assigned_branch_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'branches', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        registration_expiry: { type: Sequelize.DATEONLY, allowNull: true },
        insurance_expiry: { type: Sequelize.DATEONLY, allowNull: true },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'active' },
        remarks: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
      await queryInterface.addIndex('vehicles', ['shop_id']);
      await queryInterface.addIndex('vehicles', ['shop_id', 'vehicle_number'], { unique: true, name: 'vehicles_shop_id_vehicle_number_unique' });
    }

    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'vehicles'`,
    );
    if (existing.length === 0) {
      const actions = ['create', 'read', 'update', 'delete'];
      await queryInterface.bulkInsert('permissions', actions.map(action => ({
        module: 'vehicles', action, created_at: new Date(), updated_at: new Date(),
      })));

      const [perms] = await queryInterface.sequelize.query(
        `SELECT id, action FROM permissions WHERE module = 'vehicles'`,
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
    if (await tableExists(queryInterface, 'vehicles')) {
      await queryInterface.dropTable('vehicles');
    }

    const [perms] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'vehicles'`,
    );
    if (perms.length > 0) {
      const ids = perms.map(p => p.id).join(',');
      await queryInterface.sequelize.query(`DELETE FROM role_permissions WHERE permission_id IN (${ids})`);
      await queryInterface.sequelize.query(`DELETE FROM permissions WHERE module = 'vehicles'`);
    }
  },
};
