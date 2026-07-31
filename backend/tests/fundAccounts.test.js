'use strict';

/**
 * Fund-account invariants: what the Cash and Bank pills measure, and what an
 * opening balance on a new fund account does to capital.
 *
 * Every test that writes runs inside a transaction that is ALWAYS rolled back,
 * so this suite is safe against a live database. Read-only invariants skip
 * cleanly when no database is reachable, matching accounting.test.js.
 */

const db = require('../models');
const { Op } = require('sequelize');
const { createFundAccount } = require('../utils/chartOfAccounts');
const { computeTotalBank, computeAccountBalance, fundAccountIds } = require('../utils/cashHelpers');

let dbAvailable = false;
beforeAll(async () => {
  try {
    await db.sequelize.authenticate();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
});
afterAll(async () => {
  if (dbAvailable) await db.sequelize.close();
});

const maybe = (name, fn) => test(name, async () => {
  if (!dbAvailable) {
    console.warn(`  skipped (no database): ${name}`);
    return;
  }
  await fn();
});

const round2 = (n) => Math.round(n * 100) / 100;

// Net equity for a shop, in its natural (credit-positive) sign.
async function equityTotal(shopId, transaction) {
  const accounts = await db.ChartOfAccount.findAll({
    where: { account_type: 'equity', [Op.or]: [{ shop_id: null }, { shop_id: shopId }] },
    attributes: ['id'],
    raw: true,
    transaction,
  });
  if (!accounts.length) return 0;
  const agg = await db.GeneralLedger.findOne({
    where: { shop_id: shopId, account_id: { [Op.in]: accounts.map(a => a.id) } },
    attributes: [
      [db.sequelize.fn('SUM', db.sequelize.col('credit')), 'c'],
      [db.sequelize.fn('SUM', db.sequelize.col('debit')), 'd'],
    ],
    raw: true,
    transaction,
  });
  return round2(parseFloat(agg?.c || 0) - parseFloat(agg?.d || 0));
}

// A shop that has a bank parent and at least one fund account holding money —
// everything below needs a real source to transfer from.
async function findUsableShop(transaction) {
  const bankParent = await db.ChartOfAccount.findOne({ where: { account_code: '05-BANK' }, transaction });
  const obe = await db.ChartOfAccount.findOne({ where: { account_code: '01-OBE' }, transaction });
  if (!bankParent || !obe) return null;

  const shops = await db.Shop.findAll({ attributes: ['id'], raw: true, transaction });
  for (const shop of shops) {
    // Vouchers require a real author, so a shop with no users is unusable here.
    // eslint-disable-next-line no-await-in-loop
    const user = await db.User.findOne({ where: { shop_id: shop.id }, attributes: ['id'], raw: true, transaction });
    if (!user) continue;

    // eslint-disable-next-line no-await-in-loop
    const ids = await fundAccountIds(shop.id, { activeOnly: true, transaction });
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      if (await computeAccountBalance(shop.id, id, { transaction }) > 1000) {
        return { shopId: shop.id, bankParent, sourceAccountId: id, userId: user.id };
      }
    }
  }
  return null;
}

describe('cash and bank totals', () => {
  maybe('bank total from the ledger matches the active bank account rows', async () => {
    const shops = await db.Shop.findAll({ attributes: ['id'], raw: true });
    for (const shop of shops) {
      const rows = await db.BankAccount.findAll({
        where: { shop_id: shop.id, kind: 'bank', is_active: true },
        attributes: ['current_balance'],
        raw: true,
      });
      if (!rows.length) continue;

      // Money posted to the shared '05-BANK' parent needs no adjustment here: a
      // BankAccount whose postings landed on the parent still tracks them in its
      // own current_balance, so the stored total already covers it. The parent
      // has no bank_accounts row and so is never deactivated.
      const stored = round2(rows.reduce((s, a) => s + parseFloat(a.current_balance || 0), 0));

      expect({ shop: shop.id, bank: await computeTotalBank(shop.id) })
        .toEqual({ shop: shop.id, bank: stored });
    }
  });

  maybe('a deactivated fund account is excluded from the capital totals', async () => {
    const shops = await db.Shop.findAll({ attributes: ['id'], raw: true });
    for (const shop of shops) {
      const inactive = await db.BankAccount.findAll({
        where: { shop_id: shop.id, is_active: false },
        attributes: ['chart_of_account_id'],
        raw: true,
      });
      if (!inactive.length) continue;

      const active = await fundAccountIds(shop.id, { activeOnly: true });
      for (const row of inactive) {
        if (!row.chart_of_account_id) continue;
        expect(active).not.toContain(row.chart_of_account_id);
      }
    }
  });

  maybe('the payment guard still sees every cash account, closed or not', async () => {
    // cashAccountIds backs computeCashFlow and assertCashAvailable, which are
    // about money that physically exists — they must not inherit the dashboard's
    // active-only view.
    const shops = await db.Shop.findAll({ attributes: ['id'], raw: true });
    for (const shop of shops) {
      const all = await fundAccountIds(shop.id, { kind: 'cash' });
      const active = await fundAccountIds(shop.id, { kind: 'cash', activeOnly: true });
      expect(all.length).toBeGreaterThanOrEqual(active.length);
      active.forEach(id => expect(all).toContain(id));
    }
  });
});

describe('opening balance on a new fund account', () => {
  maybe('funded as new capital, equity rises by the opening balance', async () => {
    const t = await db.sequelize.transaction();
    try {
      const target = await findUsableShop(t);
      if (!target) {
        console.warn('  skipped: no shop with a funded cash/bank account');
        return;
      }
      const { shopId, bankParent } = target;
      const before = await equityTotal(shopId, t);

      const { ledgerAccount } = await createFundAccount({
        shopId,
        accountName: `__test_new_capital_${Date.now()}`,
        parent: bankParent,
        opening_balance: 1000,
        funding_source: 'new_capital',
        createdBy: target.userId,
      }, t);

      expect(await computeAccountBalance(shopId, ledgerAccount.id, { transaction: t })).toBe(1000);
      expect(await equityTotal(shopId, t)).toBe(round2(before + 1000));
    } finally {
      await t.rollback();
    }
  });

  maybe('funded by transfer, equity is unchanged and the source is drawn down', async () => {
    const t = await db.sequelize.transaction();
    try {
      const target = await findUsableShop(t);
      if (!target) {
        console.warn('  skipped: no shop with a funded cash/bank account');
        return;
      }
      const { shopId, bankParent, sourceAccountId } = target;
      const equityBefore = await equityTotal(shopId, t);
      const sourceBefore = await computeAccountBalance(shopId, sourceAccountId, { transaction: t });

      const { ledgerAccount } = await createFundAccount({
        shopId,
        accountName: `__test_transfer_${Date.now()}`,
        parent: bankParent,
        opening_balance: 1000,
        funding_source: 'transfer',
        source_account_id: sourceAccountId,
        createdBy: target.userId,
      }, t);

      // The money moved; the business is no richer for it.
      expect(await equityTotal(shopId, t)).toBe(equityBefore);
      expect(await computeAccountBalance(shopId, ledgerAccount.id, { transaction: t })).toBe(1000);
      expect(await computeAccountBalance(shopId, sourceAccountId, { transaction: t }))
        .toBe(round2(sourceBefore - 1000));
    } finally {
      await t.rollback();
    }
  });

  maybe('a transfer with no source is rejected', async () => {
    const t = await db.sequelize.transaction();
    try {
      const target = await findUsableShop(t);
      if (!target) {
        console.warn('  skipped: no shop with a funded cash/bank account');
        return;
      }
      await expect(createFundAccount({
        shopId: target.shopId,
        accountName: `__test_no_source_${Date.now()}`,
        parent: target.bankParent,
        opening_balance: 1000,
        funding_source: 'transfer',
        createdBy: target.userId,
      }, t)).rejects.toThrow(/moved from/i);
    } finally {
      await t.rollback();
    }
  });

  maybe('a transfer larger than the source holds is rejected', async () => {
    const t = await db.sequelize.transaction();
    try {
      const target = await findUsableShop(t);
      if (!target) {
        console.warn('  skipped: no shop with a funded cash/bank account');
        return;
      }
      const available = await computeAccountBalance(target.shopId, target.sourceAccountId, { transaction: t });
      await expect(createFundAccount({
        shopId: target.shopId,
        accountName: `__test_overdraw_${Date.now()}`,
        parent: target.bankParent,
        opening_balance: available + 1,
        funding_source: 'transfer',
        source_account_id: target.sourceAccountId,
        createdBy: target.userId,
      }, t)).rejects.toThrow(/insufficient/i);
    } finally {
      await t.rollback();
    }
  });

  maybe('an unknown funding_source is rejected', async () => {
    const t = await db.sequelize.transaction();
    try {
      const target = await findUsableShop(t);
      if (!target) {
        console.warn('  skipped: no shop with a funded cash/bank account');
        return;
      }
      await expect(createFundAccount({
        shopId: target.shopId,
        accountName: `__test_bad_source_${Date.now()}`,
        parent: target.bankParent,
        opening_balance: 1000,
        funding_source: 'borrowed',
        createdBy: target.userId,
      }, t)).rejects.toThrow(/funding_source/i);
    } finally {
      await t.rollback();
    }
  });
});
