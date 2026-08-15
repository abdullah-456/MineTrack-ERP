'use strict';

/**
 * Seeds the 'truck_loading' permission module (create/read/update/delete) and
 * grants it to super_admin and admin, following the exact pattern in
 * 20260816000001-attendance-permissions.js.
 *
 * Its own module rather than piggybacking on 'branches' (mines): logging trucks
 * and setting a commission rate is a payroll-affecting data-entry job, and a
 * site clerk who should do it has no business editing the mine record itself.
 * The Roles admin page reads this table dynamically, so it becomes assignable
 * to any role with no frontend change.
 */
module.exports = {
  up: async (queryInterface) => {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'truck_loading'`,
    );
    if (existing.length > 0) return;

    const actions = ['create', 'read', 'update', 'delete'];
    await queryInterface.bulkInsert('permissions', actions.map(action => ({
      module: 'truck_loading', action, created_at: new Date(), updated_at: new Date(),
    })));

    const [perms] = await queryInterface.sequelize.query(
      `SELECT id, action FROM permissions WHERE module = 'truck_loading'`,
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
      `SELECT id FROM permissions WHERE module = 'truck_loading'`,
    );
    if (perms.length > 0) {
      const ids = perms.map(p => p.id).join(',');
      await queryInterface.sequelize.query(`DELETE FROM role_permissions WHERE permission_id IN (${ids})`);
      await queryInterface.sequelize.query(`DELETE FROM permissions WHERE module = 'truck_loading'`);
    }
  },
};
