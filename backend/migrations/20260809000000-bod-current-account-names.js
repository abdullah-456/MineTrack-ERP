'use strict';

/** Custom display names for BOD Current Cash / Bank wallets. */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('board_members');
    if (!table.current_cash_name) {
      await queryInterface.addColumn('board_members', 'current_cash_name', {
        type: Sequelize.STRING(120),
        allowNull: true,
      });
    }
    if (!table.current_bank_name) {
      await queryInterface.addColumn('board_members', 'current_bank_name', {
        type: Sequelize.STRING(120),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    try { await queryInterface.removeColumn('board_members', 'current_cash_name'); } catch (_) { /* */ }
    try { await queryInterface.removeColumn('board_members', 'current_bank_name'); } catch (_) { /* */ }
  },
};
