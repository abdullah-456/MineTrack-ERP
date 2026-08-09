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
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;

    if (!(await tableExists(queryInterface, 'departmental_approvals'))) {
      await queryInterface.createTable('departmental_approvals', {
        id:                       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        shop_id:                  { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' } },
        purchase_requisition_id:  { type: DataTypes.INTEGER, allowNull: false, references: { model: 'purchase_requisitions', key: 'id' } },
        da_number:                { type: DataTypes.STRING, allowNull: false },
        approval_date:            { type: DataTypes.DATEONLY, allowNull: false },
        decision:                 { type: DataTypes.ENUM('approved', 'rejected'), allowNull: false },
        remarks:                  { type: DataTypes.TEXT, allowNull: true },
        attachment_path:          { type: DataTypes.STRING(500), allowNull: true },
        attachment_name:          { type: DataTypes.STRING(255), allowNull: true },
        attachment_mime:          { type: DataTypes.STRING(100), allowNull: true },
        attachment_size:          { type: DataTypes.INTEGER, allowNull: true },
        created_by:               { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
        created_at:               { type: DataTypes.DATE, allowNull: false },
        updated_at:               { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex('departmental_approvals', ['shop_id', 'da_number'], {
        unique: true,
        name: 'departmental_approvals_shop_da_number',
      });
      await queryInterface.addIndex('departmental_approvals', ['purchase_requisition_id'], {
        unique: true,
        name: 'departmental_approvals_pr_unique',
      });
    }
  },

  down: async (queryInterface) => {
    if (await tableExists(queryInterface, 'departmental_approvals')) {
      await queryInterface.dropTable('departmental_approvals');
    }
  },
};
