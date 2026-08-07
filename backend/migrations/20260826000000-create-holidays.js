'use strict';

/**
 * Holiday Calendar: shop-scoped dated holidays, optionally recurring yearly
 * (matched by month/day regardless of year — e.g. a national holiday that
 * repeats every year without needing a new row each year). Excluded from the
 * absence-deduction day-count in payroll (confirmed with the user) — see
 * holidayHelpers.getHolidayDatesForMonth and attendanceController's
 * getAttendanceSummaryForMonth. Seeds the 'holidays' permission module, same
 * pattern as 20260816000001-attendance-permissions.js.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('holidays', {
      id:                  { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      shop_id:             { type: Sequelize.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' }, onDelete: 'CASCADE' },
      date:                { type: Sequelize.DATEONLY, allowNull: false },
      name:                { type: Sequelize.STRING(120), allowNull: false },
      is_recurring_yearly: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at:          { type: Sequelize.DATE, allowNull: false },
      updated_at:          { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('holidays', ['shop_id']);
    await queryInterface.addIndex('holidays', ['date']);

    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'holidays'`,
    );
    if (existing.length === 0) {
      const actions = ['create', 'read', 'update', 'delete'];
      await queryInterface.bulkInsert('permissions', actions.map(action => ({
        module: 'holidays', action, created_at: new Date(), updated_at: new Date(),
      })));
      const [perms] = await queryInterface.sequelize.query(`SELECT id FROM permissions WHERE module = 'holidays'`);
      const [roles] = await queryInterface.sequelize.query(
        `SELECT id FROM roles WHERE name IN ('super_admin', 'admin')`,
      );
      const rolePermissions = [];
      roles.forEach(role => perms.forEach(p => rolePermissions.push({ role_id: role.id, permission_id: p.id })));
      if (rolePermissions.length > 0) await queryInterface.bulkInsert('role_permissions', rolePermissions);
    }
  },

  async down(queryInterface) {
    const [perms] = await queryInterface.sequelize.query(`SELECT id FROM permissions WHERE module = 'holidays'`);
    if (perms.length > 0) {
      const ids = perms.map(p => p.id).join(',');
      await queryInterface.sequelize.query(`DELETE FROM role_permissions WHERE permission_id IN (${ids})`);
      await queryInterface.sequelize.query(`DELETE FROM permissions WHERE module = 'holidays'`);
    }
    await queryInterface.dropTable('holidays');
  },
};
