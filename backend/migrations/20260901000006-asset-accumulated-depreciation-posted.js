'use strict';

// Fixes a real bug found in a full-system audit: the depreciation catch-up
// job re-derived "book value before this year" from scratch using the
// asset's CURRENT depreciation_percentage applied to every prior year, not
// what was actually posted. If the rate (or useful life) is edited after
// some years are already posted, the next catch-up run silently assumes the
// new rate always applied — contradicting the GL entries already posted
// under the old rate, and corrupting the eventual disposal gain/loss.
//
// This column is the fix: the ACTUAL cumulative amount posted to
// Accumulated Depreciation for this asset, updated incrementally each time
// a year is caught up. Rate/life changes only affect the NEXT increment
// computed from this real, ground-truth starting point — never a
// retroactive recompute of years already in the books.

async function columnExists(queryInterface, table, column) {
  const desc = await queryInterface.describeTable(table);
  return Object.prototype.hasOwnProperty.call(desc, column);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, 'assets', 'accumulated_depreciation_posted'))) {
      await queryInterface.addColumn('assets', 'accumulated_depreciation_posted', {
        type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0,
      });
    }

    // Backfill for any asset that already has years posted. Safe to derive
    // via the reducing-balance formula at its CURRENT rate here (unlike the
    // bug this migration is part of fixing): every asset created before this
    // migration has only ever been depreciated at one unchanged rate, so the
    // formula and the real ledger necessarily still agree.
    const [rows] = await queryInterface.sequelize.query(
      `SELECT id, purchase_cost, salvage_value, depreciation_percentage, depreciation_years_posted
       FROM assets WHERE depreciation_years_posted > 0`,
    );
    for (const row of rows) {
      const cost = parseFloat(row.purchase_cost) || 0;
      const salvage = parseFloat(row.salvage_value) || 0;
      const pct = parseFloat(row.depreciation_percentage) || 0;
      const years = parseInt(row.depreciation_years_posted, 10) || 0;
      const bookValue = pct > 0 ? Math.max(cost * ((1 - pct / 100) ** years), salvage) : cost;
      const accumulated = Math.round((cost - bookValue) * 100) / 100;
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(
        `UPDATE assets SET accumulated_depreciation_posted = :accumulated WHERE id = :id`,
        { replacements: { accumulated, id: row.id } },
      );
    }
  },

  async down(queryInterface) {
    if (await columnExists(queryInterface, 'assets', 'accumulated_depreciation_posted')) {
      await queryInterface.removeColumn('assets', 'accumulated_depreciation_posted');
    }
  },
};
