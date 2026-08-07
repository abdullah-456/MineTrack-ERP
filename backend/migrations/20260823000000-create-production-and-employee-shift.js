'use strict';

/** Production entries (Bench-level daily output log) + Employee.shift field. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('production_entries', {
      id:            { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      shop_id:       { type: Sequelize.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' }, onDelete: 'CASCADE' },
      date:          { type: Sequelize.DATEONLY, allowNull: false },
      mine_id:       { type: Sequelize.INTEGER, allowNull: false, references: { model: 'branches', key: 'id' }, onDelete: 'CASCADE' },
      pit_id:        { type: Sequelize.INTEGER, allowNull: false, references: { model: 'pits', key: 'id' }, onDelete: 'CASCADE' },
      bench_id:      { type: Sequelize.INTEGER, allowNull: false, references: { model: 'benches', key: 'id' }, onDelete: 'CASCADE' },
      shift:         { type: Sequelize.STRING(20), allowNull: true },
      mineral_id:    { type: Sequelize.INTEGER, allowNull: true, references: { model: 'minerals', key: 'id' }, onDelete: 'SET NULL' },
      quantity:      { type: Sequelize.DECIMAL(15, 3), allowNull: false, defaultValue: 0 },
      unit:          { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'kg' },
      supervisor_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'employees', key: 'id' }, onDelete: 'SET NULL' },
      remarks:       { type: Sequelize.TEXT, allowNull: true },
      created_at:    { type: Sequelize.DATE, allowNull: false },
      updated_at:    { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('production_entries', ['shop_id']);
    await queryInterface.addIndex('production_entries', ['mine_id']);
    await queryInterface.addIndex('production_entries', ['pit_id']);
    await queryInterface.addIndex('production_entries', ['bench_id']);
    await queryInterface.addIndex('production_entries', ['mineral_id']);
    await queryInterface.addIndex('production_entries', ['date']);

    const table = await queryInterface.describeTable('employees');
    if (!table.shift) {
      await queryInterface.addColumn('employees', 'shift', { type: Sequelize.STRING(20), allowNull: true });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('employees');
    if (table.shift) await queryInterface.removeColumn('employees', 'shift');
    await queryInterface.dropTable('production_entries');
  },
};
