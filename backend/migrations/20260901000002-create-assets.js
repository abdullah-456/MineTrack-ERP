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
    if (!(await tableExists(queryInterface, 'assets'))) {
      await queryInterface.createTable('assets', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        shop_id: { type: Sequelize.INTEGER, allowNull: false },
        branch_id: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'branches', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
        },
        asset_name: { type: Sequelize.STRING(160), allowNull: false },
        category: { type: Sequelize.STRING(60), allowNull: false },
        asset_code: { type: Sequelize.STRING(40), allowNull: true },
        purchase_date: { type: Sequelize.DATEONLY, allowNull: false },
        purchase_cost: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
        salvage_value: { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
        useful_life_years: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
        is_paid: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        paid_via: { type: Sequelize.STRING(10), allowNull: true },
        bank_account_id: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'bank_accounts', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
        },
        fixed_asset_account_id: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'chart_of_accounts', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
        },
        voucher_id: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'vouchers', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
        },
        insurance_provider: { type: Sequelize.STRING(160), allowNull: true },
        insurance_policy_number: { type: Sequelize.STRING(80), allowNull: true },
        insurance_premium: { type: Sequelize.DECIMAL(14, 2), allowNull: true },
        insurance_expiry: { type: Sequelize.DATEONLY, allowNull: true },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'active' },
        disposal_date: { type: Sequelize.DATEONLY, allowNull: true },
        disposal_value: { type: Sequelize.DECIMAL(14, 2), allowNull: true },
        disposal_via: { type: Sequelize.STRING(10), allowNull: true },
        disposal_bank_account_id: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'bank_accounts', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
        },
        disposal_voucher_id: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'vouchers', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
        },
        disposal_notes: { type: Sequelize.TEXT, allowNull: true },
        notes: { type: Sequelize.TEXT, allowNull: true },
        created_by: { type: Sequelize.INTEGER, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
      await queryInterface.addIndex('assets', ['shop_id']);
      await queryInterface.addIndex('assets', ['shop_id', 'status']);
    }

    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'assets'`,
    );
    if (existing.length === 0) {
      const actions = ['create', 'read', 'update', 'delete'];
      await queryInterface.bulkInsert('permissions', actions.map(action => ({
        module: 'assets', action, created_at: new Date(), updated_at: new Date(),
      })));

      const [perms] = await queryInterface.sequelize.query(
        `SELECT id, action FROM permissions WHERE module = 'assets'`,
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

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'assets')) {
      await queryInterface.dropTable('assets');
    }

    const [perms] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'assets'`,
    );
    if (perms.length > 0) {
      const ids = perms.map(p => p.id).join(',');
      await queryInterface.sequelize.query(`DELETE FROM role_permissions WHERE permission_id IN (${ids})`);
      await queryInterface.sequelize.query(`DELETE FROM permissions WHERE module = 'assets'`);
    }
  },
};
