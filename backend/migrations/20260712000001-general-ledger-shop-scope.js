'use strict';

/**
 * general_ledger has no shop_id column of its own (only reachable via its
 * voucher_id -> vouchers.shop_id join). Since running_balance must be
 * computed per-shop (Chart of Accounts rows are shared/global across shops),
 * a direct shop_id column avoids a join on every posting/read.
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
  up: async (queryInterface, Sequelize) => {
    if (!(await tableExists(queryInterface, 'general_ledger'))) return;
    const desc = await queryInterface.describeTable('general_ledger');
    if (!desc.shop_id) {
      await queryInterface.addColumn('general_ledger', 'shop_id', { type: Sequelize.DataTypes.INTEGER, allowNull: true });
    }
  },

  down: async (queryInterface) => {
    if (!(await tableExists(queryInterface, 'general_ledger'))) return;
    const desc = await queryInterface.describeTable('general_ledger');
    if (desc.shop_id) {
      await queryInterface.removeColumn('general_ledger', 'shop_id');
    }
  },
};
