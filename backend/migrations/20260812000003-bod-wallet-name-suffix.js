'use strict';

/**
 * BOD wallet names are now always "<prefix> Current Cash" / "<prefix> Current Bank" —
 * only the prefix is typed, the suffix is fixed by the UI and the API.
 * Normalise existing rows so the stored name matches what is displayed, and
 * rename the matching chart-of-accounts entries alongside them.
 */
const SUFFIX_RE = /[\s—–-]*current\s*(?:cash|bank)\s*$/i;

const compose = (stored, name, suffix) => {
  const prefix = String(stored ?? '').replace(SUFFIX_RE, '').trim()
    || String(name ?? '').replace(SUFFIX_RE, '').trim();
  return prefix ? `${prefix} ${suffix}` : null;
};

module.exports = {
  up: async (queryInterface) => {
    const [members] = await queryInterface.sequelize.query(`
      SELECT id, name, current_cash_name, current_bank_name,
             current_cash_coa_id, current_bank_coa_id
      FROM board_members
    `);

    for (const m of members) {
      const cash = compose(m.current_cash_name, m.name, 'Current Cash');
      const bank = compose(m.current_bank_name, m.name, 'Current Bank');
      if (cash === m.current_cash_name && bank === m.current_bank_name) continue;

      await queryInterface.sequelize.query(
        `UPDATE board_members
            SET current_cash_name = :cash, current_bank_name = :bank
          WHERE id = :id`,
        { replacements: { cash, bank, id: m.id } },
      );

      // Keep the COA display names in step — ensureBodAccounts only renames
      // them when a member is next edited.
      if (cash && m.current_cash_coa_id) {
        await queryInterface.sequelize.query(
          `UPDATE chart_of_accounts SET account_name = :cash WHERE id = :coa`,
          { replacements: { cash, coa: m.current_cash_coa_id } },
        );
      }
      if (bank && m.current_bank_coa_id) {
        await queryInterface.sequelize.query(
          `UPDATE chart_of_accounts SET account_name = :bank WHERE id = :coa`,
          { replacements: { bank, coa: m.current_bank_coa_id } },
        );
      }
    }
  },

  down: async () => {
    // The original free-text names are not recoverable; nothing to revert.
  },
};
