const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');

// ─────────────────────────────────────────────────────────────────────────────
// Sales Returns & Exchange
//
// Two flows, both in a single transaction:
//   refund   → items come back into stock, cash (or a balance credit on
//              credit/installment sales) goes out, a return slip is generated.
//   exchange → items come back into stock AND a new sale is created for the
//              replacement items. The new sale's total must be >= the returned
//              value (never below). Customer pays only the difference
//              (settlement). Both the return slip and the new invoice exist.
// ─────────────────────────────────────────────────────────────────────────────

const returnIncludes = [
  { model: db.Sale, attributes: ['id', 'invoice_number', 'total', 'sale_date', 'sale_type'] },
  { model: db.Sale, as: 'ExchangeSale', attributes: ['id', 'invoice_number', 'total', 'sale_date'] },
  { model: db.Customer, attributes: ['id', 'name', 'phone'] },
  { model: db.Branch, attributes: ['id', 'name'] },
  { model: db.User, as: 'ProcessedBy', attributes: ['id', 'name'] },
  {
    model: db.SaleReturnItem, as: 'ReturnItems',
    include: [{ model: db.Product, attributes: ['id', 'name', 'sku'] }],
  },
];

async function generateReturnNumber(shopId, transaction) {
  const count = await db.SaleReturn.count({ where: { shop_id: shopId }, transaction });
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `RET-${shopId}-${date}-${String(count + 1).padStart(4, '0')}`;
}

async function generateInvoiceNumber(shopId, transaction) {
  const count = await db.Sale.count({ where: { shop_id: shopId }, transaction });
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `INV-${shopId}-${date}-${String(count + 1).padStart(4, '0')}`;
}

// How many units of each sale item have already been returned (non-void).
async function priorReturnedBySaleItem(saleId, transaction) {
  const rows = await db.SaleReturnItem.findAll({
    attributes: ['sale_item_id', [db.sequelize.fn('SUM', db.sequelize.col('SaleReturnItem.quantity')), 'qty']],
    include: [{
      model: db.SaleReturn,
      attributes: [],
      where: { sale_id: saleId, status: 'completed' },
    }],
    group: ['sale_item_id'],
    raw: true,
    transaction,
  });
  const map = {};
  rows.forEach(r => { map[r.sale_item_id] = parseInt(r.qty, 10) || 0; });
  return map;
}

// ── GET /api/sales/:id/returnable ────────────────────────────────────────────
// The original sale with per-line returnable quantity, for the return UI.
exports.returnable = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const sale = await db.Sale.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: [
        { model: db.Customer, attributes: ['id', 'name', 'phone'] },
        { model: db.Branch, attributes: ['id', 'name'] },
        { model: db.SaleItem, as: 'SaleItems', include: [{ model: db.Product, attributes: ['id', 'name', 'sku', 'sale_price'] }] },
      ],
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    if (sale.status !== 'completed') {
      return res.status(400).json({ message: 'Only completed sales can be returned' });
    }

    const returned = await priorReturnedBySaleItem(sale.id, null);
    const items = (sale.SaleItems || []).map(si => {
      const already = returned[si.id] || 0;
      return {
        sale_item_id: si.id,
        product_id: si.product_id,
        product_name: si.product_name || si.Product?.name,
        sku: si.Product?.sku,
        unit_price: parseFloat(si.unit_price),
        sold_qty: si.quantity,
        already_returned: already,
        returnable_qty: Math.max(0, si.quantity - already),
      };
    });

    return res.json({
      sale: {
        id: sale.id,
        invoice_number: sale.invoice_number,
        sale_date: sale.sale_date,
        sale_type: sale.sale_type,
        total: parseFloat(sale.total),
        customer: sale.Customer || null,
        branch: sale.Branch || null,
      },
      items,
    });
  } catch (error) {
    console.error('returnable error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/returns ─────────────────────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.return_type && req.query.return_type !== 'all') where.return_type = req.query.return_type;
    if (req.query.status && req.query.status !== 'all') where.status = req.query.status;
    if (req.query.search) where.return_number = { [Op.like]: `%${req.query.search}%` };

    const returns = await db.SaleReturn.findAll({
      where,
      include: returnIncludes,
      order: [['return_date', 'DESC']],
      limit: 100,
    });

    return res.json({ returns });
  } catch (error) {
    console.error('listReturns error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/returns/:id ─────────────────────────────────────────────────────
exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const ret = await db.SaleReturn.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: [
        ...returnIncludes,
        { model: db.Shop, attributes: ['id', 'name', 'owner_name', 'email', 'phone', 'address', 'logo_url'] },
      ],
    });
    if (!ret) return res.status(404).json({ message: 'Return not found' });
    return res.json({ return: ret });
  } catch (error) {
    console.error('getReturn error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/returns ────────────────────────────────────────────────────────
// Body: {
//   sale_id, return_type: 'refund'|'exchange', reason?, notes?, refund_method?,
//   items: [{ sale_item_id, quantity, restock?, condition? }],
//   exchange_items: [{ product_id, quantity, unit_price? }],   // exchange only
//   settlement_payment_method?                                  // exchange only
// }
exports.create = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const {
      sale_id, return_type, reason, notes, refund_method,
      items, exchange_items, settlement_payment_method,
    } = req.body;

    if (!sale_id || !['refund', 'exchange'].includes(return_type)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'sale_id and return_type (refund|exchange) are required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'At least one return item is required' });
    }

    // Original sale must belong to this shop and be completed.
    const sale = await db.Sale.findOne({
      where: { id: sale_id, shop_id: shopId },
      include: [{ model: db.SaleItem, as: 'SaleItems' }],
      transaction,
    });
    if (!sale) { await transaction.rollback(); return res.status(404).json({ message: 'Sale not found' }); }
    if (sale.status !== 'completed') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Only completed sales can be returned' });
    }

    const saleItemById = {};
    (sale.SaleItems || []).forEach(si => { saleItemById[si.id] = si; });
    const alreadyReturned = await priorReturnedBySaleItem(sale.id, transaction);

    // ── Validate return lines & compute returned value ──────────────────────
    let returnedValue = 0;
    const returnLines = [];
    for (const line of items) {
      const si = saleItemById[line.sale_item_id];
      if (!si) {
        await transaction.rollback();
        return res.status(400).json({ message: `Sale item ${line.sale_item_id} does not belong to this sale` });
      }
      const qty = parseInt(line.quantity, 10);
      if (!Number.isInteger(qty) || qty < 1) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Return quantity must be an integer >= 1' });
      }
      const maxReturnable = si.quantity - (alreadyReturned[si.id] || 0);
      if (qty > maxReturnable) {
        await transaction.rollback();
        return res.status(400).json({
          message: `Cannot return ${qty} of "${si.product_name}". Returnable: ${maxReturnable}`,
        });
      }

      const unitPrice = parseFloat(si.unit_price);
      const lineTotal = Math.round(unitPrice * qty * 100) / 100;
      returnedValue += lineTotal;

      returnLines.push({
        sale_item_id: si.id,
        product_id: si.product_id,
        quantity: qty,
        unit_price: unitPrice,
        line_total: lineTotal,
        restock: line.restock !== false, // default true
        condition: line.condition === 'damaged' ? 'damaged' : 'resellable',
      });
    }
    returnedValue = Math.round(returnedValue * 100) / 100;

    // ── Restock resellable returned items (locked) ──────────────────────────
    for (const rl of returnLines) {
      if (!(rl.restock && rl.condition === 'resellable')) continue;
      const [stock] = await db.Stock.findOrCreate({
        where: { product_id: rl.product_id, branch_id: sale.branch_id },
        defaults: { quantity_on_hand: 0, quantity_reserved: 0 },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const newQty = stock.quantity_on_hand + rl.quantity;
      await stock.update({ quantity_on_hand: newQty }, { transaction });
      await db.StockMovement.create({
        product_id: rl.product_id,
        branch_id: sale.branch_id,
        ref_type: 'sale_return',
        ref_id: sale.id,
        quantity: rl.quantity,
        balance_after: newQty,
      }, { transaction });
    }

    let refundAmount = 0;
    let settlementAmount = 0;
    let exchangeSale = null;
    let effectiveRefundMethod = refund_method || 'cash';

    if (return_type === 'refund') {
      refundAmount = returnedValue;

      if (sale.sale_type === 'credit' || sale.sale_type === 'installment') {
        // The returned value first reduces what the customer still owes.
        // Any EXCESS (e.g. a full return where a down payment was already paid
        // in cash) is refunded in cash. The financing markup is treated as a
        // non-refundable fee.
        effectiveRefundMethod = 'store_credit';
        let creditApplied = 0;
        if (sale.customer_id) {
          const customer = await db.Customer.findOne({
            where: { id: sale.customer_id, shop_id: shopId },
            transaction, lock: transaction.LOCK.UPDATE,
          });
          if (customer) {
            const outstanding = parseFloat(customer.current_balance || 0);
            creditApplied = Math.min(returnedValue, outstanding);
            await customer.update({
              current_balance: Math.round((outstanding - creditApplied) * 100) / 100,
            }, { transaction });
          }
        }
        const cashExcess = Math.round((returnedValue - creditApplied) * 100) / 100;
        if (cashExcess > 0) {
          refundAmount = cashExcess;
          effectiveRefundMethod = ['card', 'bank', 'mobile_wallet'].includes(refund_method) ? refund_method : 'cash';
        } else {
          refundAmount = 0;
        }

        // Reduce outstanding installment schedule from the LAST unpaid slot backwards.
        if (sale.sale_type === 'installment') {
          const plan = await db.InstallmentPlan.findOne({ where: { sale_id: sale.id }, transaction });
          if (plan) {
            let remaining = returnedValue;
            const slots = await db.InstallmentSchedule.findAll({
              where: { plan_id: plan.id, status: { [Op.ne]: 'paid' } },
              order: [['installment_no', 'DESC']],
              transaction,
              lock: transaction.LOCK.UPDATE,
            });
            for (const slot of slots) {
              if (remaining <= 0) break;
              const due = parseFloat(slot.due_amount);
              if (remaining >= due) {
                remaining -= due;
                await slot.update({ due_amount: 0, status: 'paid' }, { transaction });
              } else {
                await slot.update({ due_amount: Math.round((due - remaining) * 100) / 100 }, { transaction });
                remaining = 0;
              }
            }
            const open = await db.InstallmentSchedule.count({
              where: { plan_id: plan.id, status: { [Op.ne]: 'paid' }, due_amount: { [Op.gt]: 0 } },
              transaction,
            });
            if (open === 0) await plan.update({ status: 'closed' }, { transaction });
          }
        }
      } else if (!['cash', 'card', 'bank', 'mobile_wallet', 'store_credit'].includes(effectiveRefundMethod)) {
        effectiveRefundMethod = 'cash';
      }
    }

    if (return_type === 'exchange') {
      if (!Array.isArray(exchange_items) || exchange_items.length === 0) {
        await transaction.rollback();
        return res.status(400).json({ message: 'exchange_items are required for an exchange' });
      }

      // Price override on exchange lines only with the explicit permission.
      const canOverridePrice = req.user.Role?.name === 'super_admin'
        || (req.user.Role?.Permissions || []).some(p => p.module === 'sales' && p.action === 'override_price');

      // Aggregate duplicates for a correct availability check.
      const qtyByProduct = new Map();
      for (const item of exchange_items) {
        const q = parseInt(item.quantity, 10);
        if (!item.product_id || !Number.isInteger(q) || q < 1) {
          await transaction.rollback();
          return res.status(400).json({ message: 'Each exchange item needs product_id and quantity >= 1' });
        }
        qtyByProduct.set(item.product_id, (qtyByProduct.get(item.product_id) || 0) + q);
      }

      let exSubtotal = 0;
      const exLines = [];
      for (const item of exchange_items) {
        const product = await db.Product.findOne({
          where: { id: item.product_id, shop_id: shopId, status: 'active' },
          transaction,
        });
        if (!product) {
          await transaction.rollback();
          return res.status(400).json({ message: `Product ${item.product_id} not found` });
        }
        const qty = parseInt(item.quantity, 10);

        const stock = await db.Stock.findOne({
          where: { product_id: product.id, branch_id: sale.branch_id },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        const available = stock?.quantity_on_hand || 0;
        if (available < (qtyByProduct.get(product.id) || qty)) {
          await transaction.rollback();
          return res.status(400).json({ message: `Insufficient stock for ${product.name}. Available: ${available}` });
        }

        let unitPrice = parseFloat(product.sale_price);
        if (canOverridePrice && item.unit_price !== undefined && item.unit_price !== null && item.unit_price !== '') {
          unitPrice = parseFloat(item.unit_price);
        }
        if (!(unitPrice >= 0)) {
          await transaction.rollback();
          return res.status(400).json({ message: 'Unit price must be a non-negative number' });
        }

        const lineTotal = Math.round(unitPrice * qty * 100) / 100;
        exSubtotal += lineTotal;
        exLines.push({ product, qty, unitPrice, lineTotal });
      }
      exSubtotal = Math.round(exSubtotal * 100) / 100;

      // ── Business rule: exchange must be same value or ABOVE, never below ──
      if (exSubtotal < returnedValue) {
        await transaction.rollback();
        return res.status(400).json({
          message: `Exchange total (${exSubtotal.toFixed(2)}) cannot be less than the returned value (${returnedValue.toFixed(2)}). Add more items or choose a refund.`,
        });
      }

      settlementAmount = Math.round((exSubtotal - returnedValue) * 100) / 100;
      effectiveRefundMethod = 'none';

      // Create the exchange sale (a real invoice).
      const invoice_number = await generateInvoiceNumber(shopId, transaction);
      exchangeSale = await db.Sale.create({
        shop_id: shopId,
        invoice_number,
        customer_id: sale.customer_id || null,
        branch_id: sale.branch_id,
        cashier_id: req.user.id,
        sale_date: new Date(),
        sale_type: 'cash',
        subtotal: exSubtotal,
        discount: 0,
        tax: 0,
        total: exSubtotal,
        status: 'completed',
      }, { transaction });

      for (const line of exLines) {
        await db.SaleItem.create({
          sale_id: exchangeSale.id,
          product_id: line.product.id,
          product_name: line.product.name,
          quantity: line.qty,
          unit_price: line.unitPrice,
          discount: 0,
          line_total: line.lineTotal,
        }, { transaction });

        const [stock] = await db.Stock.findOrCreate({
          where: { product_id: line.product.id, branch_id: sale.branch_id },
          defaults: { quantity_on_hand: 0, quantity_reserved: 0 },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        const newQty = stock.quantity_on_hand - line.qty;
        await stock.update({ quantity_on_hand: newQty }, { transaction });
        await db.StockMovement.create({
          product_id: line.product.id,
          branch_id: sale.branch_id,
          ref_type: 'sale',
          ref_id: exchangeSale.id,
          quantity: -line.qty,
          balance_after: newQty,
        }, { transaction });
      }

      // Payments on the exchange sale:
      //  - returned goods settle `returnedValue` (recorded as store_credit)
      //  - the customer pays only the difference in cash/card/etc.
      if (returnedValue > 0) {
        await db.Payment.create({
          sale_id: exchangeSale.id,
          amount: returnedValue,
          payment_method: 'store_credit',
          payment_date: new Date(),
        }, { transaction });
      }
      if (settlementAmount > 0) {
        const method = ['cash', 'card', 'bank', 'mobile_wallet'].includes(settlement_payment_method)
          ? settlement_payment_method : 'cash';
        await db.Payment.create({
          sale_id: exchangeSale.id,
          amount: settlementAmount,
          payment_method: method,
          payment_date: new Date(),
        }, { transaction });
      }
    }

    // ── Create the return header + lines ─────────────────────────────────────
    const return_number = await generateReturnNumber(shopId, transaction);
    const ret = await db.SaleReturn.create({
      shop_id: shopId,
      sale_id: sale.id,
      customer_id: sale.customer_id || null,
      branch_id: sale.branch_id,
      return_number,
      return_date: new Date(),
      return_type,
      returned_value: returnedValue,
      refund_amount: refundAmount,
      exchange_sale_id: exchangeSale?.id || null,
      settlement_amount: settlementAmount,
      refund_method: effectiveRefundMethod,
      status: 'completed',
      processed_by: req.user.id,
      reason: reason || null,
      notes: notes || null,
    }, { transaction });

    for (const rl of returnLines) {
      await db.SaleReturnItem.create({ ...rl, return_id: ret.id }, { transaction });
    }

    await transaction.commit();

    const full = await db.SaleReturn.findByPk(ret.id, { include: returnIncludes });
    return res.status(201).json({ return: full });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('createReturn error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/returns/:id/void ───────────────────────────────────────────────
// Reverses a completed refund return. Blocked for exchanges (the exchange sale
// is a live invoice with its own payments; voiding it safely needs a full
// counter-transaction — handle those by creating an offsetting return instead).
exports.void = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const ret = await db.SaleReturn.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: [{ model: db.SaleReturnItem, as: 'ReturnItems' }, { model: db.Sale }],
      transaction,
    });
    if (!ret) { await transaction.rollback(); return res.status(404).json({ message: 'Return not found' }); }
    if (ret.status === 'void') { await transaction.rollback(); return res.status(400).json({ message: 'Return is already void' }); }
    if (ret.return_type === 'exchange') {
      await transaction.rollback();
      return res.status(400).json({
        message: 'Exchange returns cannot be voided automatically because a new invoice was issued. Process an offsetting return on the exchange invoice instead.',
      });
    }

    // Pull restocked goods back out of stock.
    for (const rl of ret.ReturnItems || []) {
      if (!(rl.restock && rl.condition === 'resellable')) continue;
      const stock = await db.Stock.findOne({
        where: { product_id: rl.product_id, branch_id: ret.branch_id },
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (stock) {
        const newQty = Math.max(0, stock.quantity_on_hand - rl.quantity);
        await stock.update({ quantity_on_hand: newQty }, { transaction });
        await db.StockMovement.create({
          product_id: rl.product_id,
          branch_id: ret.branch_id,
          ref_type: 'return_void',
          ref_id: ret.id,
          quantity: -rl.quantity,
          balance_after: newQty,
        }, { transaction });
      }
    }

    // Reverse a balance credit if the refund was applied to a credit/installment sale.
    if (ret.refund_method === 'store_credit' && ret.customer_id) {
      const customer = await db.Customer.findOne({
        where: { id: ret.customer_id, shop_id: shopId },
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (customer) {
        await customer.update({
          current_balance: parseFloat(customer.current_balance || 0) + parseFloat(ret.returned_value),
        }, { transaction });
      }
    }

    await ret.update({ status: 'void' }, { transaction });
    await transaction.commit();

    const fresh = await db.SaleReturn.findByPk(ret.id, { include: returnIncludes });
    return res.json({ return: fresh, message: 'Return voided' });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('voidReturn error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
