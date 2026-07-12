'use strict';

/**
 * Expenses module: the `expenses` table already exists (synthesized from
 * the Expense model by 20260709000004-align-schema-with-models.js) with
 * category/amount/expense_date/paid_via/voucher_id/branch_id/shop_id, but is
 * missing `description`, `created_by` and a `status` flag for void/reversal
 * tracking (matching the sale_returns convention). This migration adds those
 * columns, seeds a generic "Operating Expenses" COA account to post against,
 * and seeds the 'expenses' permissions module.
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

    if (await tableExists(queryInterface, 'expenses')) {
      const desc = await queryInterface.describeTable('expenses');
      if (!desc.description) {
        await queryInterface.addColumn('expenses', 'description', { type: DataTypes.TEXT, allowNull: true });
      }
      if (!desc.created_by) {
        await queryInterface.addColumn('expenses', 'created_by', { type: DataTypes.INTEGER, allowNull: true });
      }
      if (!desc.status) {
        await queryInterface.addColumn('expenses', 'status', { type: DataTypes.STRING, allowNull: false, defaultValue: 'posted' });
      }
    }

    // ── Chart of Accounts: generic Operating Expenses account ──────────────
    if (await tableExists(queryInterface, 'chart_of_accounts')) {
      const [existing] = await queryInterface.sequelize.query(`SELECT account_code FROM chart_of_accounts;`);
      const existingCodes = new Set(existing.map(r => r.account_code));

      if (!existingCodes.has('07-OPEX')) {
        const [parents] = await queryInterface.sequelize.query(
          `SELECT id, account_code FROM chart_of_accounts WHERE account_code = '07-EXPENSE';`,
        );
        const parentId = parents[0]?.id || null;
        await queryInterface.bulkInsert('chart_of_accounts', [{
          account_code: '07-OPEX',
          account_name: 'Operating Expenses',
          account_type: 'expense',
          parent_account_id: parentId,
          created_at: new Date(),
          updated_at: new Date(),
        }]);
      }
    }

    // ── Permissions: 'expenses' module ──────────────────────────────────────
    const [existingPerms] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'expenses'`,
    );
    if (existingPerms.length === 0) {
      const actions = ['create', 'read', 'update', 'delete'];
      await queryInterface.bulkInsert('permissions', actions.map(action => ({
        module: 'expenses', action, created_at: new Date(), updated_at: new Date(),
      })));

      const [perms] = await queryInterface.sequelize.query(
        `SELECT id, action FROM permissions WHERE module = 'expenses'`,
      );
      const [roles] = await queryInterface.sequelize.query(
        `SELECT id, name FROM roles WHERE name IN ('super_admin', 'admin', 'accountant')`,
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
      `SELECT id FROM permissions WHERE module = 'expenses'`,
    );
    if (perms.length > 0) {
      const ids = perms.map(p => p.id).join(',');
      await queryInterface.sequelize.query(`DELETE FROM role_permissions WHERE permission_id IN (${ids})`);
      await queryInterface.sequelize.query(`DELETE FROM permissions WHERE module = 'expenses'`);
    }

    if (await tableExists(queryInterface, 'chart_of_accounts')) {
      await queryInterface.bulkDelete('chart_of_accounts', { account_code: '07-OPEX' });
    }

    if (await tableExists(queryInterface, 'expenses')) {
      const desc = await queryInterface.describeTable('expenses');
      if (desc.description) await queryInterface.removeColumn('expenses', 'description');
      if (desc.created_by) await queryInterface.removeColumn('expenses', 'created_by');
      if (desc.status) await queryInterface.removeColumn('expenses', 'status');
    }
  },
};
