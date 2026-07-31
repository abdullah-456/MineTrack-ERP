'use strict';

/**
 * shops.books_start_date — the earliest date an entry may carry.
 *
 * A business moving off manual books needs to enter its history, so fiscal years
 * are now created backwards on demand. This column is the floor for that: it
 * stops a typo (2016 for 2026) from silently opening ten years of empty books,
 * and it states plainly when the shop's records begin.
 *
 * Deliberately left NULL for existing shops. It is tempting to backfill it from
 * the earliest general-ledger entry, but that date is when the shop started
 * using the software — not when its books begin — and using it as the floor
 * would block the very back-entry this exists to enable.
 *
 * NULL therefore means "no explicit floor": utils/fiscalYear.js falls back to a
 * bounded default (see DEFAULT_BACKDATE_YEARS) that is permissive enough for a
 * normal migration while still catching a mistyped year. Setting the date in the
 * setup wizard replaces the fallback with something exact.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('shops', 'books_start_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('shops', 'books_start_date');
  },
};
