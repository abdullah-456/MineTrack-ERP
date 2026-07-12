'use strict';

/**
 * Adds the plumbing for admin-managed roles/permissions and a delete-approval
 * workflow:
 *  - `roles.shop_id` (nullable): NULL = global/system role (super_admin, admin,
 *    accountant, user — shared across the platform, as today). A shop's admin
 *    creating a brand-new role, or editing one of the two editable system
 *    roles (accountant/user) for the first time, gets a row scoped to their
 *    own shop_id (see roleController.js's "fork on first edit").
 *  - `deletion_requests` table: non-admin deletes on the modules listed in
 *    roleController's ADMIN_ONLY approval flow become a pending row here
 *    instead of an immediate mutation; admin/super_admin approve or reject.
 *  - `roles` permission module (create/read/update/delete), granted to
 *    super_admin + admin only — same idempotent pattern as
 *    20260719000000-branches-permissions.js.
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

    if (await tableExists(queryInterface, 'roles')) {
      const desc = await queryInterface.describeTable('roles');
      if (!desc.shop_id) {
        await queryInterface.addColumn('roles', 'shop_id', {
          type: DataTypes.INTEGER, allowNull: true, references: { model: 'shops', key: 'id' },
        });
      }
      // `name` carries a legacy UNIQUE constraint (single column, not composite
      // with shop_id) that a table rebuild would be needed to lift. Rather than
      // risk rebuilding a table with live FK dependents (users.role_id,
      // role_permissions.role_id), per-shop "forked" copies of a global role
      // get a distinct `name` but keep the friendly label in `display_name`
      // (falls back to `name` wherever nothing forked it) — additive column,
      // no rebuild needed.
      if (!desc.display_name) {
        await queryInterface.addColumn('roles', 'display_name', { type: DataTypes.STRING, allowNull: true });
      }
    }

    if (!(await tableExists(queryInterface, 'deletion_requests'))) {
      const now = { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };
      await queryInterface.createTable('deletion_requests', {
        id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        shop_id:        { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' } },
        module:         { type: DataTypes.STRING, allowNull: false },
        entity_id:      { type: DataTypes.INTEGER, allowNull: false },
        entity_label:   { type: DataTypes.STRING, allowNull: true },
        status:         { type: DataTypes.STRING, allowNull: false, defaultValue: 'pending' },
        request_reason: { type: DataTypes.TEXT, allowNull: true },
        requested_by:   { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
        reviewed_by:    { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
        reviewed_at:    { type: DataTypes.DATE, allowNull: true },
        review_note:    { type: DataTypes.TEXT, allowNull: true },
        created_at:     now,
        updated_at:     now,
      });
    }

    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'roles'`,
    );
    if (existing.length === 0) {
      const actions = ['create', 'read', 'update', 'delete'];
      await queryInterface.bulkInsert('permissions', actions.map(action => ({
        module: 'roles', action, created_at: new Date(), updated_at: new Date(),
      })));

      const [perms] = await queryInterface.sequelize.query(
        `SELECT id, action FROM permissions WHERE module = 'roles'`,
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
      `SELECT id FROM permissions WHERE module = 'roles'`,
    );
    if (perms.length > 0) {
      const ids = perms.map(p => p.id).join(',');
      await queryInterface.sequelize.query(`DELETE FROM role_permissions WHERE permission_id IN (${ids})`);
      await queryInterface.sequelize.query(`DELETE FROM permissions WHERE module = 'roles'`);
    }

    if (await tableExists(queryInterface, 'deletion_requests')) {
      await queryInterface.dropTable('deletion_requests');
    }

    if (await tableExists(queryInterface, 'roles')) {
      const desc = await queryInterface.describeTable('roles');
      if (desc.display_name) await queryInterface.removeColumn('roles', 'display_name');
      if (desc.shop_id) await queryInterface.removeColumn('roles', 'shop_id');
    }
  },
};
