'use strict';

/**
 * Adds users.disabled_by_suspension so that reactivating a shop only re-enables
 * the users that the shop suspension disabled — NOT users an admin suspended
 * individually. NON-DESTRUCTIVE (adds a column only).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('users');
    if (!table.disabled_by_suspension) {
      await queryInterface.addColumn('users', 'disabled_by_suspension', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'disabled_by_suspension');
  },
};
