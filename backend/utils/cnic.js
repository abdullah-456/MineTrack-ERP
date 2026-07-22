'use strict';

const db = require('../models');
const { Op } = require('sequelize');

// Strip to digits for comparison — 35202-1234567-1 and 3520212345671 match.
function normalizeCnic(cnic) {
  if (cnic == null || !String(cnic).trim()) return null;
  const digits = String(cnic).replace(/\D/g, '');
  return digits || null;
}

// Standard Pakistani CNIC display: 35202-1234567-1
function formatCnic(normalized) {
  if (!normalized) return null;
  if (normalized.length === 13) {
    return `${normalized.slice(0, 5)}-${normalized.slice(5, 12)}-${normalized.slice(12)}`;
  }
  return normalized;
}

const PERSON_SOURCES = [
  { excludeKey: 'employeeId', model: 'Employee', label: 'employee', nameField: 'name' },
  { excludeKey: 'customerId', model: 'Customer', label: 'customer', nameField: 'name' },
  { excludeKey: 'supplierId', model: 'Supplier', label: 'supplier', nameField: 'company_name' },
  { excludeKey: 'boardMemberId', model: 'BoardMember', label: 'board member', nameField: 'name' },
];

// One CNIC = one person per shop — checked across employees, customers,
// suppliers, board members, and guarantors before save.
async function assertCnicAvailable(shopId, cnic, exclude = {}, transaction) {
  const cnic_normalized = normalizeCnic(cnic);
  if (!cnic_normalized) {
    return { cnic: null, cnic_normalized: null };
  }

  for (const src of PERSON_SOURCES) {
    const where = { shop_id: shopId, cnic_normalized };
    if (exclude[src.excludeKey]) where.id = { [Op.ne]: exclude[src.excludeKey] };

    const row = await db[src.model].findOne({
      where,
      attributes: ['id', src.nameField],
      transaction,
    });
    if (row) {
      const err = new Error(`CNIC already registered as ${src.label}: ${row[src.nameField]}`);
      err.statusCode = 409;
      throw err;
    }
  }

  const guarantorWhere = { cnic_normalized };
  if (exclude.guarantorId) guarantorWhere.id = { [Op.ne]: exclude.guarantorId };

  const guarantor = await db.Guarantor.findOne({
    where: guarantorWhere,
    include: [{
      model: db.Customer,
      attributes: ['shop_id'],
      required: true,
      where: { shop_id: shopId },
    }],
    transaction,
  });
  if (guarantor) {
    const err = new Error(`CNIC already registered as guarantor: ${guarantor.name}`);
    err.statusCode = 409;
    throw err;
  }

  return {
    cnic: formatCnic(cnic_normalized),
    cnic_normalized,
  };
}

module.exports = {
  normalizeCnic,
  formatCnic,
  assertCnicAvailable,
};
