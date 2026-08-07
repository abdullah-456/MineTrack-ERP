'use strict';

/** Mine → Pit → Bench hierarchy: pits belong to a mine (branches row), benches belong to a pit. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('pits', {
      id:              { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      shop_id:         { type: Sequelize.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' }, onDelete: 'CASCADE' },
      mine_id:         { type: Sequelize.INTEGER, allowNull: false, references: { model: 'branches', key: 'id' }, onDelete: 'CASCADE' },
      area_name:       { type: Sequelize.STRING(160), allowNull: false },
      status:          { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'active' },
      gps_coordinates: { type: Sequelize.STRING(80), allowNull: true },
      notes:           { type: Sequelize.TEXT, allowNull: true },
      created_at:      { type: Sequelize.DATE, allowNull: false },
      updated_at:      { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('pits', ['shop_id']);
    await queryInterface.addIndex('pits', ['mine_id']);

    await queryInterface.createTable('benches', {
      id:            { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      shop_id:       { type: Sequelize.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' }, onDelete: 'CASCADE' },
      pit_id:        { type: Sequelize.INTEGER, allowNull: false, references: { model: 'pits', key: 'id' }, onDelete: 'CASCADE' },
      bench_number:  { type: Sequelize.STRING(40), allowNull: false },
      elevation:     { type: Sequelize.STRING(40), allowNull: true },
      status:        { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'active' },
      created_at:    { type: Sequelize.DATE, allowNull: false },
      updated_at:    { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('benches', ['shop_id']);
    await queryInterface.addIndex('benches', ['pit_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('benches');
    await queryInterface.dropTable('pits');
  },
};
