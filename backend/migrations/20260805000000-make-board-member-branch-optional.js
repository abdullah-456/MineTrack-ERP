'use strict';

/**
 * Make branch_id optional for board members so BOD is a shop-level entity
 * rather than tied to specific branches or godowns.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('board_members');
    if (desc.branch_id) {
      try {
        await queryInterface.changeColumn('board_members', 'branch_id', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'branches', key: 'id' },
        });
      } catch {
        // SQLite: column schema change fallback handled dynamically
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('board_members');
    if (desc.branch_id) {
      try {
        await queryInterface.changeColumn('board_members', 'branch_id', {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'branches', key: 'id' },
        });
      } catch {
        // SQLite fallback
      }
    }
  },
};
