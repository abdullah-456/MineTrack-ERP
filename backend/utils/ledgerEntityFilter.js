'use strict';

const db = require('../models');
const { Op } = require('sequelize');

const ENTITY_TYPES = ['customer', 'supplier', 'employee', 'board_member'];

const CATEGORY_ACCOUNT_CODES = {
  customer: ['05-AR', '03-CUSTADV'],
  supplier: ['03-AP', '05-SUPCREDIT'],
  employee: ['05-EMPADVLOAN', '07-SALARIES', '03-SALPAY'],
};

function escapeLike(value) {
  return String(value).replace(/[%_\\]/g, '\\$&');
}

async function voucherIdsForAccountCodes(shopId, codes, transaction) {
  const accounts = await db.ChartOfAccount.findAll({
    where: { account_code: { [Op.in]: codes } },
    attributes: ['id'],
    transaction,
  });
  if (!accounts.length) return [];
  const rows = await db.GeneralLedger.findAll({
    where: { shop_id: shopId, account_id: { [Op.in]: accounts.map(a => a.id) } },
    attributes: ['voucher_id'],
    group: ['voucher_id'],
    raw: true,
    transaction,
  });
  return rows.map(r => r.voucher_id);
}

async function voucherIdsForAccountIds(shopId, accountIds, transaction) {
  if (!accountIds.length) return [];
  const rows = await db.GeneralLedger.findAll({
    where: { shop_id: shopId, account_id: { [Op.in]: accountIds } },
    attributes: ['voucher_id'],
    group: ['voucher_id'],
    raw: true,
    transaction,
  });
  return rows.map(r => r.voucher_id);
}

async function voucherIdsForNarration(shopId, name, transaction) {
  if (!name?.trim()) return [];
  const pattern = `%${escapeLike(name.trim())}%`;
  const vouchers = await db.Voucher.findAll({
    where: { shop_id: shopId, narration: { [Op.iLike]: pattern } },
    attributes: ['id'],
    raw: true,
    transaction,
  });
  return vouchers.map(v => v.id);
}

async function boardMemberAccountIds(shopId, memberId, transaction) {
  if (memberId) {
    const member = await db.BoardMember.findOne({
      where: { id: memberId, shop_id: shopId },
      attributes: ['chart_of_account_id'],
      transaction,
    });
    return member?.chart_of_account_id ? [member.chart_of_account_id] : [];
  }
  const members = await db.BoardMember.findAll({
    where: { shop_id: shopId },
    attributes: ['chart_of_account_id'],
    transaction,
  });
  return members.map(m => m.chart_of_account_id).filter(Boolean);
}

// Returns voucher IDs whose GL lines should be shown for the given entity
// filter. When a specific person is chosen, every line of each matching
// voucher is included so the full double-entry stays visible.
async function resolveEntityVoucherIds(shopId, entityType, entityId, transaction) {
  if (!ENTITY_TYPES.includes(entityType)) return null;

  if (entityType === 'board_member') {
    const accountIds = await boardMemberAccountIds(shopId, entityId || null, transaction);
    return voucherIdsForAccountIds(shopId, accountIds, transaction);
  }

  if (!entityId) {
    const codes = CATEGORY_ACCOUNT_CODES[entityType];
    return codes ? voucherIdsForAccountCodes(shopId, codes, transaction) : [];
  }

  let name = '';
  if (entityType === 'customer') {
    const row = await db.Customer.findOne({ where: { id: entityId, shop_id: shopId }, attributes: ['name'], transaction });
    name = row?.name;
  } else if (entityType === 'supplier') {
    const row = await db.Supplier.findOne({ where: { id: entityId, shop_id: shopId }, attributes: ['company_name'], transaction });
    name = row?.company_name;
  } else if (entityType === 'employee') {
    const row = await db.Employee.findOne({ where: { id: entityId, shop_id: shopId }, attributes: ['name'], transaction });
    name = row?.name;
  }
  if (!name) return [];
  return voucherIdsForNarration(shopId, name, transaction);
}

async function listFilterOptions(shopId) {
  const [customers, suppliers, employees, boardMembers, branches] = await Promise.all([
    db.Customer.findAll({ where: { shop_id: shopId }, attributes: ['id', 'name'], order: [['name', 'ASC']] }),
    db.Supplier.findAll({ where: { shop_id: shopId }, attributes: ['id', 'company_name'], order: [['company_name', 'ASC']] }),
    db.Employee.findAll({ where: { shop_id: shopId }, attributes: ['id', 'name'], order: [['name', 'ASC']] }),
    db.BoardMember.findAll({
      where: { shop_id: shopId },
      attributes: ['id', 'name', 'branch_id'],
      include: [{ model: db.Branch, attributes: ['id', 'name'] }],
      order: [['name', 'ASC']],
    }),
    db.Branch.findAll({
      where: { shop_id: shopId, status: 'active' },
      attributes: ['id', 'name', 'is_default'],
      order: [['is_default', 'DESC'], ['name', 'ASC']],
    }),
  ]);
  return {
    branches: branches.map(b => ({ id: b.id, name: b.name })),
    customers: customers.map(c => ({ id: c.id, name: c.name })),
    suppliers: suppliers.map(s => ({ id: s.id, name: s.company_name })),
    employees: employees.map(e => ({ id: e.id, name: e.name })),
    board_members: boardMembers.map(b => ({
      id: b.id,
      name: b.Branch?.name ? `${b.name} (${b.Branch.name})` : b.name,
      branch_id: b.branch_id,
    })),
  };
}

module.exports = {
  ENTITY_TYPES,
  resolveEntityVoucherIds,
  listFilterOptions,
};
