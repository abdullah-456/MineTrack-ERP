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

    if (!(await tableExists(queryInterface, 'purchase_requisitions'))) {
      await queryInterface.createTable('purchase_requisitions', {
        id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        shop_id:           { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' } },
        branch_id:         { type: DataTypes.INTEGER, allowNull: true, references: { model: 'branches', key: 'id' } },
        requested_by:      { type: DataTypes.INTEGER, allowNull: true, references: { model: 'employees', key: 'id' } },
        pr_number:         { type: DataTypes.STRING, allowNull: false },
        requisition_date:  { type: DataTypes.DATEONLY, allowNull: false },
        required_date:     { type: DataTypes.DATEONLY, allowNull: true },
        department:        { type: DataTypes.STRING, allowNull: true },
        priority:          { type: DataTypes.ENUM('normal', 'urgent'), allowNull: false, defaultValue: 'normal' },
        purpose:           { type: DataTypes.TEXT, allowNull: true },
        subtotal:          { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        total:             { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        status:            { type: DataTypes.ENUM('draft', 'submitted', 'approved', 'rejected'), allowNull: false, defaultValue: 'draft' },
        notes:             { type: DataTypes.TEXT, allowNull: true },
        created_by:        { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
        created_at:        { type: DataTypes.DATE, allowNull: false },
        updated_at:        { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex('purchase_requisitions', ['shop_id', 'pr_number'], {
        unique: true,
        name: 'purchase_requisitions_shop_pr_number',
      });
    }

    if (!(await tableExists(queryInterface, 'purchase_requisition_items'))) {
      await queryInterface.createTable('purchase_requisition_items', {
        id:                       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        purchase_requisition_id:  { type: DataTypes.INTEGER, allowNull: false, references: { model: 'purchase_requisitions', key: 'id' }, onDelete: 'CASCADE' },
        product_id:               { type: DataTypes.INTEGER, allowNull: true, references: { model: 'products', key: 'id' } },
        description:              { type: DataTypes.STRING, allowNull: false },
        quantity:                 { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
        unit:                     { type: DataTypes.STRING(30), allowNull: true },
        estimated_unit_cost:      { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        line_total:               { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        notes:                    { type: DataTypes.TEXT, allowNull: true },
        created_at:               { type: DataTypes.DATE, allowNull: false },
        updated_at:               { type: DataTypes.DATE, allowNull: false },
      });
    }
  },

  down: async (queryInterface) => {
    for (const table of ['purchase_requisition_items', 'purchase_requisitions']) {
      if (await tableExists(queryInterface, table)) {
        await queryInterface.dropTable(table);
      }
    }
  },
};
