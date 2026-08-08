'use strict';

async function tableExists(queryInterface, table) {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

// Generic polymorphic document-attachment table, shared by every owner type
// that didn't already have its own document system (Mine/Branch, Supplier,
// Customer, Board Member, Vehicle, Shop). Employee documents keep using their
// existing employee_documents table (extended below with category/expiry_date)
// rather than being migrated in, since that system already works.
module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'documents'))) {
      await queryInterface.createTable('documents', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        shop_id: { type: Sequelize.INTEGER, allowNull: false },
        owner_type: { type: Sequelize.STRING(30), allowNull: false },
        owner_id: { type: Sequelize.INTEGER, allowNull: false },
        category: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'other' },
        title: { type: Sequelize.STRING(160), allowNull: true },
        file_name: { type: Sequelize.STRING(255), allowNull: false },
        file_path: { type: Sequelize.STRING(500), allowNull: false },
        mime_type: { type: Sequelize.STRING(100), allowNull: true },
        file_size: { type: Sequelize.INTEGER, allowNull: true },
        expiry_date: { type: Sequelize.DATEONLY, allowNull: true },
        uploaded_by: { type: Sequelize.INTEGER, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
      await queryInterface.addIndex('documents', ['shop_id', 'owner_type', 'owner_id']);
      await queryInterface.addIndex('documents', ['expiry_date']);
    }

    const empDocsDesc = await queryInterface.describeTable('employee_documents');
    if (!empDocsDesc.category) {
      await queryInterface.addColumn('employee_documents', 'category', { type: Sequelize.STRING(30), allowNull: true });
    }
    if (!empDocsDesc.expiry_date) {
      await queryInterface.addColumn('employee_documents', 'expiry_date', { type: Sequelize.DATEONLY, allowNull: true });
    }

    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'documents'`,
    );
    if (existing.length === 0) {
      const actions = ['create', 'read', 'update', 'delete'];
      await queryInterface.bulkInsert('permissions', actions.map(action => ({
        module: 'documents', action, created_at: new Date(), updated_at: new Date(),
      })));

      const [perms] = await queryInterface.sequelize.query(
        `SELECT id, action FROM permissions WHERE module = 'documents'`,
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

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'documents')) {
      await queryInterface.dropTable('documents');
    }
    const empDocsDesc = await queryInterface.describeTable('employee_documents');
    if (empDocsDesc.category) await queryInterface.removeColumn('employee_documents', 'category');
    if (empDocsDesc.expiry_date) await queryInterface.removeColumn('employee_documents', 'expiry_date');

    const [perms] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'documents'`,
    );
    if (perms.length > 0) {
      const ids = perms.map(p => p.id).join(',');
      await queryInterface.sequelize.query(`DELETE FROM role_permissions WHERE permission_id IN (${ids})`);
      await queryInterface.sequelize.query(`DELETE FROM permissions WHERE module = 'documents'`);
    }
  },
};
