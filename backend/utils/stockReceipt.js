const db = require('../models');

const roundQty = (n) => Math.round(parseFloat(n) * 1000) / 1000;
const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

// Receive stock for one product line — updates stock, movement, weighted avg cost,
// and product-supplier link. Used by inventory receive and GRN posting.
async function receiveProductStockLine({
  shopId,
  productId,
  branchId,
  quantity,
  unitCost,
  supplierId,
  refType = 'purchase',
  refId,
  transaction,
}) {
  const product = await db.Product.findOne({
    where: { id: productId, shop_id: shopId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!product) {
    const err = new Error(`Product #${productId} not found`);
    err.statusCode = 404;
    throw err;
  }

  const branchOk = await db.Branch.findOne({ where: { id: branchId, shop_id: shopId }, transaction });
  if (!branchOk) {
    const err = new Error('Invalid branch for this shop');
    err.statusCode = 400;
    throw err;
  }

  const qty = roundQty(quantity);
  if (!(qty > 0)) {
    const err = new Error('Quantity must be greater than 0');
    err.statusCode = 400;
    throw err;
  }

  const cost = round2(unitCost ?? product.cost_price ?? 0);

  const [stock] = await db.Stock.findOrCreate({
    where: { product_id: productId, branch_id: branchId },
    defaults: { quantity_on_hand: 0, quantity_reserved: 0 },
    transaction,
  });

  const newQty = roundQty(parseFloat(stock.quantity_on_hand || 0) + qty);
  await stock.update({ quantity_on_hand: newQty }, { transaction });

  await db.StockMovement.create({
    product_id: productId,
    branch_id: branchId,
    ref_type: refType,
    ref_id: refId,
    quantity: qty,
    balance_after: newQty,
  }, { transaction });

  if (cost > 0) {
    const oldQty = newQty - qty;
    const oldCost = parseFloat(product.cost_price || 0);
    const denom = oldQty + qty;
    const avgCost = denom > 0
      ? round2((oldQty * oldCost + qty * cost) / denom)
      : cost;
    await product.update({ cost_price: avgCost }, { transaction });
  }

  if (supplierId) {
    const [link] = await db.ProductSupplier.findOrCreate({
      where: { product_id: productId, supplier_id: supplierId },
      defaults: { purchase_price: cost, status: 'active' },
      transaction,
    });
    await link.update({
      last_purchase_price: cost,
      last_purchase_date: new Date(),
      purchase_price: cost,
    }, { transaction });
  }

  return { product, stock, quantity: qty, unitCost: cost, lineTotal: round2(qty * cost) };
}

function calcLineTotal(qty, unitCost) {
  return round2(parseFloat(qty || 0) * parseFloat(unitCost || 0));
}

function calcOrderTotals(items, discount = 0, tax = 0) {
  const subtotal = round2(items.reduce((s, i) => s + calcLineTotal(i.quantity_ordered ?? i.quantity_received ?? i.quantity, i.unit_cost), 0));
  const disc = round2(discount);
  const taxAmt = round2(tax);
  const total = round2(subtotal - disc + taxAmt);
  return { subtotal, discount: disc, tax: taxAmt, total };
}

// Continuous per-shop sequence — no date segment, never resets. Matching
// against the bare "PREFIX-{shopId}-" also picks up older date-stamped
// numbers (e.g. "PO-1-20260814-0001"), so the count picks up from the last
// number ever issued to this shop rather than restarting.
async function generatePoNumber(shopId, transaction) {
  const prefix = `PO-${shopId}-`;
  const last = await db.PurchaseOrder.findOne({
    where: { shop_id: shopId, po_number: { [db.Sequelize.Op.like]: `${prefix}%` } },
    order: [['id', 'DESC']],
    transaction,
  });
  let seq = 1;
  if (last?.po_number) {
    const parts = last.po_number.split('-');
    const n = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function generatePrNumber(shopId, transaction) {
  const prefix = `PR-${shopId}-`;
  const last = await db.PurchaseRequisition.findOne({
    where: { shop_id: shopId, pr_number: { [db.Sequelize.Op.like]: `${prefix}%` } },
    order: [['id', 'DESC']],
    transaction,
  });
  let seq = 1;
  if (last?.pr_number) {
    const parts = last.pr_number.split('-');
    const n = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function generateDaNumber(shopId, transaction) {
  const prefix = `DA-${shopId}-`;
  const last = await db.DepartmentalApproval.findOne({
    where: { shop_id: shopId, da_number: { [db.Sequelize.Op.like]: `${prefix}%` } },
    order: [['id', 'DESC']],
    transaction,
  });
  let seq = 1;
  if (last?.da_number) {
    const parts = last.da_number.split('-');
    const n = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function generateGrnNumber(shopId, transaction) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `GRN-${shopId}-${dateStr}-`;
  const last = await db.GoodsReceiptNote.findOne({
    where: { shop_id: shopId, grn_number: { [db.Sequelize.Op.like]: `${prefix}%` } },
    order: [['id', 'DESC']],
    transaction,
  });
  let seq = 1;
  if (last?.grn_number) {
    const parts = last.grn_number.split('-');
    const n = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function refreshPurchaseOrderStatus(poId, transaction) {
  const po = await db.PurchaseOrder.findByPk(poId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!po || ['draft', 'cancelled'].includes(po.status)) return po;

  const items = await db.PurchaseOrderItem.findAll({
    where: { purchase_order_id: poId },
    transaction,
  });
  if (!items.length) return po;

  const allReceived = items.every(i => roundQty(i.quantity_received) >= roundQty(i.quantity_ordered));
  const anyReceived = items.some(i => roundQty(i.quantity_received) > 0);

  let status = po.status;
  if (allReceived) status = 'received';
  else if (anyReceived) status = 'partially_received';
  else if (po.status === 'partially_received' || po.status === 'received') status = 'sent';

  if (status !== po.status) {
    await po.update({ status }, { transaction });
  }
  return po;
}

module.exports = {
  receiveProductStockLine,
  calcLineTotal,
  calcOrderTotals,
  generatePoNumber,
  generatePrNumber,
  generateDaNumber,
  generateGrnNumber,
  refreshPurchaseOrderStatus,
  roundQty,
  round2,
};
