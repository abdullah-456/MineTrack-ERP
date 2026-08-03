'use strict';

/**
 * Fiscal year infrastructure: tables, shop fields, 01-RE account, voucher types,
 * and bootstrap of the first open FY for existing shops (Jul 1 – Jun 30).
 */

const RETAINED_EARNINGS = '01-RE';

function alignToJuly1(dateStr) {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-07-01`;
}

function endJune30(startDateStr) {
  const startYear = parseInt(startDateStr.slice(0, 4), 10);
  return `${startYear + 1}-06-30`;
}

function fiscalYearLabel(startDateStr) {
  const y1 = parseInt(startDateStr.slice(0, 4), 10);
  return `FY ${y1}-${String((y1 + 1) % 100).padStart(2, '0')}`;
}

// Guards every DDL step against a database where this migration already ran
// partway (e.g. a prior attempt that got interrupted before SequelizeMeta
// recorded it as done) — re-running must skip whatever already exists instead
// of erroring, rather than assuming a clean slate like the rest of this file
// originally did for the fiscal_years/fiscal_year_snapshots tables and the
// vouchers.fiscal_year_id column.
async function tableExists(queryInterface, name) {
  const tables = await queryInterface.showAllTables();
  const names = new Set(tables.map(t => (typeof t === 'string' ? t : t.tableName)));
  return names.has(name);
}

async function columnExists(queryInterface, table, column) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${column}'`,
  );
  return rows.length > 0;
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const dialect = queryInterface.sequelize.getDialect();

    // ── fiscal_years ────────────────────────────────────────────────────────
    if (!(await tableExists(queryInterface, 'fiscal_years'))) {
      await queryInterface.createTable('fiscal_years', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        shop_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'shops', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        label: { type: Sequelize.STRING, allowNull: false },
        start_date: { type: Sequelize.DATEONLY, allowNull: false },
        end_date: { type: Sequelize.DATEONLY, allowNull: false },
        status: {
          type: Sequelize.ENUM('open', 'closed'),
          allowNull: false,
          defaultValue: 'open',
        },
        closed_at: { type: Sequelize.DATE, allowNull: true },
        closed_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        closing_voucher_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'vouchers', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        opening_voucher_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'vouchers', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
    }
    try {
      await queryInterface.addIndex('fiscal_years', ['shop_id', 'start_date'], { unique: true, name: 'fiscal_years_shop_start_unique' });
    } catch (_) { /* already exists */ }

    // ── fiscal_year_snapshots ───────────────────────────────────────────────
    if (!(await tableExists(queryInterface, 'fiscal_year_snapshots'))) {
      await queryInterface.createTable('fiscal_year_snapshots', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        fiscal_year_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'fiscal_years', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        account_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'chart_of_accounts', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        debit: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        credit: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        balance: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
    }
    try {
      await queryInterface.addIndex('fiscal_year_snapshots', ['fiscal_year_id', 'account_id'], {
        unique: true,
        name: 'fiscal_year_snapshots_fy_account_unique',
      });
    } catch (_) { /* already exists */ }

    // ── shop fields ─────────────────────────────────────────────────────────
    const [shopCols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'shops' AND column_name IN
         ('current_fiscal_year_id','fiscal_year_end_month','fiscal_year_end_day')`,
    );
    const existingShopCols = new Set(shopCols.map(r => r.column_name));

    if (!existingShopCols.has('current_fiscal_year_id')) {
      await queryInterface.addColumn('shops', 'current_fiscal_year_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'fiscal_years', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
    if (!existingShopCols.has('fiscal_year_end_month')) {
      await queryInterface.addColumn('shops', 'fiscal_year_end_month', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 6,
      });
    }
    if (!existingShopCols.has('fiscal_year_end_day')) {
      await queryInterface.addColumn('shops', 'fiscal_year_end_day', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 30,
      });
    }

    // ── voucher fiscal_year_id + closing type ───────────────────────────────
    if (!(await columnExists(queryInterface, 'vouchers', 'fiscal_year_id'))) {
      await queryInterface.addColumn('vouchers', 'fiscal_year_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'fiscal_years', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }

    if (dialect === 'postgres') {
      await queryInterface.sequelize.query(
        `DO $$ BEGIN
           ALTER TYPE enum_vouchers_voucher_type ADD VALUE IF NOT EXISTS 'closing';
         EXCEPTION WHEN duplicate_object THEN NULL;
         END $$;`,
      ).catch(async () => {
        try {
          await queryInterface.sequelize.query(
            `ALTER TYPE "enum_vouchers_voucher_type" ADD VALUE IF NOT EXISTS 'closing'`,
          );
        } catch (_) { /* already present */ }
      });
    }

    // ── 01-RE Retained Earnings ─────────────────────────────────────────────
    const [existingRe] = await queryInterface.sequelize.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '${RETAINED_EARNINGS}' LIMIT 1`,
    );
    if (!existingRe.length) {
      const [[capital]] = await queryInterface.sequelize.query(
        `SELECT id FROM chart_of_accounts WHERE account_code = '01-CAPITAL' LIMIT 1`,
      );
      await queryInterface.sequelize.query(
        `INSERT INTO chart_of_accounts
           (account_code, account_name, account_type, parent_account_id, shop_id, is_active, created_at, updated_at)
         VALUES
           ('${RETAINED_EARNINGS}', 'Retained Earnings', 'equity', ${capital?.id || 'NULL'}, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      );
      console.log('  created 01-RE (Retained Earnings)');
    }

    // ── permission: accounting.fiscal_year.close ──────────────────────────
    const [permExists] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE module = 'accounting' AND action = 'fiscal_year.close' LIMIT 1`,
    );
    if (!permExists.length) {
      await queryInterface.sequelize.query(
        `INSERT INTO permissions (module, action, created_at, updated_at)
         VALUES ('accounting', 'fiscal_year.close', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      );
      const [[newPerm]] = await queryInterface.sequelize.query(
        `SELECT id FROM permissions WHERE module = 'accounting' AND action = 'fiscal_year.close' LIMIT 1`,
      );
      for (const roleName of ['admin', 'accountant']) {
        const [[role]] = await queryInterface.sequelize.query(
          `SELECT id FROM roles WHERE name = '${roleName}' LIMIT 1`,
        );
        if (!role || !newPerm) continue;
        const [grant] = await queryInterface.sequelize.query(
          `SELECT 1 FROM role_permissions WHERE role_id = ${role.id} AND permission_id = ${newPerm.id} LIMIT 1`,
        );
        if (!grant.length) {
          await queryInterface.sequelize.query(
            `INSERT INTO role_permissions (role_id, permission_id) VALUES (${role.id}, ${newPerm.id})`,
          );
        }
      }
    }

    // ── bootstrap first FY for existing shops ─────────────────────────────
    const [shops] = await queryInterface.sequelize.query(
      `SELECT id, created_at FROM shops WHERE setup_completed = true`,
    );

    for (const shop of shops) {
      const [existingFy] = await queryInterface.sequelize.query(
        `SELECT id FROM fiscal_years WHERE shop_id = ${shop.id} LIMIT 1`,
      );
      if (existingFy.length) continue;

      const [[glMin]] = await queryInterface.sequelize.query(
        `SELECT MIN(entry_date)::date AS min_date
           FROM general_ledger WHERE shop_id = ${shop.id}`,
      );
      const anchor = glMin?.min_date
        ? String(glMin.min_date).slice(0, 10)
        : String(shop.created_at).slice(0, 10);
      const startDate = alignToJuly1(anchor);
      const endDate = endJune30(startDate);
      const label = fiscalYearLabel(startDate);

      const [, inserted] = await queryInterface.sequelize.query(
        `INSERT INTO fiscal_years (shop_id, label, start_date, end_date, status, created_at, updated_at)
         VALUES (${shop.id}, '${label}', '${startDate}', '${endDate}', 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
      );
      const fyId = inserted?.[0]?.id;
      if (fyId) {
        await queryInterface.sequelize.query(
          `UPDATE shops SET current_fiscal_year_id = ${fyId} WHERE id = ${shop.id}`,
        );
        console.log(`  bootstrapped ${label} for shop ${shop.id}`);
      }
    }
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('vouchers', 'fiscal_year_id');
    await queryInterface.removeColumn('shops', 'current_fiscal_year_id');
    await queryInterface.removeColumn('shops', 'fiscal_year_end_month');
    await queryInterface.removeColumn('shops', 'fiscal_year_end_day');
    await queryInterface.dropTable('fiscal_year_snapshots');
    await queryInterface.dropTable('fiscal_years');

    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*)::int AS n FROM general_ledger gl
         JOIN chart_of_accounts coa ON coa.id = gl.account_id
        WHERE coa.account_code = '01-RE'`,
    );
    if (!rows[0]?.n) {
      await queryInterface.sequelize.query(
        `DELETE FROM chart_of_accounts WHERE account_code = '01-RE'`,
      );
    }

    await queryInterface.sequelize.query(
      `DELETE FROM role_permissions WHERE permission_id IN (
         SELECT id FROM permissions WHERE module = 'accounting' AND action = 'fiscal_year.close'
       )`,
    );
    await queryInterface.sequelize.query(
      `DELETE FROM permissions WHERE module = 'accounting' AND action = 'fiscal_year.close'`,
    );
  },
};
