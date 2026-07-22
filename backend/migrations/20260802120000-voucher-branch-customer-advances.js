'use strict';

/** Tag vouchers with branch_id for branch-wise GL filtering; add Customer Advances liability account. */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('vouchers');
    if (!desc.branch_id) {
      await queryInterface.addColumn('vouchers', 'branch_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'branches', key: 'id' },
      });
    }

    const [curLiab] = await queryInterface.sequelize.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '03-CUR-LIAB' LIMIT 1`,
    );
    const parentId = curLiab[0]?.id;
    if (parentId) {
      const [existing] = await queryInterface.sequelize.query(
        `SELECT id FROM chart_of_accounts WHERE account_code = '03-CUSTADV' LIMIT 1`,
      );
      if (!existing.length) {
        await queryInterface.bulkInsert('chart_of_accounts', [{
          shop_id: null,
          account_code: '03-CUSTADV',
          account_name: 'Customer Advances',
          account_type: 'liability',
          parent_account_id: parentId,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        }]);
      }
    }
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `DELETE FROM chart_of_accounts WHERE account_code = '03-CUSTADV'`,
    );
    const desc = await queryInterface.describeTable('vouchers');
    if (desc.branch_id) {
      await queryInterface.removeColumn('vouchers', 'branch_id');
    }
  },
};
