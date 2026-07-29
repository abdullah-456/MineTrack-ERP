'use strict';

/**
 * Per-shop voucher numbering.
 *
 * generateVoucherNumber() derived the next number from COUNT(*) of that shop's
 * vouchers, which is wrong twice over:
 *
 *   • models/voucher.js declares voucher_number globally unique, but the count
 *     is scoped per shop — so shop A and shop B both produce "VCH-00001". The
 *     unique index this migration adds could not have been created at all
 *     without fixing that first.
 *   • Two concurrent posts in the same shop read the same COUNT before either
 *     commits, so both generate the same number.
 *
 * A counter row per shop, incremented under the row lock that ON CONFLICT DO
 * UPDATE takes, gives a gap-free sequence that is safe under concurrency and
 * rolls back with its transaction. The visible format is unchanged.
 */

async function tableExists(queryInterface, table) {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;

    if (!(await tableExists(queryInterface, 'voucher_sequences'))) {
      await queryInterface.createTable('voucher_sequences', {
        shop_id:     { type: DataTypes.INTEGER, primaryKey: true, allowNull: false, references: { model: 'shops', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        next_number: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
        created_at:  { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at:  { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
    }

    // Seed each shop's counter past its highest existing voucher number so no
    // number is ever reissued.
    await queryInterface.sequelize.query(`
      INSERT INTO voucher_sequences (shop_id, next_number, created_at, updated_at)
      SELECT v.shop_id,
             MAX(COALESCE(NULLIF(regexp_replace(v.voucher_number, '\\D', '', 'g'), ''), '0')::int) + 1,
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM vouchers v
       WHERE v.shop_id IS NOT NULL
       GROUP BY v.shop_id
      ON CONFLICT (shop_id) DO NOTHING
    `);

    // Resolve any pre-existing cross-shop duplicates before the unique index
    // goes on, renumbering the later voucher rather than deleting anything.
    const [duplicates] = await queryInterface.sequelize.query(`
      SELECT shop_id, voucher_number, COUNT(*) AS n
        FROM vouchers
       WHERE voucher_number IS NOT NULL
       GROUP BY shop_id, voucher_number
      HAVING COUNT(*) > 1
    `);
    if (duplicates.length) {
      console.warn(`  found ${duplicates.length} duplicate (shop_id, voucher_number) group(s); renumbering the later rows`);
      await queryInterface.sequelize.query(`
        WITH ranked AS (
          SELECT id, shop_id,
                 ROW_NUMBER() OVER (PARTITION BY shop_id, voucher_number ORDER BY id) AS rn
            FROM vouchers
           WHERE voucher_number IS NOT NULL
        ),
        bumped AS (
          SELECT r.id, r.shop_id,
                 (SELECT next_number FROM voucher_sequences s WHERE s.shop_id = r.shop_id)
                   + ROW_NUMBER() OVER (PARTITION BY r.shop_id ORDER BY r.id) - 1 AS newnum
            FROM ranked r
           WHERE r.rn > 1
        )
        UPDATE vouchers v
           SET voucher_number = 'VCH-' || LPAD(b.newnum::text, 5, '0')
          FROM bumped b
         WHERE v.id = b.id
      `);
      // Push each affected shop's counter past the numbers just handed out.
      await queryInterface.sequelize.query(`
        UPDATE voucher_sequences s
           SET next_number = sub.maxnum + 1
          FROM (
            SELECT shop_id,
                   MAX(COALESCE(NULLIF(regexp_replace(voucher_number, '\\D', '', 'g'), ''), '0')::int) AS maxnum
              FROM vouchers WHERE shop_id IS NOT NULL GROUP BY shop_id
          ) sub
         WHERE s.shop_id = sub.shop_id AND sub.maxnum >= s.next_number
      `);
    }

    const existing = await queryInterface.showIndex('vouchers');
    if (!existing.some(i => i.name === 'vouchers_shop_id_voucher_number')) {
      await queryInterface.addIndex('vouchers', ['shop_id', 'voucher_number'], {
        unique: true,
        name: 'vouchers_shop_id_voucher_number',
      });
    }
  },

  down: async (queryInterface) => {
    const existing = await queryInterface.showIndex('vouchers');
    if (existing.some(i => i.name === 'vouchers_shop_id_voucher_number')) {
      await queryInterface.removeIndex('vouchers', 'vouchers_shop_id_voucher_number');
    }
    if (await tableExists(queryInterface, 'voucher_sequences')) {
      await queryInterface.dropTable('voucher_sequences');
    }
  },
};
