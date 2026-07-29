'use strict';

/**
 * New customer_transactions type: 'advance_applied'.
 *
 * When a sale consumes a customer's existing store credit, the old code logged
 * it as a second `payment_received` row. That was wrong twice over: the money
 * had ALREADY been recorded as received (and had already pushed
 * Customer.current_balance negative) when the customer originally overpaid, so
 * logging it again as a payment counted the same cash twice — both in the
 * ledger's replayed running balance and in the "total paid" summary.
 *
 * Applying store credit does not change what the customer owes on net: the
 * sale charge and the pre-existing credit already offset each other. It is a
 * general-ledger reclassification (03-CUSTADV → settled sale), not a new
 * payment. So this type carries a running-balance sign of 0
 * (see SIGN_FOR in controllers/customerLedgerController.js) while keeping the
 * event visible in the customer's audit trail, which is what the sale ledger
 * trail was designed to show.
 */

module.exports = {
  up: async (queryInterface) => {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== 'postgres') {
      // SQLite models ENUM as a TEXT CHECK constraint that cannot be extended
      // without a full table rebuild; MySQL needs a changeColumn. Postgres is
      // the supported deployment target for this project.
      console.warn(`  skipped: 'advance_applied' enum value not added on dialect '${dialect}'`);
      return;
    }

    await queryInterface.sequelize.query(
      `DO $$ BEGIN
         ALTER TYPE enum_customer_transactions_type ADD VALUE IF NOT EXISTS 'advance_applied';
       EXCEPTION WHEN duplicate_object THEN NULL;
       END $$;`,
    ).catch(async () => {
      try {
        await queryInterface.sequelize.query(
          `ALTER TYPE "enum_customer_transactions_type" ADD VALUE IF NOT EXISTS 'advance_applied'`,
        );
      } catch (_) { /* already present */ }
    });
  },

  down: async () => {
    // Postgres cannot drop a value from an ENUM without recreating the type and
    // rewriting every dependent column. Leaving the value in place is harmless.
  },
};
