'use strict';

/**
 * Board of Directors module: a simple CRUD registry of BOD members
 * (name, phone, cnic, address) per shop. Also seeds the 'board_directors'
 * permission module (create/read/update/delete) and grants it to
 * super_admin (which bypasses permission checks entirely anyway) and admin,
 * matching the pattern in the original roles/permissions seeder.
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
    const now = { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };

    if (!(await tableExists(queryInterface, 'board_members'))) {
      await queryInterface.createTable('board_members', {
        id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        shop_id:    { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' } },
        name:       { type: DataTypes.STRING, allowNull: false },
        phone:      { type: DataTypes.STRING, allowNull: true },
        cnic:       { type: DataTypes.STRING, allowNull: true, unique: true },
        address:    { type: DataTypes.TEXT, allowNull: true },
        created_at: now,
        updated_at: now,
      });
    }

    // ── Permissions: create the module if it doesn't already exist ──────────
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'board_directors'`,
    );
    if (existing.length === 0) {
      const actions = ['create', 'read', 'update', 'delete'];
      await queryInterface.bulkInsert('permissions', actions.map(action => ({
        module: 'board_directors', action, created_at: new Date(), updated_at: new Date(),
      })));

      const [perms] = await queryInterface.sequelize.query(
        `SELECT id, action FROM permissions WHERE module = 'board_directors'`,
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

  down: async (queryInterface) => {
    const [perms] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'board_directors'`,
    );
    if (perms.length > 0) {
      const ids = perms.map(p => p.id).join(',');
      await queryInterface.sequelize.query(`DELETE FROM role_permissions WHERE permission_id IN (${ids})`);
      await queryInterface.sequelize.query(`DELETE FROM permissions WHERE module = 'board_directors'`);
    }
    if (await tableExists(queryInterface, 'board_members')) {
      await queryInterface.dropTable('board_members');
    }
  },
};
