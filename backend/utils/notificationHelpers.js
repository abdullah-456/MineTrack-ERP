'use strict';

const db = require('../models');

const REMINDER_WINDOW_DAYS = 30;

function windowEndDate() {
  const d = new Date();
  d.setDate(d.getDate() + REMINDER_WINDOW_DAYS);
  return d.toISOString().slice(0, 10);
}

const DOCUMENT_OWNER_META = {
  branch: { model: 'Branch', nameField: 'name', moduleLabel: 'Mines' },
  supplier: { model: 'Supplier', nameField: 'company_name', moduleLabel: 'Suppliers' },
  customer: { model: 'Customer', nameField: 'name', moduleLabel: 'Customers' },
  board_member: { model: 'BoardMember', nameField: 'name', moduleLabel: 'Board Members' },
  vehicle: { model: 'Vehicle', nameField: 'vehicle_number', moduleLabel: 'Vehicles' },
  shop: { model: 'Shop', nameField: 'name', moduleLabel: 'Company Profile' },
};

const CATEGORY_LABELS = {
  license: 'License', cnic: 'CNIC', contract: 'Contract', vehicle_papers: 'Vehicle Papers',
  insurance: 'Insurance', lease: 'Lease Document', other: 'Document',
};

// Each entry: currently-qualifying expiring items for one notification `type`.
// Returns [] rather than throwing when a source table has nothing in the
// window — callers still run the delete-stale pass for the type either way.
async function collectDocumentExpiries() {
  const documents = await db.Document.findAll({
    where: { expiry_date: { [db.Sequelize.Op.ne]: null, [db.Sequelize.Op.lte]: windowEndDate() } },
  });
  if (documents.length === 0) return [];

  const ownersByType = {};
  documents.forEach((doc) => {
    ownersByType[doc.owner_type] = ownersByType[doc.owner_type] || new Set();
    ownersByType[doc.owner_type].add(doc.owner_id);
  });

  const ownerNames = {};
  for (const [ownerType, ids] of Object.entries(ownersByType)) {
    const meta = DOCUMENT_OWNER_META[ownerType];
    if (!meta) continue;
    if (ownerType === 'shop') continue; // resolved directly below, single row per shop
    const rows = await db[meta.model].findAll({ where: { id: Array.from(ids) }, attributes: ['id', meta.nameField] });
    ownerNames[ownerType] = {};
    rows.forEach((r) => { ownerNames[ownerType][r.id] = r[meta.nameField]; });
  }

  return documents.map((doc) => {
    const meta = DOCUMENT_OWNER_META[doc.owner_type] || {};
    const ownerLabel = doc.owner_type === 'shop' ? 'Company' : (ownerNames[doc.owner_type]?.[doc.owner_id] || `#${doc.owner_id}`);
    const categoryLabel = CATEGORY_LABELS[doc.category] || 'Document';
    return {
      shop_id: doc.shop_id,
      type: 'document_expiry',
      source_table: 'documents',
      source_id: doc.id,
      module_label: meta.moduleLabel || doc.owner_type,
      owner_label: ownerLabel,
      title: `${categoryLabel} expiring — ${ownerLabel}`,
      message: `${categoryLabel} for ${ownerLabel} (${meta.moduleLabel || doc.owner_type}) expires on ${doc.expiry_date}.`,
      due_date: doc.expiry_date,
    };
  });
}

async function collectEmployeeDocumentExpiries() {
  const docs = await db.EmployeeDocument.findAll({
    where: { expiry_date: { [db.Sequelize.Op.ne]: null, [db.Sequelize.Op.lte]: windowEndDate() } },
    include: [{ model: db.Employee, attributes: ['id', 'name'] }],
  });
  return docs.map((doc) => {
    const employeeName = doc.Employee?.name || `#${doc.employee_id}`;
    const categoryLabel = CATEGORY_LABELS[doc.category] || 'Document';
    return {
      shop_id: doc.shop_id,
      type: 'employee_document_expiry',
      source_table: 'employee_documents',
      source_id: doc.id,
      module_label: 'Employees',
      owner_label: employeeName,
      title: `${categoryLabel} expiring — ${employeeName}`,
      message: `${categoryLabel} for employee ${employeeName} expires on ${doc.expiry_date}.`,
      due_date: doc.expiry_date,
    };
  });
}

async function collectCnicExpiries() {
  const employees = await db.Employee.findAll({
    where: { cnic_expiry: { [db.Sequelize.Op.ne]: null, [db.Sequelize.Op.lte]: windowEndDate() } },
    attributes: ['id', 'shop_id', 'name', 'cnic_expiry'],
  });
  return employees.map((emp) => ({
    shop_id: emp.shop_id,
    type: 'cnic_expiry',
    source_table: 'employees',
    source_id: emp.id,
    module_label: 'Employees',
    owner_label: emp.name,
    title: `CNIC expiring — ${emp.name}`,
    message: `${emp.name}'s CNIC expires on ${emp.cnic_expiry}.`,
    due_date: emp.cnic_expiry,
  }));
}

async function collectLeaseExpiries() {
  const branches = await db.Branch.findAll({
    where: { lease_expiry_date: { [db.Sequelize.Op.ne]: null, [db.Sequelize.Op.lte]: windowEndDate() } },
    attributes: ['id', 'shop_id', 'name', 'lease_expiry_date'],
  });
  return branches.map((branch) => ({
    shop_id: branch.shop_id,
    type: 'lease_expiry',
    source_table: 'branches',
    source_id: branch.id,
    module_label: 'Mines',
    owner_label: branch.name,
    title: `Lease expiring — ${branch.name}`,
    message: `${branch.name}'s mining lease expires on ${branch.lease_expiry_date}.`,
    due_date: branch.lease_expiry_date,
  }));
}

async function collectVehicleExpiries() {
  const vehicles = await db.Vehicle.findAll({
    where: {
      [db.Sequelize.Op.or]: [
        { registration_expiry: { [db.Sequelize.Op.ne]: null, [db.Sequelize.Op.lte]: windowEndDate() } },
        { insurance_expiry: { [db.Sequelize.Op.ne]: null, [db.Sequelize.Op.lte]: windowEndDate() } },
      ],
    },
    attributes: ['id', 'shop_id', 'vehicle_number', 'registration_expiry', 'insurance_expiry'],
  });

  const items = [];
  vehicles.forEach((v) => {
    if (v.registration_expiry && v.registration_expiry <= windowEndDate()) {
      items.push({
        shop_id: v.shop_id,
        type: 'vehicle_registration_expiry',
        source_table: 'vehicles',
        source_id: v.id,
        module_label: 'Vehicles',
        owner_label: v.vehicle_number,
        title: `Registration expiring — ${v.vehicle_number}`,
        message: `Vehicle ${v.vehicle_number}'s registration expires on ${v.registration_expiry}.`,
        due_date: v.registration_expiry,
      });
    }
    if (v.insurance_expiry && v.insurance_expiry <= windowEndDate()) {
      items.push({
        shop_id: v.shop_id,
        type: 'vehicle_insurance_expiry',
        source_table: 'vehicles',
        source_id: v.id,
        module_label: 'Vehicles',
        owner_label: v.vehicle_number,
        title: `Insurance expiring — ${v.vehicle_number}`,
        message: `Vehicle ${v.vehicle_number}'s insurance expires on ${v.insurance_expiry}.`,
        due_date: v.insurance_expiry,
      });
    }
  });
  return items;
}

const NOTIFICATION_TYPES = [
  'document_expiry', 'employee_document_expiry', 'cnic_expiry', 'lease_expiry',
  'vehicle_registration_expiry', 'vehicle_insurance_expiry',
];

// Refreshes the `notifications` table for one shop from live expiry data.
// Upserts by (shop_id, type, source_table, source_id) WITHOUT touching
// is_read on an existing row — a notification the user already read for a
// still-expiring item must stay read, otherwise the bell's unread count
// would flicker back up on every poll. Rows whose source no longer qualifies
// (renewed past the window, or the source row/document was deleted) are
// removed so the list doesn't accumulate stale entries.
async function syncExpiryNotifications(shopId) {
  const collectors = [
    collectDocumentExpiries, collectEmployeeDocumentExpiries, collectCnicExpiries,
    collectLeaseExpiries, collectVehicleExpiries,
  ];
  const allItems = (await Promise.all(collectors.map((fn) => fn()))).flat().filter((item) => item.shop_id === shopId);

  const itemsByType = {};
  NOTIFICATION_TYPES.forEach((type) => { itemsByType[type] = []; });
  allItems.forEach((item) => { itemsByType[item.type].push(item); });

  for (const type of NOTIFICATION_TYPES) {
    const currentItems = itemsByType[type];
    const currentIds = currentItems.map((i) => i.source_id);

    const existing = await db.Notification.findAll({ where: { shop_id: shopId, type } });
    const existingBySourceId = {};
    existing.forEach((n) => { existingBySourceId[n.source_id] = n; });

    const staleIds = existing.filter((n) => !currentIds.includes(n.source_id)).map((n) => n.id);
    if (staleIds.length > 0) {
      await db.Notification.destroy({ where: { id: staleIds } });
    }

    for (const item of currentItems) {
      const existingRow = existingBySourceId[item.source_id];
      if (existingRow) {
        await existingRow.update({
          module_label: item.module_label, owner_label: item.owner_label,
          title: item.title, message: item.message, due_date: item.due_date,
        });
      } else {
        await db.Notification.create({ ...item, is_read: false });
      }
    }
  }
}

module.exports = { syncExpiryNotifications, REMINDER_WINDOW_DAYS };
