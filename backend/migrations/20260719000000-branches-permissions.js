'use strict';

/**
 * Seeds the 'branches' permission module (create/read/update/delete) and
 * grants it to super_admin (bypasses checks anyway) and admin, matching the
 * pattern in 20260718000000-board-of-directors.js. The `branches` table
 * itself already exists (created in the original schema migration) — this
 * migration only adds the missing permission gate so branch management can
 * be exposed as a real CRUD module instead of piggybacking on 'users:read'.
 */

module.exports = {
  up: async (queryInterface) => {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'branches'`,
    );
    if (existing.length > 0) return;

    const actions = ['create', 'read', 'update', 'delete'];
    await queryInterface.bulkInsert('permissions', actions.map(action => ({
      module: 'branches', action, created_at: new Date(), updated_at: new Date(),
    })));

    const [perms] = await queryInterface.sequelize.query(
      `SELECT id, action FROM permissions WHERE module = 'branches'`,
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
  },

  down: async (queryInterface) => {
    const [perms] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'branches'`,
    );
    if (perms.length > 0) {
      const ids = perms.map(p => p.id).join(',');
      await queryInterface.sequelize.query(`DELETE FROM role_permissions WHERE permission_id IN (${ids})`);
      await queryInterface.sequelize.query(`DELETE FROM permissions WHERE module = 'branches'`);
    }
  },
};
