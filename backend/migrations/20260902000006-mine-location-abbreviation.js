'use strict';

/**
 * A short, human-authored abbreviation for the mine's LOCATION — distinct from
 * the auto-generated `mine_code` (MN-3-0001), which identifies the record
 * rather than the place.
 *
 * Its purpose is the employment ID: an employee attached to a mine with
 * abbreviation 'KHW' is issued EMP-KHW-0007 instead of EMP-3-0007, so the ID
 * reads as a location instead of an internal shop number. The shop is still the
 * owning tenant on every row — it just stops being the visible part of the ID.
 *
 * Deliberately NOT unique: two pits in the same valley can legitimately share a
 * location abbreviation, and employment IDs stay unique anyway because the
 * sequence number is allocated across the whole shop (see
 * employeeController.nextEmploymentId).
 *
 * Nullable with no backfill, by design: a mine without one keeps producing the
 * existing EMP-<shopId>-NNNN format, so nothing already issued changes and
 * abbreviations can be filled in gradually.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('branches');
    if (!table.location_abbr) {
      await queryInterface.addColumn('branches', 'location_abbr', {
        type: Sequelize.STRING(10), allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('branches');
    if (table.location_abbr) await queryInterface.removeColumn('branches', 'location_abbr');
  },
};
