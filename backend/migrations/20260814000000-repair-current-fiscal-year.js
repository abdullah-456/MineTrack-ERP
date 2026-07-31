'use strict';

/**
 * Backfills shops.current_fiscal_year_id.
 *
 * The fiscal-year bootstrap migration destructured `INSERT … RETURNING id` as
 * `const [, inserted]`, which takes the driver metadata rather than the returned
 * rows — so `inserted[0].id` was always undefined and the follow-up
 * `UPDATE shops SET current_fiscal_year_id = …` never ran. Every shop was left
 * with a NULL current year even though its fiscal_years row existed.
 *
 * getCurrentFiscalYear falls back to "latest open year", so nothing was visibly
 * broken — but the column stayed dead, and ensureFiscalYearForShop returned early
 * whenever a year existed, so it could never repair itself.
 *
 * Points each shop at its most recent OPEN year. Shops with no fiscal year, or
 * whose years are all closed, are left alone.
 */

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      UPDATE shops s
         SET current_fiscal_year_id = fy.id
        FROM (
          SELECT DISTINCT ON (shop_id) shop_id, id
            FROM fiscal_years
           WHERE status = 'open'
           ORDER BY shop_id, start_date DESC
        ) fy
       WHERE fy.shop_id = s.id
         AND s.current_fiscal_year_id IS NULL
    `);
  },

  // Intentionally not reversed: clearing the column would restore a bug, and the
  // fiscal-years migration's own down() drops it outright.
  down: async () => {},
};
