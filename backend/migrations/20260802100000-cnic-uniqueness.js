'use strict';

/**
 * One CNIC per person per shop — normalized digits stored in cnic_normalized
 * so 35202-1234567-1 and 3520212345671 are treated as the same. Uniqueness
 * is enforced per table (shop_id + cnic_normalized) and cross-table via
 * utils/cnic.js assertCnicAvailable().
 */

const TABLES = ['employees', 'customers', 'suppliers', 'board_members', 'guarantors'];

async function dropCnicIndexes(queryInterface) {
  for (const table of TABLES) {
    for (const name of [`${table}_cnic_key`, `${table}_cnic`, 'cnic', `${table}_shop_cnic_unique`, 'board_members_shop_cnic_unique']) {
      try { await queryInterface.removeIndex(table, name); } catch { /* ignore */ }
    }
  }
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;

    for (const table of TABLES) {
      const desc = await queryInterface.describeTable(table);
      if (!desc.cnic_normalized) {
        await queryInterface.addColumn(table, 'cnic_normalized', {
          type: DataTypes.STRING(20),
          allowNull: true,
        });
      } else {
        try {
          await queryInterface.changeColumn(table, 'cnic_normalized', {
            type: DataTypes.STRING(20),
            allowNull: true,
          });
        } catch { /* sqlite may not support alter */ }
      }
    }

    for (const table of TABLES) {
      await queryInterface.sequelize.query(`
        UPDATE ${table}
        SET cnic_normalized = REPLACE(REPLACE(REPLACE(cnic, '-', ''), ' ', ''), '.', '')
        WHERE cnic IS NOT NULL AND cnic != '' AND (cnic_normalized IS NULL OR cnic_normalized = '')
      `);
    }

    await dropCnicIndexes(queryInterface);

    for (const table of ['employees', 'customers', 'suppliers', 'board_members']) {
      try {
        await queryInterface.addIndex(table, ['shop_id', 'cnic_normalized'], {
          unique: true,
          name: `${table}_shop_cnic_norm_unique`,
        });
      } catch { /* duplicates in legacy data — app layer still blocks new conflicts */ }
    }

    try {
      await queryInterface.addIndex('guarantors', ['cnic_normalized'], {
        unique: true,
        name: 'guarantors_cnic_norm_unique',
      });
    } catch { /* ignore */ }
  },

  down: async (queryInterface) => {
    for (const table of ['employees', 'customers', 'suppliers', 'board_members']) {
      try { await queryInterface.removeIndex(table, `${table}_shop_cnic_norm_unique`); } catch { /* ignore */ }
    }
    try { await queryInterface.removeIndex('guarantors', 'guarantors_cnic_norm_unique'); } catch { /* ignore */ }

    for (const table of TABLES) {
      const desc = await queryInterface.describeTable(table);
      if (desc.cnic_normalized) {
        await queryInterface.removeColumn(table, 'cnic_normalized');
      }
    }
  },
};
