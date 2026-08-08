'use strict';

async function tableExists(queryInterface, table) {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

// Persisted (not purely computed) so that reading a notification can decrement
// the bell's unread count and have that stick — see notificationSync.js, which
// upserts rows here from live expiry data but never resets is_read on refresh.
module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'notifications'))) {
      await queryInterface.createTable('notifications', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        shop_id: { type: Sequelize.INTEGER, allowNull: false },
        type: { type: Sequelize.STRING(40), allowNull: false },
        source_table: { type: Sequelize.STRING(40), allowNull: false },
        source_id: { type: Sequelize.INTEGER, allowNull: false },
        module_label: { type: Sequelize.STRING(80), allowNull: true },
        owner_label: { type: Sequelize.STRING(160), allowNull: true },
        title: { type: Sequelize.STRING(200), allowNull: false },
        message: { type: Sequelize.STRING(400), allowNull: true },
        due_date: { type: Sequelize.DATEONLY, allowNull: false },
        is_read: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        read_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
      await queryInterface.addIndex('notifications', ['shop_id', 'is_read']);
      await queryInterface.addIndex(
        'notifications',
        ['shop_id', 'type', 'source_table', 'source_id'],
        { unique: true, name: 'notifications_natural_key_unique' },
      );
    }

    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'notifications'`,
    );
    if (existing.length === 0) {
      const actions = ['read', 'update'];
      await queryInterface.bulkInsert('permissions', actions.map(action => ({
        module: 'notifications', action, created_at: new Date(), updated_at: new Date(),
      })));

      const [perms] = await queryInterface.sequelize.query(
        `SELECT id, action FROM permissions WHERE module = 'notifications'`,
      );
      const [roles] = await queryInterface.sequelize.query(
        `SELECT id, name FROM roles`,
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
    if (await tableExists(queryInterface, 'notifications')) {
      await queryInterface.dropTable('notifications');
    }

    const [perms] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'notifications'`,
    );
    if (perms.length > 0) {
      const ids = perms.map(p => p.id).join(',');
      await queryInterface.sequelize.query(`DELETE FROM role_permissions WHERE permission_id IN (${ids})`);
      await queryInterface.sequelize.query(`DELETE FROM permissions WHERE module = 'notifications'`);
    }
  },
};
