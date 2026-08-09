'use strict';

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

    if (!(await columnExists(queryInterface, 'departmental_approvals', 'attachment_description'))) {
      await queryInterface.addColumn('departmental_approvals', 'attachment_description', {
        type: DataTypes.TEXT,
        allowNull: true,
      });
    }

    const grnDescCols = [
      ['grn_document_description', DataTypes.TEXT],
      ['invoice_document_description', DataTypes.TEXT],
    ];
    for (const [col, type] of grnDescCols) {
      if (!(await columnExists(queryInterface, 'goods_receipt_notes', col))) {
        await queryInterface.addColumn('goods_receipt_notes', col, { type, allowNull: true });
      }
    }
  },

  down: async (queryInterface) => {
    if (await columnExists(queryInterface, 'departmental_approvals', 'attachment_description')) {
      await queryInterface.removeColumn('departmental_approvals', 'attachment_description');
    }
    for (const col of ['invoice_document_description', 'grn_document_description']) {
      if (await columnExists(queryInterface, 'goods_receipt_notes', col)) {
        await queryInterface.removeColumn('goods_receipt_notes', col);
      }
    }
  },
};
