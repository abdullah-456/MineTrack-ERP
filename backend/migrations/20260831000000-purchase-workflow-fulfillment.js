'use strict';

async function tableExists(queryInterface, table) {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

async function columnExists(queryInterface, table, column) {
  try {
    const desc = await queryInterface.describeTable(table);
    return Boolean(desc[column]);
  } catch {
    return false;
  }
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;

    // Add 'closed' to PR status enum and migrate rejected → closed
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_purchase_requisitions_status" ADD VALUE IF NOT EXISTS 'closed'`
    ).catch(() => {});
    await queryInterface.sequelize.query(
      `UPDATE purchase_requisitions SET status = 'closed' WHERE status = 'rejected'`
    );

    if (!(await columnExists(queryInterface, 'purchase_orders', 'purchase_requisition_id'))) {
      await queryInterface.addColumn('purchase_orders', 'purchase_requisition_id', {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'purchase_requisitions', key: 'id' },
        onDelete: 'SET NULL',
      });
      await queryInterface.addIndex('purchase_orders', ['purchase_requisition_id'], {
        unique: true,
        name: 'purchase_orders_pr_unique',
      });
    }

    const grnDocCols = [
      ['grn_document_path', DataTypes.STRING(500)],
      ['grn_document_name', DataTypes.STRING(255)],
      ['grn_document_mime', DataTypes.STRING(100)],
      ['invoice_document_path', DataTypes.STRING(500)],
      ['invoice_document_name', DataTypes.STRING(255)],
      ['invoice_document_mime', DataTypes.STRING(100)],
    ];
    for (const [col, type] of grnDocCols) {
      if (!(await columnExists(queryInterface, 'goods_receipt_notes', col))) {
        await queryInterface.addColumn('goods_receipt_notes', col, { type, allowNull: true });
      }
    }
  },

  down: async (queryInterface) => {
    for (const col of [
      'invoice_document_mime', 'invoice_document_name', 'invoice_document_path',
      'grn_document_mime', 'grn_document_name', 'grn_document_path',
    ]) {
      if (await columnExists(queryInterface, 'goods_receipt_notes', col)) {
        await queryInterface.removeColumn('goods_receipt_notes', col);
      }
    }
    if (await columnExists(queryInterface, 'purchase_orders', 'purchase_requisition_id')) {
      await queryInterface.removeColumn('purchase_orders', 'purchase_requisition_id');
    }
  },
};
