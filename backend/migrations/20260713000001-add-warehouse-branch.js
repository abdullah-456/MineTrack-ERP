'use strict';

/**
 * Adds a "Warehouse" branch alongside the existing "Main Branch" for every
 * shop that doesn't already have one — idempotent (safe to re-run).
 */
module.exports = {
  up: async (queryInterface) => {
    const [shops] = await queryInterface.sequelize.query('SELECT id FROM shops;');
    for (const shop of shops) {
      const [existing] = await queryInterface.sequelize.query(
        'SELECT id FROM branches WHERE shop_id = ? AND name = ?',
        { replacements: [shop.id, 'Warehouse'] },
      );
      if (existing.length) continue;

      await queryInterface.bulkInsert('branches', [{
        shop_id: shop.id,
        name: 'Warehouse',
        address: null,
        is_default: false,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      }]);
    }
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('branches', { name: 'Warehouse' });
  },
};
