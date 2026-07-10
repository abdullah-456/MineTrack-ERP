'use strict';

/**
 * Adds tenant scoping to `categories`.
 * NON-DESTRUCTIVE: only adds a column and backfills it. No column is dropped,
 * so existing data is preserved and the migration is safe to run on live data.
 *
 * Backfill strategy:
 *   1. For categories referenced by products, inherit that product's shop_id.
 *   2. Any remaining (orphan) categories are assigned to the lowest shop id.
 *
 * shop_id is left nullable at the DB level (SQLite cannot easily convert a column
 * to NOT NULL without a table rebuild). Tenant scoping is ALSO enforced in
 * categoryController (set on create, filtered on read/update/delete), so the app
 * layer guarantees it is always populated going forward.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('categories');
    if (!table.shop_id) {
      await queryInterface.addColumn('categories', 'shop_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'shops', key: 'id' },
      });
    }

    // 1) inherit shop from any product that uses the category
    await queryInterface.sequelize.query(`
      UPDATE categories
      SET shop_id = (
        SELECT p.shop_id FROM products p
        WHERE p.category_id = categories.id AND p.shop_id IS NOT NULL
        LIMIT 1
      )
      WHERE shop_id IS NULL
    `);

    // 2) fallback: assign leftovers to the lowest shop id
    await queryInterface.sequelize.query(`
      UPDATE categories
      SET shop_id = (SELECT MIN(id) FROM shops)
      WHERE shop_id IS NULL
    `);

    await queryInterface.addIndex('categories', ['shop_id'], {
      name: 'categories_shop_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('categories', 'categories_shop_id_idx').catch(() => {});
    await queryInterface.removeColumn('categories', 'shop_id');
  },
};
