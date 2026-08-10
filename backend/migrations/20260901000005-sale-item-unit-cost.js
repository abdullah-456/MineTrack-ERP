'use strict';

// Fixes a real bug found in a full-system audit: sale returns reversed COGS
// using the PRODUCT'S CURRENT cost_price, not the cost actually posted to
// the GL at the time of the original sale. If the product's weighted-average
// cost moved (a purchase landed) between the sale and its return, the return
// silently reversed a different amount than was originally booked — stock
// and COGS drift from true cost, compounding with every return. Storing the
// cost basis on the sale line itself (as the item is sold, once, forever)
// gives returns something stable to read back.

async function columnExists(queryInterface, table, column) {
  const desc = await queryInterface.describeTable(table);
  return Object.prototype.hasOwnProperty.call(desc, column);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, 'sale_items', 'unit_cost'))) {
      await queryInterface.addColumn('sale_items', 'unit_cost', {
        type: Sequelize.DECIMAL(15, 2), allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    if (await columnExists(queryInterface, 'sale_items', 'unit_cost')) {
      await queryInterface.removeColumn('sale_items', 'unit_cost');
    }
  },
};
