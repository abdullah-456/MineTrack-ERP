'use strict';

/**
 * Seeds the 'attendance' permission module (create/read/update/delete) and
 * grants it to super_admin (bypasses checks anyway) and admin, matching the
 * pattern in 20260719000000-branches-permissions.js. Marking attendance is
 * functionally distinct from editing an employee record (a branch manager
 * might reasonably mark attendance without full employees:update rights), so
 * it gets its own module rather than piggybacking on 'employees' the way
 * Payroll currently does. The Roles admin page reads this table dynamically,
 * so it becomes assignable to any role with no frontend changes.
 */

module.exports = {
  up: async (queryInterface) => {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'attendance'`,
    );
    if (existing.length > 0) return;

    const actions = ['create', 'read', 'update', 'delete'];
    await queryInterface.bulkInsert('permissions', actions.map(action => ({
      module: 'attendance', action, created_at: new Date(), updated_at: new Date(),
    })));

    const [perms] = await queryInterface.sequelize.query(
      `SELECT id, action FROM permissions WHERE module = 'attendance'`,
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
      `SELECT id FROM permissions WHERE module = 'attendance'`,
    );
    if (perms.length > 0) {
      const ids = perms.map(p => p.id).join(',');
      await queryInterface.sequelize.query(`DELETE FROM role_permissions WHERE permission_id IN (${ids})`);
      await queryInterface.sequelize.query(`DELETE FROM permissions WHERE module = 'attendance'`);
    }
  },
};
