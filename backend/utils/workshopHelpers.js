const db = require('../models');

const roundQty = (n) => Math.round(parseFloat(n) * 1000) / 1000;
const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

// Continuous per-shop sequence — no date segment, never resets. Matching
// against the bare "PREFIX-{shopId}-" also picks up any historical numbers
// with extra segments, so the count always continues from the last number
// ever issued to this shop.
async function generateWorkshopItemCode(shopId, transaction) {
  const prefix = `WSI-${shopId}-`;
  const last = await db.WorkshopItem.findOne({
    where: { shop_id: shopId, item_code: { [db.Sequelize.Op.like]: `${prefix}%` } },
    order: [['id', 'DESC']],
    transaction,
  });
  let seq = 1;
  if (last?.item_code) {
    const parts = last.item_code.split('-');
    const n = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function generateWorkshopJobNumber(shopId, transaction) {
  const prefix = `WSJ-${shopId}-`;
  const last = await db.WorkshopJob.findOne({
    where: { shop_id: shopId, job_number: { [db.Sequelize.Op.like]: `${prefix}%` } },
    order: [['id', 'DESC']],
    transaction,
  });
  let seq = 1;
  if (last?.job_number) {
    const parts = last.job_number.split('-');
    const n = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// Manual stock-in — no linkage to purchases/accounts, just an inventory
// record. Computes a weighted-average cost per (item, branch) so repeated
// restocks at different prices settle on an honest running cost.
async function receiveWorkshopStock({ shopId, workshopItemId, branchId, quantity, unitCost, note, userId, transaction }) {
  const item = await db.WorkshopItem.findOne({ where: { id: workshopItemId, shop_id: shopId }, transaction });
  if (!item) {
    const err = new Error('Workshop item not found');
    err.statusCode = 404;
    throw err;
  }

  const branch = await db.Branch.findOne({ where: { id: branchId, shop_id: shopId }, transaction });
  if (!branch) {
    const err = new Error('Invalid mine for this shop');
    err.statusCode = 400;
    throw err;
  }

  const qty = roundQty(quantity);
  if (!(qty > 0)) {
    const err = new Error('Quantity must be greater than 0');
    err.statusCode = 400;
    throw err;
  }

  const cost = round2(unitCost ?? item.unit_price ?? 0);

  const [stock] = await db.WorkshopStock.findOrCreate({
    where: { workshop_item_id: workshopItemId, branch_id: branchId },
    defaults: { quantity_on_hand: 0, avg_cost: 0 },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const oldQty = parseFloat(stock.quantity_on_hand || 0);
  const oldCost = parseFloat(stock.avg_cost || 0);
  const newQty = roundQty(oldQty + qty);
  const denom = oldQty + qty;
  const newAvgCost = denom > 0 ? round2((oldQty * oldCost + qty * cost) / denom) : cost;

  await stock.update({ quantity_on_hand: newQty, avg_cost: newAvgCost }, { transaction });

  const movement = await db.WorkshopStockMovement.create({
    workshop_item_id: workshopItemId,
    branch_id: branchId,
    ref_type: 'stock_in',
    ref_id: null,
    quantity: qty,
    unit_cost: cost,
    balance_after: newQty,
    note: note || null,
    created_by: userId || null,
  }, { transaction });

  return { stock, movement, quantity: qty, unitCost: cost };
}

// Deducts stock for a job — refuses to go negative so the module stays an
// honest record of what's actually on the shelf.
async function consumeWorkshopStock({ workshopItemId, branchId, quantity, refId, userId, transaction }) {
  const stock = await db.WorkshopStock.findOne({
    where: { workshop_item_id: workshopItemId, branch_id: branchId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const qty = roundQty(quantity);
  if (!(qty > 0)) {
    const err = new Error('Quantity must be greater than 0');
    err.statusCode = 400;
    throw err;
  }

  const available = parseFloat(stock?.quantity_on_hand || 0);
  if (available < qty) {
    const err = new Error(`Insufficient stock: only ${available} available`);
    err.statusCode = 400;
    throw err;
  }

  const unitCost = parseFloat(stock.avg_cost || 0);
  const newQty = roundQty(available - qty);
  await stock.update({ quantity_on_hand: newQty }, { transaction });

  const movement = await db.WorkshopStockMovement.create({
    workshop_item_id: workshopItemId,
    branch_id: branchId,
    ref_type: 'job_usage',
    ref_id: refId,
    quantity: -qty,
    unit_cost: unitCost,
    balance_after: newQty,
    created_by: userId || null,
  }, { transaction });

  return { movement, quantity: qty, unitCost, lineTotal: round2(qty * unitCost) };
}

// Reverses a previous consumption (job item removed, or job cancelled) —
// adds the quantity back at the same cost it left at, so the ledger for
// that job nets to zero and stays fully traceable.
async function reverseWorkshopStock({ workshopItemId, branchId, quantity, unitCost, refId, userId, transaction }) {
  const [stock] = await db.WorkshopStock.findOrCreate({
    where: { workshop_item_id: workshopItemId, branch_id: branchId },
    defaults: { quantity_on_hand: 0, avg_cost: 0 },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const qty = roundQty(quantity);
  const newQty = roundQty(parseFloat(stock.quantity_on_hand || 0) + qty);
  await stock.update({ quantity_on_hand: newQty }, { transaction });

  const movement = await db.WorkshopStockMovement.create({
    workshop_item_id: workshopItemId,
    branch_id: branchId,
    ref_type: 'job_usage',
    ref_id: refId,
    quantity: qty,
    unit_cost: round2(unitCost || 0),
    balance_after: newQty,
    created_by: userId || null,
  }, { transaction });

  return { movement };
}

module.exports = {
  generateWorkshopItemCode,
  generateWorkshopJobNumber,
  receiveWorkshopStock,
  consumeWorkshopStock,
  reverseWorkshopStock,
  roundQty,
  round2,
};
