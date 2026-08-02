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
    const employeesDesc = await queryInterface.describeTable('employees');
    if (!employeesDesc.photo_path) {
      await queryInterface.addColumn('employees', 'photo_path', { type: Sequelize.STRING(500), allowNull: true });
    }
    if (!employeesDesc.cnic_image_path) {
      await queryInterface.addColumn('employees', 'cnic_image_path', { type: Sequelize.STRING(500), allowNull: true });
    }

    if (!(await tableExists(queryInterface, 'employee_documents'))) {
      await queryInterface.createTable('employee_documents', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        employee_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'employees', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        shop_id: { type: Sequelize.INTEGER, allowNull: false },
        title: { type: Sequelize.STRING(160), allowNull: true },
        file_name: { type: Sequelize.STRING(255), allowNull: false },
        file_path: { type: Sequelize.STRING(500), allowNull: false },
        mime_type: { type: Sequelize.STRING(100), allowNull: true },
        file_size: { type: Sequelize.INTEGER, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
      await queryInterface.addIndex('employee_documents', ['employee_id']);
    }
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'employee_documents')) {
      await queryInterface.dropTable('employee_documents');
    }
    const employeesDesc = await queryInterface.describeTable('employees');
    if (employeesDesc.photo_path) await queryInterface.removeColumn('employees', 'photo_path');
    if (employeesDesc.cnic_image_path) await queryInterface.removeColumn('employees', 'cnic_image_path');
  },
};
