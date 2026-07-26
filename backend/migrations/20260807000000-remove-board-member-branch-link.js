'use strict';

/**
 * Board of Directors are shop-wide — remove branch_id and reparent any
 * branch-specific director COA sub-accounts under the global 03-BOD parent.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('board_members');
    if (desc.branch_id) {
      const dialect = queryInterface.sequelize.getDialect();
      if (dialect === 'postgres') {
        await queryInterface.sequelize.query('ALTER TABLE board_members ALTER COLUMN branch_id DROP NOT NULL');
      } else {
        try {
          await queryInterface.changeColumn('board_members', 'branch_id', {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'branches', key: 'id' },
          });
        } catch {
          // SQLite fallback — column may already be nullable
        }
      }
      await queryInterface.sequelize.query('UPDATE board_members SET branch_id = NULL');
    }

    // Move director member accounts off "Directors — {Branch}" parents onto 03-BOD.
    await queryInterface.sequelize.query(`
      UPDATE chart_of_accounts AS child
      SET parent_account_id = bod.id
      FROM chart_of_accounts AS branch_parent
      INNER JOIN chart_of_accounts AS bod
        ON bod.shop_id = branch_parent.shop_id
       AND bod.account_code = '03-BOD'
      WHERE child.parent_account_id = branch_parent.id
        AND branch_parent.account_code LIKE '03-BOD-BR-%'
    `);

    await queryInterface.sequelize.query(`
      UPDATE chart_of_accounts
      SET is_active = false
      WHERE account_code LIKE '03-BOD-BR-%'
    `);

    if (desc.branch_id) {
      await queryInterface.removeColumn('board_members', 'branch_id');
    }
  },

  down: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('board_members');
    if (!desc.branch_id) {
      await queryInterface.addColumn('board_members', 'branch_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'branches', key: 'id' },
      });
    }
  },
};
