'use strict';

/**
 * Branches become Mines: add mining-specific fields and switch `status` from a
 * Postgres ENUM to a plain validated STRING.
 *
 * The original ENUM was created as ('active','inactive') but the model/controller
 * actually write 'active'/'disabled' — a pre-existing mismatch that throws a real
 * DB error on Postgres the moment a branch is disabled, since 'disabled' was never
 * a valid enum value. A STRING column sidesteps that class of bug entirely and
 * avoids fighting `ALTER TYPE` for the 5 mine-lifecycle statuses the app now uses
 * (active, under_development, suspended, closed, lease_expired), validated at the
 * application layer instead (see branchController.ALLOWED_STATUS).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('branches');
    const add = async (name, spec) => {
      if (!table[name]) await queryInterface.addColumn('branches', name, spec);
    };

    await add('mine_code', { type: Sequelize.STRING(40), allowNull: true });
    await add('company', { type: Sequelize.STRING(160), allowNull: true });
    await add('mineral_type', { type: Sequelize.STRING(120), allowNull: true });
    await add('province', { type: Sequelize.STRING(60), allowNull: true });
    await add('district', { type: Sequelize.STRING(60), allowNull: true });
    await add('gps_coordinates', { type: Sequelize.STRING(80), allowNull: true });
    await add('lease_number', { type: Sequelize.STRING(80), allowNull: true });
    await add('lease_start_date', { type: Sequelize.DATEONLY, allowNull: true });
    await add('lease_expiry_date', { type: Sequelize.DATEONLY, allowNull: true });
    await add('area', { type: Sequelize.STRING(60), allowNull: true });
    await add('manager_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'employees', key: 'id' },
      onDelete: 'SET NULL',
    });
    await add('remarks', { type: Sequelize.TEXT, allowNull: true });

    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === 'postgres') {
      await queryInterface.sequelize.query('ALTER TABLE branches ALTER COLUMN status DROP DEFAULT;');
      await queryInterface.sequelize.query('ALTER TABLE branches ALTER COLUMN status TYPE VARCHAR(30) USING status::text;');
      await queryInterface.sequelize.query("ALTER TABLE branches ALTER COLUMN status SET DEFAULT 'active';");
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_branches_status";');
    } else {
      console.warn(`  skipped: branches.status ENUM->STRING conversion not applied on dialect '${dialect}'`);
    }

    // Backfill mine_code for any pre-existing rows (e.g. the seeded "Warehouse" branch)
    await queryInterface.sequelize.query(`
      UPDATE branches SET mine_code = 'MN-' || shop_id || '-' || LPAD(id::text, 4, '0')
      WHERE mine_code IS NULL
    `);

    try {
      await queryInterface.addIndex('branches', ['shop_id', 'mine_code'], {
        unique: true,
        name: 'branches_shop_mine_code_unique',
      });
    } catch (_) { /* already exists */ }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeIndex('branches', 'branches_shop_mine_code_unique');
    } catch (_) { /* */ }
    const cols = [
      'mine_code', 'company', 'mineral_type', 'province', 'district', 'gps_coordinates',
      'lease_number', 'lease_start_date', 'lease_expiry_date', 'area', 'manager_id', 'remarks',
    ];
    for (const c of cols) {
      try { await queryInterface.removeColumn('branches', c); } catch (_) { /* */ }
    }
  },
};
