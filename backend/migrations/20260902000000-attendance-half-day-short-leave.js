'use strict';

/**
 * Adds 'half_day' and 'short_leave' to the attendance status enum.
 *
 * Editing the Sequelize model's DataTypes.ENUM alone is NOT enough on Postgres:
 * the enum is a real database type (enum_attendance_status), so an insert with
 * a value the type doesn't know about fails at write time even though the
 * model-level validation passes. Hence this explicit ALTER TYPE.
 *
 * ALTER TYPE ... ADD VALUE cannot run inside a transaction block on Postgres
 * before v12, and even on v12+ the new value is not usable by other statements
 * in the same transaction — so this is deliberately issued as its own
 * statement with IF NOT EXISTS rather than wrapped in queryInterface's
 * transaction, and is a no-op on a re-run.
 */
module.exports = {
  async up(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== 'postgres') return; // MySQL/SQLite store the enum inline — the model change is enough

    const [types] = await queryInterface.sequelize.query(
      `SELECT 1 FROM pg_type WHERE typname = 'enum_attendance_status'`,
    );
    if (!types.length) return; // column isn't a native enum here — nothing to alter

    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_attendance_status" ADD VALUE IF NOT EXISTS 'half_day'`,
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_attendance_status" ADD VALUE IF NOT EXISTS 'short_leave'`,
    );
  },

  async down() {
    // Postgres has no ALTER TYPE ... DROP VALUE. Removing these would mean
    // rebuilding the type and rewriting every attendance row, which would also
    // destroy any day already marked half_day/short_leave — deliberately a
    // no-op instead. The extra enum values are harmless if unused.
  },
};
