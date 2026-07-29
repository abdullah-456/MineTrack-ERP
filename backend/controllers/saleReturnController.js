const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { postVoucher } = require('../utils/postVoucher');
const { debitBankAccount, creditBankAccount, bankAccountCode } = require('../utils/cashHelpers');
const { requestOrAllowDelete } = require('../utils/deletionRequest');
const { computeReturnLineTotal, computeRefundUnitPrice } = require('../utils/saleRefundAmount');

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
  rows.forEach(r => { map[r.sale_item_id] = parseFloat(r.qty) || 0; });
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
      const refundUnitPrice = computeRefundUnitPrice(si, sale);
      return {
        sale_item_id: si.id,
        product_id: si.product_id,
        product_name: si.product_name || si.Product?.name,
        sku: si.Product?.sku,
        unit_price: parseFloat(si.unit_price),
        refund_unit_price: refundUnitPrice,
        line_discount: parseFloat(si.discount || 0),
        sold_qty: parseFloat(si.quantity),
        already_returned: already,
        returnable_qty: Math.max(0, parseFloat(si.quantity) - already),
      };
    });

    return res.json({
      sale: {
        id: sale.id,
        invoice_number: sale.invoice_number,
        sale_date: sale.sale_date,
        sale_type: sale.sale_type,
        subtotal: parseFloat(sale.subtotal || 0),
        discount: parseFloat(sale.discount || 0),
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
    if (req.query.search) where.return_number = { [Op.iLike]: `%${req.query.search}%` };

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
      items, exchange_items, settlement_payment_method, bank_account_id,
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
      const qty = parseFloat(line.quantity);
      if (!(qty > 0)) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Return quantity must be greater than 0' });
      }
      const maxReturnable = parseFloat(si.quantity || 0) - (alreadyReturned[si.id] || 0);
      if (qty > maxReturnable) {
        await transaction.rollback();
        return res.status(400).json({
          message: `Cannot return ${qty} of "${si.product_name}". Returnable: ${maxReturnable}`,
        });
      }

      const lineTotal = computeReturnLineTotal(si, qty, sale);
      returnedValue += lineTotal;

      returnLines.push({
        sale_item_id: si.id,
        product_id: si.product_id,
        quantity: qty,
        unit_price: Math.round((lineTotal / qty) * 100) / 100,
        line_total: lineTotal,
        restock: line.restock !== false, // default true
        condition: line.condition === 'damaged' ? 'damaged' : 'resellable',
      });
    }
    returnedValue = Math.round(returnedValue * 100) / 100;

    // ── Restock resellable returned items (locked) ──────────────────────────
    let restockCogsAmount = 0;
    for (const rl of returnLines) {
      if (!(rl.restock && rl.condition === 'resellable')) continue;
      const [stock] = await db.Stock.findOrCreate({
        where: { product_id: rl.product_id, branch_id: sale.branch_id },
        defaults: { quantity_on_hand: 0, quantity_reserved: 0 },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const newQty = Math.round((parseFloat(stock.quantity_on_hand || 0) + rl.quantity) * 1000) / 1000;
      await stock.update({ quantity_on_hand: newQty }, { transaction });
      await db.StockMovement.create({
        product_id: rl.product_id,
        branch_id: sale.branch_id,
        ref_type: 'sale_return',
        ref_id: sale.id,
        quantity: rl.quantity,
        balance_after: newQty,
      }, { transaction });

      const returnedProduct = await db.Product.findByPk(rl.product_id, { transaction, attributes: ['cost_price'] });
      restockCogsAmount += rl.quantity * parseFloat(returnedProduct?.cost_price || 0);
    }
    restockCogsAmount = Math.round(restockCogsAmount * 100) / 100;

    const returnedItemsSummary = returnLines.map(rl => {
      const si = saleItemById[rl.sale_item_id];
      const pName = si?.product_name || si?.Product?.name || 'Product';
      const pUnit = si?.Product?.unit || 'Pcs';
      return `${rl.quantity} ${pUnit} of ${pName}`;
    }).join(', ');
    let exchangeItemsSummary = '';

    let refundAmount = 0;
    let settlementAmount = 0;
    let exchangeSale = null;
    let effectiveRefundMethod = refund_method || 'cash';
    let creditApplied = 0;
    let exchangeCogsAmount = 0;

    if (return_type === 'refund') {
      refundAmount = returnedValue;

      if (sale.sale_type === 'credit') {
        // The returned value first reduces what the customer still owes.
        // Any EXCESS (e.g. a full return where a payment was already paid
        // in cash) is refunded in cash.
        effectiveRefundMethod = 'store_credit';
        if (sale.customer_id) {
          const customer = await db.Customer.findOne({
            where: { id: sale.customer_id, shop_id: shopId },
            transaction, lock: transaction.LOCK.UPDATE,
          });
          if (customer) {
            const outstanding = parseFloat(customer.current_balance || 0);
            // Floored at 0: `outstanding` is negative when the customer already
            // holds store credit, and an unfloored Math.min then returned a
            // NEGATIVE creditApplied — which wiped out that existing credit and
            // inflated cashExcess above returnedValue, refunding more cash than
            // the goods were worth. Nothing is owed, so nothing is offset here
            // and the full value falls through to the cash refund below.
            creditApplied = Math.max(0, Math.min(returnedValue, outstanding));
            await customer.update({
              current_balance: Math.round((outstanding - creditApplied) * 100) / 100,
            }, { transaction });
            if (creditApplied > 0) {
              await db.CustomerTransaction.create({
                shop_id: shopId, customer_id: customer.id, date: new Date(),
                type: 'return_credit', amount: creditApplied, method: null,
                related_sale_id: sale.id, notes: `Items returned by customer: ${returnedItemsSummary}`,
                created_by: req.user.id,
              }, { transaction });
            }
          }
        }
        const cashExcess = Math.round((returnedValue - creditApplied) * 100) / 100;
        if (cashExcess > 0) {
          refundAmount = cashExcess;
          effectiveRefundMethod = ['card', 'bank', 'mobile_wallet'].includes(refund_method) ? refund_method : 'cash';
        } else {
          refundAmount = 0;
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
        const q = parseFloat(item.quantity);
        if (!item.product_id || !(q > 0)) {
          await transaction.rollback();
          return res.status(400).json({ message: 'Each exchange item needs product_id and a quantity greater than 0' });
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
        const qty = parseFloat(item.quantity);

        const stock = await db.Stock.findOne({
          where: { product_id: product.id, branch_id: sale.branch_id },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        const available = parseFloat(stock?.quantity_on_hand || 0);
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
      exchangeItemsSummary = exLines.map(el => {
        return `${el.qty} ${el.product.unit || 'Pcs'} of ${el.product.name}`;
      }).join(', ');
      exchangeCogsAmount = Math.round(
        exLines.reduce((s, l) => s + l.qty * parseFloat(l.product.cost_price || 0), 0) * 100,
      ) / 100;

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
        const newQty = Math.round((parseFloat(stock.quantity_on_hand || 0) - line.qty) * 1000) / 1000;
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

    // ── Bank balance adjustments ─────────────────────────────────────────────
    // Refund paid out via bank/card → bank balance DECREASES
    let refundBankAcc = null;
    if (return_type === 'refund' && ['card', 'bank', 'mobile_wallet'].includes(effectiveRefundMethod) && refundAmount > 0) {
      refundBankAcc = await debitBankAccount(shopId, refundAmount, transaction, bank_account_id);
    }
    // Exchange settlement received via bank/card → bank balance INCREASES
    let settlementBankAcc = null;
    const settleMethod = ['cash', 'card', 'bank', 'mobile_wallet'].includes(settlement_payment_method)
      ? settlement_payment_method : 'cash';
    if (return_type === 'exchange' && settlementAmount > 0 && ['card', 'bank', 'mobile_wallet'].includes(settleMethod)) {
      settlementBankAcc = await creditBankAccount(shopId, settlementAmount, transaction, bank_account_id);
    }

    // ── GL voucher ────────────────────────────────────────────────────────────
    const glLines = [];
    if (restockCogsAmount > 0) {
      glLines.push({ accountCode: '05-STOCK', debit: restockCogsAmount });
      glLines.push({ accountCode: '07-COGS', credit: restockCogsAmount });
    }
    if (return_type === 'refund' && returnedValue > 0) {
      glLines.push({ accountCode: '06-RETURNS', debit: returnedValue });
      if (creditApplied > 0) glLines.push({ accountCode: '05-AR', credit: creditApplied });
      if (refundAmount > 0) {
        glLines.push({
          accountCode: ['card', 'bank', 'mobile_wallet'].includes(effectiveRefundMethod) ? bankAccountCode(refundBankAcc) : '05-CASH',
          credit: refundAmount,
        });
      }
    }
    if (return_type === 'exchange') {
      const exSubtotalRebuilt = Math.round((returnedValue + settlementAmount) * 100) / 100;
      glLines.push({ accountCode: '06-RETURNS', debit: returnedValue });
      if (settlementAmount > 0) {
        glLines.push({
          accountCode: ['card', 'bank', 'mobile_wallet'].includes(settleMethod) ? bankAccountCode(settlementBankAcc) : '05-CASH',
          debit: settlementAmount,
        });
      }
      glLines.push({ accountCode: '06-SALES', credit: exSubtotalRebuilt });
      if (exchangeCogsAmount > 0) {
        glLines.push({ accountCode: '07-COGS', debit: exchangeCogsAmount });
        glLines.push({ accountCode: '05-STOCK', credit: exchangeCogsAmount });
      }
    }
    if (glLines.length > 0) {
      await postVoucher(shopId, {
        type: return_type === 'exchange' ? 'journal' : 'payment',
        date: ret.return_date,
        narration: return_type === 'exchange'
          ? `Returned: ${returnedItemsSummary} and exchanged for: ${exchangeItemsSummary}`
          : `Returned: ${returnedItemsSummary}`,
        createdBy: req.user.id,
        branchId: ret.branch_id,
        lines: glLines,
      }, transaction);
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

// Performs the actual reversal (stock pulled back out, store-credit
// reinstated, GL reversing voucher, status -> void). Shared by the
// direct-void path below (admin) and deletionRequestController.approve
// (everyone else's void requests, once an admin approves them).
async function performVoidReturn(ret, shopId, req, transaction) {
  // Pull restocked goods back out of stock.
  let voidCogsAmount = 0;
  for (const rl of ret.ReturnItems || []) {
    if (!(rl.restock && rl.condition === 'resellable')) continue;
    const stock = await db.Stock.findOne({
      where: { product_id: rl.product_id, branch_id: ret.branch_id },
      transaction, lock: transaction.LOCK.UPDATE,
    });
    if (stock) {
      const newQty = Math.max(0, parseFloat(stock.quantity_on_hand || 0) - parseFloat(rl.quantity || 0));
      await stock.update({ quantity_on_hand: newQty }, { transaction });
      await db.StockMovement.create({
        product_id: rl.product_id,
        branch_id: ret.branch_id,
        ref_type: 'return_void',
        ref_id: ret.id,
        quantity: -rl.quantity,
        balance_after: newQty,
      }, { transaction });

      const voidedProduct = await db.Product.findByPk(rl.product_id, { transaction, attributes: ['cost_price'] });
      voidCogsAmount += rl.quantity * parseFloat(voidedProduct?.cost_price || 0);
    }
  }
  voidCogsAmount = Math.round(voidCogsAmount * 100) / 100;

  // Reverse a balance credit if the refund was applied to a credit/installment sale.
  let reinstatedCredit = 0;
  if (ret.refund_method === 'store_credit' && ret.customer_id) {
    const customer = await db.Customer.findOne({
      where: { id: ret.customer_id, shop_id: shopId },
      transaction, lock: transaction.LOCK.UPDATE,
    });
    if (customer) {
      await customer.update({
        current_balance: parseFloat(customer.current_balance || 0) + parseFloat(ret.returned_value),
      }, { transaction });
      reinstatedCredit = parseFloat(ret.returned_value);
      await db.CustomerTransaction.create({
        shop_id: shopId, customer_id: customer.id, date: new Date(),
        type: 'adjustment', amount: reinstatedCredit, method: null,
        related_sale_id: ret.sale_id, notes: `Voided return and reinstated credit`,
        created_by: req.user.id,
      }, { transaction });
    }
  }

  // Reverses exactly what createReturn's refund voucher posted for this
  // return — mirrors the two effects void() actually performs above (stock
  // pulled back out; store-credit reinstated), nothing more.
  const voidGlLines = [];
  if (voidCogsAmount > 0) {
    voidGlLines.push({ accountCode: '07-COGS', debit: voidCogsAmount });
    voidGlLines.push({ accountCode: '05-STOCK', credit: voidCogsAmount });
  }
  if (reinstatedCredit > 0) {
    voidGlLines.push({ accountCode: '05-AR', debit: reinstatedCredit });
    voidGlLines.push({ accountCode: '06-RETURNS', credit: reinstatedCredit });
  }
  if (voidGlLines.length > 0) {
    await postVoucher(shopId, {
      type: 'journal',
      date: new Date(),
      narration: `Voided return and reversed entries`,
      createdBy: req.user.id,
      branchId: ret.branch_id,
      lines: voidGlLines,
    }, transaction);
  }

  await ret.update({ status: 'void' }, { transaction });
  return ret;
}

// ── POST /api/returns/:id/void ───────────────────────────────────────────────
// Reverses a completed refund return. Blocked for exchanges (the exchange sale
// is a live invoice with its own payments; voiding it safely needs a full
// counter-transaction — handle those by creating an offsetting return instead).
// Admin/super_admin: voids immediately. Anyone else: submits a pending
// deletion request instead (see utils/deletionRequest.js).
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

    const { pending } = await requestOrAllowDelete({
      req, res, shopId, module: 'returns', entityId: ret.id, entityLabel: ret.return_number, transaction,
    });
    if (pending) { await transaction.commit(); return; }

    await performVoidReturn(ret, shopId, req, transaction);
    await transaction.commit();

    const fresh = await db.SaleReturn.findByPk(ret.id, { include: returnIncludes });
    return res.json({ return: fresh, message: 'Return voided' });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('voidReturn error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.performVoidReturn = performVoidReturn;
