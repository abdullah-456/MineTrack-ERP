#!/usr/bin/env node
'use strict';

/**
 * Read-only report: money posted against the shared '05-BANK' code.
 *
 * '05-BANK' is a catch-all parent, not a real bank. Postings land there when a
 * BankAccount has no chart_of_account_id and bankAccountCode() falls back to the
 * shared code — which was every posting made before per-account linking existed.
 * The totals are correct, but the money is not attributed to any named bank, so
 * filtering the General Ledger by that bank understates it.
 *
 * This script ONLY reads and prints. It rewrites nothing. Use it to decide
 * whether the balance should be re-attributed to a named account (a reviewed
 * migration) or left alone.
 *
 *   node scripts/report-unassigned-bank.js [shopId]
 */

const db = require('../models');
const { Op } = require('sequelize');

const money = (n) => parseFloat(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const shopArg = process.argv[2];
  const shopIds = shopArg
    ? [parseInt(shopArg, 10)]
    : (await db.GeneralLedger.findAll({
      attributes: [[db.sequelize.fn('DISTINCT', db.sequelize.col('shop_id')), 'shop_id']],
      raw: true,
    })).map(r => r.shop_id).filter(Boolean);

  const parent = await db.ChartOfAccount.findOne({ where: { account_code: '05-BANK' }, raw: true });
  if (!parent) {
    console.log('No 05-BANK account in the chart of accounts — nothing to report.');
    return;
  }

  for (const shopId of shopIds) {
    const rows = await db.GeneralLedger.findAll({
      where: { shop_id: shopId, account_id: parent.id },
      include: [{ model: db.Voucher, attributes: ['voucher_number', 'voucher_type', 'narration'] }],
      order: [['entry_date', 'ASC'], ['id', 'ASC']],
    });
    if (!rows.length) continue;

    console.log(`\n${'='.repeat(100)}`);
    console.log(`Shop ${shopId} — postings against the shared '05-BANK' (${parent.account_name})`);
    console.log('='.repeat(100));
    console.log(
      'DATE'.padEnd(12), 'VOUCHER'.padEnd(13), 'TYPE'.padEnd(9),
      'DEBIT'.padStart(16), 'CREDIT'.padStart(16), ' NARRATION',
    );

    let net = 0;
    rows.forEach(r => {
      net += parseFloat(r.debit || 0) - parseFloat(r.credit || 0);
      console.log(
        String(r.entry_date).slice(0, 10).padEnd(12),
        String(r.Voucher?.voucher_number || '—').padEnd(13),
        String(r.Voucher?.voucher_type || '—').padEnd(9),
        money(r.debit).padStart(16),
        money(r.credit).padStart(16),
        ' ' + String(r.Voucher?.narration || '').slice(0, 48),
      );
    });

    console.log('-'.repeat(100));
    console.log(`${rows.length} rows — unattributed balance: Rs. ${money(net)}`);

    // Named bank accounts this balance could belong to, with what the ledger
    // already attributes to each, so the gap against their stored balance is
    // visible side by side.
    const children = await db.ChartOfAccount.findAll({
      where: { parent_account_id: parent.id, shop_id: shopId },
      attributes: ['id', 'account_code', 'account_name'],
      raw: true,
    });
    if (!children.length) continue;

    const glByAccount = await db.GeneralLedger.findAll({
      where: { shop_id: shopId, account_id: { [Op.in]: children.map(c => c.id) } },
      attributes: [
        'account_id',
        [db.sequelize.fn('SUM', db.sequelize.literal('debit - credit')), 'net'],
      ],
      group: ['account_id'],
      raw: true,
    });
    const glById = {};
    glByAccount.forEach(r => { glById[r.account_id] = parseFloat(r.net || 0); });

    const funds = await db.BankAccount.findAll({
      where: { shop_id: shopId },
      attributes: ['account_name', 'current_balance', 'chart_of_account_id', 'is_active'],
      raw: true,
    });
    const fundByCoa = {};
    funds.forEach(f => { if (f.chart_of_account_id) fundByCoa[f.chart_of_account_id] = f; });

    console.log('\nNamed bank accounts under 05-BANK:');
    console.log(
      '  CODE'.padEnd(16), 'NAME'.padEnd(26),
      'LEDGER'.padStart(16), 'STORED'.padStart(16), 'GAP'.padStart(16),
    );
    children.forEach(c => {
      const ledger = glById[c.id] || 0;
      const fund = fundByCoa[c.id];
      const stored = fund ? parseFloat(fund.current_balance || 0) : null;
      const gap = stored === null ? null : stored - ledger;
      console.log(
        '  ' + String(c.account_code).padEnd(14),
        String(c.account_name).slice(0, 24).padEnd(26),
        money(ledger).padStart(16),
        (stored === null ? '—' : money(stored)).padStart(16),
        (gap === null ? '—' : money(gap)).padStart(16),
        fund && !fund.is_active ? ' (deactivated)' : '',
      );
    });
    console.log(
      '\nAn account whose GAP equals the unattributed balance above is almost certainly\n'
      + 'where that money belongs — its stored balance already counts it, the ledger does not.',
    );
  }

  console.log('\nRead-only report. Nothing was modified.');
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
