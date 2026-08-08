'use strict';

/**
 * Designations reference/catalog module; Employee's free-text `designation`
 * gets a matching `designation_id` FK. The old string column is kept as a
 * denormalized display cache (synced by the controller going forward) so
 * existing display/print call sites don't need to change.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('designations', {
      id:         { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      shop_id:    { type: Sequelize.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' }, onDelete: 'CASCADE' },
      name:       { type: Sequelize.STRING(100), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('designations', ['shop_id']);

    const table = await queryInterface.describeTable('employees');
    if (!table.designation_id) {
      await queryInterface.addColumn('employees', 'designation_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'designations', key: 'id' },
        onDelete: 'SET NULL',
      });
    }

    // Backfill: turn each distinct existing free-text designation into a real
    // row (case-insensitive dedup per shop), then point employees at it.
    await queryInterface.sequelize.query(`
      INSERT INTO designations (shop_id, name, created_at, updated_at)
      SELECT shop_id, name, NOW(), NOW() FROM (
        SELECT DISTINCT ON (shop_id, LOWER(TRIM(designation)))
          shop_id, TRIM(designation) AS name
        FROM employees
        WHERE designation IS NOT NULL AND TRIM(designation) <> ''
        ORDER BY shop_id, LOWER(TRIM(designation))
      ) AS distinct_designations;
    `);

    await queryInterface.sequelize.query(`
      UPDATE employees e
      SET designation_id = d.id
      FROM designations d
      WHERE e.shop_id = d.shop_id
        AND LOWER(TRIM(e.designation)) = LOWER(d.name)
        AND e.designation_id IS NULL;
    `);
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('employees');
    if (table.designation_id) await queryInterface.removeColumn('employees', 'designation_id');
    await queryInterface.dropTable('designations');
  },
};
