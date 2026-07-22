'use strict';

/**
 * Originally, only accountant/super_admin could write to accounting (create/
 * update/delete) — admin was read-only, matching the classic "admin runs
 * operations, accountant manages the books" separation of duties. For a small
 * team running both roles as one person, admin now also gets full accounting
 * write access (create/update/delete), on top of the read access it already
 * had. Idempotent — only inserts grants that don't already exist.
 */

module.exports = {
  up: async (queryInterface) => {
    const [perms] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'accounting' AND action IN ('create', 'update', 'delete')`,
    );
    if (perms.length === 0) return;

    const [[adminRole]] = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE name = 'admin'`,
    );
    if (!adminRole) return;

    const [existing] = await queryInterface.sequelize.query(
      `SELECT permission_id FROM role_permissions WHERE role_id = ${adminRole.id} AND permission_id IN (${perms.map(p => p.id).join(',')})`,
    );
    const existingIds = new Set(existing.map(r => r.permission_id));

    const toInsert = perms
      .filter(p => !existingIds.has(p.id))
      .map(p => ({ role_id: adminRole.id, permission_id: p.id }));

    if (toInsert.length > 0) {
      await queryInterface.bulkInsert('role_permissions', toInsert);
    }
  },

  down: async (queryInterface) => {
    const [[adminRole]] = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE name = 'admin'`,
    );
    if (!adminRole) return;

    const [perms] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'accounting' AND action IN ('create', 'update', 'delete')`,
    );
    if (perms.length === 0) return;

    await queryInterface.sequelize.query(
      `DELETE FROM role_permissions WHERE role_id = ${adminRole.id} AND permission_id IN (${perms.map(p => p.id).join(',')})`,
    );
  },
};
