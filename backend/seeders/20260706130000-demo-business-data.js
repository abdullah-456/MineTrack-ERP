'use strict';

module.exports = {
  up: async (queryInterface) => {
    try {
      // ...all your existing code stays exactly as-is, unchanged...
    } catch (err) {
      console.error('MIGRATION FAILED:', err.name, err.message);
      if (err.errors) {
        err.errors.forEach(e => console.error(' →', e.path, e.message, 'value:', e.value));
      }
      if (err.original) {
        console.error('Original SQL error:', err.original.message);
      }
      throw err;
    }
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('stock', null, {});
    await queryInterface.bulkDelete('product_suppliers', null, {});
    await queryInterface.bulkDelete('sale_items', null, {});
    await queryInterface.bulkDelete('sales', null, {});
    await queryInterface.bulkDelete('products', null, {});
    await queryInterface.bulkDelete('customers', null, {});
    await queryInterface.bulkDelete('employees', null, {});
    await queryInterface.bulkDelete('suppliers', null, {});
    await queryInterface.bulkDelete('categories', null, {});
  },
};
