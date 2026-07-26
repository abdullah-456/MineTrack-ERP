'use strict';

/**
 * Links each BankAccount row to its own Chart of Accounts sub-account, nested
 * under the shared '05-BANK' account. Previously every bank-type transaction
 * posted to the single aggregate 05-BANK code regardless of which named bank
 * account (e.g. "Office Account", "Office 2 Account") it actually moved
 * through — this gives each one its own real ledger line going forward.
 *
 * Existing GL history stays exactly where it already is (under 05-BANK) —
 * this migration only affects new postings from here on, it does not rewrite
 * past vouchers/general_ledger rows.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;

    const desc = await queryInterface.describeTable('bank_accounts');
    if (!desc.chart_of_account_id) {
      await queryInterface.addColumn('bank_accounts', 'chart_of_account_id', {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'chart_of_accounts', key: 'id' },
      });
    }

    const [[bankParent]] = await queryInterface.sequelize.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '05-BANK'`,
    );
    if (!bankParent) return; // seed data missing entirely — nothing to link against

    const [accounts] = await queryInterface.sequelize.query(
      `SELECT id, shop_id, account_name FROM bank_accounts WHERE chart_of_account_id IS NULL ORDER BY id ASC`,
    );
    if (accounts.length === 0) return;

    let seq = await queryInterface.sequelize.query(
      `SELECT COUNT(*) as count FROM chart_of_accounts WHERE parent_account_id = ${bankParent.id}`,
    ).then(([[row]]) => parseInt(row.count, 10) + 1);

    for (const acc of accounts) {
      let code;
      // eslint-disable-next-line no-await-in-loop
      do {
        code = `05-BANK-${String(seq).padStart(2, '0')}`;
        seq += 1;
        // eslint-disable-next-line no-await-in-loop
      } while ((await queryInterface.sequelize.query(
        `SELECT id FROM chart_of_accounts WHERE account_code = '${code}'`,
      ))[0].length > 0);

      // eslint-disable-next-line no-await-in-loop
      const now = new Date();
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.bulkInsert('chart_of_accounts', [{
        account_code: code,
        account_name: acc.account_name,
        account_type: 'asset',
        parent_account_id: bankParent.id,
        shop_id: acc.shop_id,
        is_active: true,
        created_at: now,
        updated_at: now,
      }]);

      // eslint-disable-next-line no-await-in-loop
      const [[inserted]] = await queryInterface.sequelize.query(
        `SELECT id FROM chart_of_accounts WHERE account_code = :code`,
        { replacements: { code } },
      );

      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(
        `UPDATE bank_accounts SET chart_of_account_id = :coaId WHERE id = :bankAccId`,
        { replacements: { coaId: inserted.id, bankAccId: acc.id } },
      );
    }
  },

  down: async (queryInterface) => {
    const [accounts] = await queryInterface.sequelize.query(
      `SELECT chart_of_account_id FROM bank_accounts WHERE chart_of_account_id IS NOT NULL`,
    );
    const coaIds = accounts.map(a => a.chart_of_account_id).filter(Boolean);

    await queryInterface.sequelize.query(`UPDATE bank_accounts SET chart_of_account_id = NULL`);

    if (coaIds.length > 0) {
      // Only remove the ones with no ledger postings of their own — safety net
      // in case something already posted against a linked sub-account.
      const [postedRows] = await queryInterface.sequelize.query(
        `SELECT DISTINCT account_id FROM general_ledger WHERE account_id IN (${coaIds.join(',')})`,
      );
      const posted = new Set(postedRows.map(r => r.account_id));
      const removable = coaIds.filter(id => !posted.has(id));
      if (removable.length > 0) {
        await queryInterface.sequelize.query(`DELETE FROM chart_of_accounts WHERE id IN (${removable.join(',')})`);
      }
    }

    const desc = await queryInterface.describeTable('bank_accounts');
    if (desc.chart_of_account_id) {
      await queryInterface.removeColumn('bank_accounts', 'chart_of_account_id');
    }
  },
};
