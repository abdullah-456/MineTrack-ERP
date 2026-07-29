'use strict';

/**
 * New voucher_type: 'opening', so opening balances can be excluded from live
 * cash figures by PURPOSE instead of by account type.
 *
 * THE BUG
 * equityVoucherIds() in utils/cashHelpers.js (and the same logic inlined in
 * getMoneyFlow) excluded every voucher that touched ANY equity account, to keep
 * setup journals from inflating today's cash. That test is far too wide:
 *
 *   • A genuine owner drawing (Dr Drawings / Cr Cash) was excluded, so real cash
 *     left the drawer and the dashboard never saw it — cash on hand overstated.
 *   • "Direct stock received" (utils/supplierPayment.js) credits 01-CAPITAL for
 *     the unpaid remainder, so its very real cash payment leg was excluded too.
 *
 * It also becomes actively dangerous alongside the board-member reclassification
 * in 20260811000003: with director capital correctly typed as equity, EVERY BOD
 * cash movement would suddenly disappear from the cash dashboards.
 *
 * THE RETAG
 * Historical opening vouchers are identified by the narrations the six posting
 * sites actually write — all of which begin "Opening " or are the setup
 * wizard's combined entry. Matching on "touches 01-CAPITAL" instead would have
 * wrongly swept up "Direct stock received", which is ordinary trading activity.
 */

const OPENING_NARRATIONS = `(
  narration LIKE 'Opening %'
  OR narration = 'Financial setup — opening balances'
)`;

module.exports = {
  up: async (queryInterface) => {
    const dialect = queryInterface.sequelize.getDialect();

    if (dialect === 'postgres') {
      await queryInterface.sequelize.query(
        `DO $$ BEGIN
           ALTER TYPE enum_vouchers_voucher_type ADD VALUE IF NOT EXISTS 'opening';
         EXCEPTION WHEN duplicate_object THEN NULL;
         END $$;`,
      ).catch(async () => {
        try {
          await queryInterface.sequelize.query(
            `ALTER TYPE "enum_vouchers_voucher_type" ADD VALUE IF NOT EXISTS 'opening'`,
          );
        } catch (_) { /* already present */ }
      });
    } else {
      console.warn(`  skipped: 'opening' voucher type not added on dialect '${dialect}'`);
      return;
    }

    const [, result] = await queryInterface.sequelize.query(
      `UPDATE vouchers
          SET voucher_type = 'opening'
        WHERE voucher_type = 'journal'
          AND ${OPENING_NARRATIONS}`,
    );

    if (result?.rowCount) {
      console.log(`  retagged ${result.rowCount} historical opening-balance voucher(s)`);
    }
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `UPDATE vouchers SET voucher_type = 'journal' WHERE voucher_type = 'opening'`,
    );
  },
};
