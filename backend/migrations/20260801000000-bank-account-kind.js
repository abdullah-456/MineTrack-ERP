'use strict';

/**
 * Lets a "fund account" be either a bank account or a plain cash account
 * (e.g. "Petty Cash", "Cash Drawer 2") — both work identically as a simple
 * running balance selectable wherever a payment method is chosen. This is
 * distinct from the single shared "Cash in Hand" (05-CASH), which keeps its
 * special daily-rollover reconciliation (CashSession) untouched — kind='cash'
 * rows here are *additional* cash accounts, not a replacement for it.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('bank_accounts');
    if (!desc.kind) {
      await queryInterface.addColumn('bank_accounts', 'kind', {
        type: Sequelize.ENUM('bank', 'cash'),
        allowNull: false,
        defaultValue: 'bank',
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('bank_accounts');
    if (desc.kind) {
      await queryInterface.removeColumn('bank_accounts', 'kind');
      // Drop the orphaned enum type Postgres leaves behind (harmless if it doesn't exist).
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_bank_accounts_kind";').catch(() => {});
    }
  },
};
