'use strict';

// Fixes a real bug found in a full-system audit: neither `expenses` nor
// `sales` remembers which board member's BOD Current wallet actually funded
// a payment/collection — paid_via gets normalized to plain 'cash'/'bank' at
// creation. Editing or voiding that record later reverses against the
// COMPANY's cash/bank instead of the director's wallet that was really
// touched, fabricating money in an arbitrary account and leaving the
// director's ledger permanently wrong. This adds the missing column to both
// tables and two new transaction-type values so the reversal can be posted
// as a distinct, auditable BOD Current entry rather than disguised as a
// plain payment/receipt.

async function columnExists(queryInterface, table, column) {
  const desc = await queryInterface.describeTable(table);
  return Object.prototype.hasOwnProperty.call(desc, column);
}

async function addEnumValues(queryInterface, values) {
  for (const v of values) {
    try {
      await queryInterface.sequelize.query(
        `DO $$ BEGIN
           ALTER TYPE enum_board_member_transactions_type ADD VALUE IF NOT EXISTS '${v}';
         EXCEPTION WHEN duplicate_object THEN NULL;
         END $$;`,
      );
    } catch (_) {
      try {
        await queryInterface.sequelize.query(
          `ALTER TYPE "enum_board_member_transactions_type" ADD VALUE IF NOT EXISTS '${v}'`,
        );
      } catch (__) { /* already exists */ }
    }
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, 'expenses', 'board_member_id'))) {
      await queryInterface.addColumn('expenses', 'board_member_id', {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'board_members', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
      });
    }
    if (!(await columnExists(queryInterface, 'sales', 'board_member_id'))) {
      await queryInterface.addColumn('sales', 'board_member_id', {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'board_members', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
      });
    }

    await addEnumValues(queryInterface, ['current_payment_reversal', 'current_receipt_reversal']);
  },

  async down(queryInterface) {
    if (await columnExists(queryInterface, 'expenses', 'board_member_id')) {
      await queryInterface.removeColumn('expenses', 'board_member_id');
    }
    if (await columnExists(queryInterface, 'sales', 'board_member_id')) {
      await queryInterface.removeColumn('sales', 'board_member_id');
    }
    // Postgres can't drop enum values — left in place, harmless if unused.
  },
};
