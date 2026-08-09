'use strict';

async function columnExists(queryInterface, table, column) {
  const desc = await queryInterface.describeTable(table);
  return Object.prototype.hasOwnProperty.call(desc, column);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, 'assets', 'depreciation_percentage'))) {
      await queryInterface.addColumn('assets', 'depreciation_percentage', {
        type: Sequelize.DECIMAL(5, 2), allowNull: true,
      });
    }
    if (!(await columnExists(queryInterface, 'assets', 'depreciation_years_posted'))) {
      await queryInterface.addColumn('assets', 'depreciation_years_posted', {
        type: Sequelize.INTEGER, allowNull: false, defaultValue: 0,
      });
    }
  },

  async down(queryInterface) {
    if (await columnExists(queryInterface, 'assets', 'depreciation_percentage')) {
      await queryInterface.removeColumn('assets', 'depreciation_percentage');
    }
    if (await columnExists(queryInterface, 'assets', 'depreciation_years_posted')) {
      await queryInterface.removeColumn('assets', 'depreciation_years_posted');
    }
  },
};
