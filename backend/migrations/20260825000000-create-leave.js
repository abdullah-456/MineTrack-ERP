'use strict';

/**
 * Leave Management: a shop-scoped Leave Type catalog + Leave Records (direct
 * HR-recorded, no approval workflow — confirmed with the user). Creating a
 * leave record auto-marks Attendance status:'leave' for every covered date
 * (see leaveController.createRecord), so attendance.leave_type_id links each
 * marked day back to which leave type it was. Seeds the 'leave' permission
 * module, same pattern as 20260816000001-attendance-permissions.js.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('leave_types', {
      id:                  { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      shop_id:             { type: Sequelize.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' }, onDelete: 'CASCADE' },
      name:                { type: Sequelize.STRING(80), allowNull: false },
      is_paid:             { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      default_annual_days: { type: Sequelize.INTEGER, allowNull: true },
      created_at:          { type: Sequelize.DATE, allowNull: false },
      updated_at:          { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('leave_types', ['shop_id']);

    await queryInterface.createTable('leave_records', {
      id:          { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      shop_id:     { type: Sequelize.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' }, onDelete: 'CASCADE' },
      employee_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'employees', key: 'id' }, onDelete: 'CASCADE' },
      leave_type_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'leave_types', key: 'id' }, onDelete: 'RESTRICT' },
      start_date:  { type: Sequelize.DATEONLY, allowNull: false },
      end_date:    { type: Sequelize.DATEONLY, allowNull: false },
      reason:      { type: Sequelize.TEXT, allowNull: true },
      created_by:  { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      created_at:  { type: Sequelize.DATE, allowNull: false },
      updated_at:  { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('leave_records', ['shop_id']);
    await queryInterface.addIndex('leave_records', ['employee_id']);

    const attTable = await queryInterface.describeTable('attendance');
    if (!attTable.leave_type_id) {
      await queryInterface.addColumn('attendance', 'leave_type_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'leave_types', key: 'id' },
        onDelete: 'SET NULL',
      });
    }

    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'leave'`,
    );
    if (existing.length === 0) {
      const actions = ['create', 'read', 'update', 'delete'];
      await queryInterface.bulkInsert('permissions', actions.map(action => ({
        module: 'leave', action, created_at: new Date(), updated_at: new Date(),
      })));
      const [perms] = await queryInterface.sequelize.query(`SELECT id FROM permissions WHERE module = 'leave'`);
      const [roles] = await queryInterface.sequelize.query(
        `SELECT id FROM roles WHERE name IN ('super_admin', 'admin')`,
      );
      const rolePermissions = [];
      roles.forEach(role => perms.forEach(p => rolePermissions.push({ role_id: role.id, permission_id: p.id })));
      if (rolePermissions.length > 0) await queryInterface.bulkInsert('role_permissions', rolePermissions);
    }
  },

  async down(queryInterface) {
    const [perms] = await queryInterface.sequelize.query(`SELECT id FROM permissions WHERE module = 'leave'`);
    if (perms.length > 0) {
      const ids = perms.map(p => p.id).join(',');
      await queryInterface.sequelize.query(`DELETE FROM role_permissions WHERE permission_id IN (${ids})`);
      await queryInterface.sequelize.query(`DELETE FROM permissions WHERE module = 'leave'`);
    }
    const attTable = await queryInterface.describeTable('attendance');
    if (attTable.leave_type_id) await queryInterface.removeColumn('attendance', 'leave_type_id');
    await queryInterface.dropTable('leave_records');
    await queryInterface.dropTable('leave_types');
  },
};
