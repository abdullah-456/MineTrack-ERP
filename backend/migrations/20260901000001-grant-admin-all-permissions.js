'use strict';

/**
 * Admin is the shop-level super admin — it should hold every permission
 * except platform-level shop management, which is separately gated by the
 * hardcoded `superAdminOnly` route guard (role === 'super_admin'), not by
 * the permissions table. Granting the 'shops' permission rows here is safe:
 * it doesn't unlock that guard. Backfills every permission admin is
 * currently missing (accounting.approve, accounting.fiscal_year.close,
 * shops.*) — idempotent, only inserts grants that don't already exist.
 */

module.exports = {
  up: async (queryInterface) => {
    const [[adminRole]] = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE name = 'admin'`,
    );
    if (!adminRole) return;

    const [missing] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE id NOT IN (
         SELECT permission_id FROM role_permissions WHERE role_id = ${adminRole.id}
       )`,
    );
    if (missing.length === 0) return;

    await queryInterface.bulkInsert(
      'role_permissions',
      missing.map(p => ({ role_id: adminRole.id, permission_id: p.id })),
    );
  },

  down: async (queryInterface) => {
    const [[adminRole]] = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE name = 'admin'`,
    );
    if (!adminRole) return;

    await queryInterface.sequelize.query(
      `DELETE FROM role_permissions
       WHERE role_id = ${adminRole.id}
         AND permission_id IN (
           SELECT id FROM permissions
           WHERE (module = 'accounting' AND action IN ('approve', 'fiscal_year.close'))
              OR module = 'shops'
         )`,
    );
  },
};
