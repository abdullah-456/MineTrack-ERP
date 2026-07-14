'use strict';

/**
 * Purchase Orders is being removed entirely (no controller/route/frontend
 * page for it anymore — see purchaseOrderController.js and
 * frontend/src/pages/purchases/ removal in the same change). This drops the
 * legacy `purchase_orders` table created by the original baseline migration
 * (20260101000000-create-all-tables.js) — the later purchase_order_items,
 * goods_receipt_notes, goods_receipt_note_items and purchase_returns tables
 * were added and dropped again within this same uncommitted feature branch,
 * so they never need a migration of their own.
 */

async function tableExists(queryInterface, table) {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  up: async (queryInterface) => {
    if (await tableExists(queryInterface, 'purchase_orders')) {
      await queryInterface.dropTable('purchase_orders', { force: true });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;
    if (await tableExists(queryInterface, 'purchase_orders')) return;
    await queryInterface.createTable('purchase_orders', {
      id:            { type: DataTypes.INTEGER,  primaryKey: true, autoIncrement: true },
      shop_id:       { type: DataTypes.INTEGER,  references: { model: 'shops',     key: 'id' }, allowNull: true },
      supplier_id:   { type: DataTypes.INTEGER,  references: { model: 'suppliers', key: 'id' }, allowNull: true },
      po_number:     { type: DataTypes.STRING,   allowNull: true },
      order_date:    { type: DataTypes.DATEONLY, allowNull: false },
      expected_date: { type: DataTypes.DATEONLY, allowNull: true },
      total:         { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      status:        { type: DataTypes.ENUM('draft', 'sent', 'received', 'cancelled'), defaultValue: 'draft' },
      notes:         { type: DataTypes.TEXT,     allowNull: true },
      created_at:    { type: DataTypes.DATE,     allowNull: false },
      updated_at:    { type: DataTypes.DATE,     allowNull: false },
    });
  },
};
