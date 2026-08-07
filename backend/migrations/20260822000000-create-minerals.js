'use strict';

/** Minerals reference/catalog module; Mine's free-text mineral_type becomes a mineral_id FK. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('minerals', {
      id:                 { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      shop_id:            { type: Sequelize.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' }, onDelete: 'CASCADE' },
      name:               { type: Sequelize.STRING(160), allowNull: false },
      category:           { type: Sequelize.STRING(30), allowNull: true },
      unit:               { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'kg' },
      default_price:      { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      royalty_type:       { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'percentage' },
      royalty_rate:       { type: Sequelize.DECIMAL(10, 3), allowNull: false, defaultValue: 0 },
      quality_parameters: { type: Sequelize.JSONB, allowNull: true, defaultValue: [] },
      created_at:         { type: Sequelize.DATE, allowNull: false },
      updated_at:         { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('minerals', ['shop_id']);

    const table = await queryInterface.describeTable('branches');
    if (table.mineral_type) await queryInterface.removeColumn('branches', 'mineral_type');
    if (!table.mineral_id) {
      await queryInterface.addColumn('branches', 'mineral_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'minerals', key: 'id' },
        onDelete: 'SET NULL',
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('branches');
    if (table.mineral_id) await queryInterface.removeColumn('branches', 'mineral_id');
    if (!table.mineral_type) {
      await queryInterface.addColumn('branches', 'mineral_type', { type: Sequelize.STRING(120), allowNull: true });
    }
    await queryInterface.dropTable('minerals');
  },
};
