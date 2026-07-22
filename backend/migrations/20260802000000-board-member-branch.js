'use strict';

/**
 * Link board members to branches. Each member's ledger sub-account nests under
 * a branch-specific "Directors — {Branch}" parent in the COA (created at runtime).
 * Existing members are assigned each shop's default branch.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('board_members');
    if (!desc.branch_id) {
      await queryInterface.addColumn('board_members', 'branch_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'branches', key: 'id' },
      });
    }

    // Backfill: default branch per shop, else first branch.
    await queryInterface.sequelize.query(`
      UPDATE board_members
      SET branch_id = (
        SELECT b.id FROM branches b
        WHERE b.shop_id = board_members.shop_id
        ORDER BY b.is_default DESC, b.id ASC
        LIMIT 1
      )
      WHERE branch_id IS NULL
    `);

    // SQLite cannot ALTER COLUMN — re-create constraint via changeColumn where supported.
    try {
      await queryInterface.changeColumn('board_members', 'branch_id', {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'branches', key: 'id' },
      });
    } catch {
      // SQLite: column stays nullable in schema but app enforces NOT NULL on create.
    }

    try {
      await queryInterface.removeIndex('board_members', 'board_members_cnic_key');
    } catch { /* index name may differ */ }
    try {
      await queryInterface.removeIndex('board_members', 'cnic');
    } catch { /* ignore */ }

    try {
      await queryInterface.addIndex('board_members', ['shop_id', 'cnic'], {
        unique: true,
        name: 'board_members_shop_cnic_unique',
        where: { cnic: { [Sequelize.Op.ne]: null } },
      });
    } catch {
      await queryInterface.addIndex('board_members', ['shop_id', 'cnic'], {
        unique: true,
        name: 'board_members_shop_cnic_unique',
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.removeIndex('board_members', 'board_members_shop_cnic_unique');
    } catch { /* ignore */ }
    const desc = await queryInterface.describeTable('board_members');
    if (desc.branch_id) {
      await queryInterface.removeColumn('board_members', 'branch_id');
    }
  },
};
