'use strict';

/**
 * employees.status was created as ENUM('active','inactive') but the app uses
 * active / suspended / terminated. Add missing enum values and map legacy rows.
 */
module.exports = {
  up: async (queryInterface) => {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== 'postgres') {
      console.warn(`  skipped: employee status enum patch not applied on dialect '${dialect}'`);
      return;
    }

    const addValue = async (value) => {
      await queryInterface.sequelize.query(
        `DO $$ BEGIN
           ALTER TYPE enum_employees_status ADD VALUE IF NOT EXISTS '${value}';
         EXCEPTION WHEN duplicate_object THEN NULL;
         END $$;`,
      ).catch(async () => {
        try {
          await queryInterface.sequelize.query(
            `ALTER TYPE "enum_employees_status" ADD VALUE IF NOT EXISTS '${value}'`,
          );
        } catch (_) { /* already present */ }
      });
    };

    await addValue('suspended');
    await addValue('terminated');

    // Legacy installs used 'inactive' — treat as suspended going forward
    await queryInterface.sequelize.query(`
      UPDATE employees SET status = 'suspended'
      WHERE status::text = 'inactive';
    `);
  },

  down: async () => {
    // PostgreSQL cannot drop enum values safely; no-op.
  },
};
