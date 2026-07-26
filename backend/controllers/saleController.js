const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId, resolveBranchId } = require('../utils/shopScope');
const { postVoucher } = require('../utils/postVoucher');
const { creditBankAccount, creditCashPayment, bankAccountCode, paymentAccountCode } = require('../utils/cashHelpers');

const saleIncludes = [
  { model: db.Customer, attributes: ['id', 'name', 'phone'] },
  { model: db.Branch, attributes: ['id', 'name'] },
  { model: db.User, as: 'Cashier', attributes: ['id', 'name'] },
  { model: db.Employee, attributes: ['id', 'name', 'designation'] },
  { model: db.SaleItem, as: 'SaleItems', include: [{ model: db.Product, attributes: ['id', 'name', 'sku'] }] },
  { model: db.Payment, as: 'Payments' },
];

function mapPaymentMethod(method) {
  const allowed = ['cash', 'card', 'bank', 'mobile_wallet', 'credit'];
  if (allowed.includes(method)) return method;
  return 'cash';
}

async function generateInvoiceNumber(shopId, transaction) {
  const count = await db.Sale.count({ where: { shop_id: shopId }, transaction });
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  // Shop-scoped number so two shops' first daily sale never collide on the
  // (now per-shop) unique index. Sequence is per shop.
  return `INV-${shopId}-${date}-${String(count + 1).padStart(4, '0')}`;
}

function last7DayLabels() {
  const labels = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push({
      date: d.toISOString().slice(0, 10),
      day: d.toLocaleDateString('en-US', { weekday: 'short' }),
    });
  }
  return labels;
}

exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.status && req.query.status !== 'all') where.status = req.query.status;
    if (req.query.customer_id) where.customer_id = req.query.customer_id;
    if (req.query.exclude_type) where.sale_type = { [Op.ne]: req.query.exclude_type };

    const branchId = resolveBranchId(req);
    const role = req.user.Role?.name;
    if (branchId && role !== 'super_admin' && role !== 'admin') {
      where.branch_id = branchId;
    } else if (req.query.branch_id) {
      where.branch_id = req.query.branch_id;
    }

    // Build includes — when searching, filter via Product name (require match)
    const searchTerm = req.query.search ? `%${req.query.search}%` : null;

    // We do a two-pass approach: first find by invoice / customer, then
    // union with sales containing a matching product — then deduplicate.
    let salesByInvoiceOrCustomer = [];
    let salesByProduct = [];

    if (searchTerm) {
      // Match by invoice number or customer name
      salesByInvoiceOrCustomer = await db.Sale.findAll({
        where: {
          ...where,
          [Op.or]: [
            { invoice_number: { [Op.iLike]: searchTerm } },
            { '$Customer.name$': { [Op.iLike]: searchTerm } },
            { '$Customer.phone$': { [Op.iLike]: searchTerm } },
          ],
        },
        include: saleIncludes,
        order: [['sale_date', 'DESC']],
        limit: 100,
        subQuery: false,
      });

      // Match by product name in sale items
      const productMatchSaleIds = await db.SaleItem.findAll({
        attributes: ['sale_id'],
        include: [{
          model: db.Product,
          attributes: [],
          where: { name: { [Op.iLike]: searchTerm } },
          required: true,
        }],
        group: ['sale_id'],
        raw: true,
      });

      if (productMatchSaleIds.length) {
        const ids = productMatchSaleIds.map(r => r.sale_id);
        const alreadyFound = new Set(salesByInvoiceOrCustomer.map(s => s.id));
        const remaining = ids.filter(id => !alreadyFound.has(id));
        if (remaining.length) {
          salesByProduct = await db.Sale.findAll({
            where: { ...where, id: { [Op.in]: remaining } },
            include: saleIncludes,
            order: [['sale_date', 'DESC']],
            limit: 50,
          });
        }
      }
    } else {
      salesByInvoiceOrCustomer = await db.Sale.findAll({
        where,
        include: saleIncludes,
        order: [['sale_date', 'DESC']],
        limit: 100,
      });
    }

    const sales = [...salesByInvoiceOrCustomer, ...salesByProduct];

    return res.json({ sales });
  } catch (error) {
    console.error('listSales error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const sale = await db.Sale.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: saleIncludes,
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    return res.json({ sale });
  } catch (error) {
    console.error('getSale error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const {
      customer_id, branch_id, employee_id, sale_type, items, discount, tax, payment_method, payment_amount,
      installment_plan, description, bank_account_id,
    } = req.body;

    // Credit sales require a registered customer
    if (sale_type === 'credit' && !customer_id) {
      await transaction.rollback();
      return res.status(400).json({ message: 'A registered customer is required for credit sales' });
    }

    if (!items || !items.length) {
      await transaction.rollback();
      return res.status(400).json({ message: 'At least one item is required' });
    }

    let targetBranchId = branch_id || resolveBranchId(req);
    if (!targetBranchId) {
      const defaultBranch = await db.Branch.findOne({ where: { shop_id: shopId, is_default: true }, transaction });
      targetBranchId = defaultBranch?.id;
    }
    if (!targetBranchId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'branch_id is required' });
    }

    // ── FK validation: everything must belong to THIS shop ──────────────
    const branch = await db.Branch.findOne({ where: { id: targetBranchId, shop_id: shopId }, transaction });
    if (!branch) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Invalid branch for this shop' });
    }
    // Any advance the customer paid earlier shows up as a negative current_balance
    // (a credit in their favour). Capture it now, before the sale mutates the
    // balance, so an installment sale can draw the advance down against its
    // scheduled principal (a plain credit sale nets it automatically).
    let customerAdvanceAvailable = 0;
    if (customer_id) {
      const cust = await db.Customer.findOne({ where: { id: customer_id, shop_id: shopId }, transaction });
      if (!cust) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Invalid customer for this shop' });
      }
      customerAdvanceAvailable = Math.max(0, -parseFloat(cust.current_balance || 0));
    }
    if (employee_id) {
      const emp = await db.Employee.findOne({ where: { id: parseInt(employee_id, 10), shop_id: shopId }, transaction });
      if (!emp) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Invalid employee for this shop' });
      }
    }

    // Does the caller may override the selling price? (super_admin always may)
    const canOverridePrice = req.user.Role?.name === 'super_admin'
      || (req.user.Role?.Permissions || []).some(p => p.module === 'sales' && p.action === 'override_price');

    // Aggregate duplicate product lines so availability isn't double-counted
    const qtyByProduct = new Map();
    for (const item of items) {
      const pid = item.product_id;
      const q = parseFloat(item.quantity);
      if (!pid || !(q > 0)) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Each item needs a valid product_id and a quantity greater than 0' });
      }
      qtyByProduct.set(pid, (qtyByProduct.get(pid) || 0) + q);
    }

    let subtotal = 0;
    const lineItems = [];

    for (const item of items) {
      const product = await db.Product.findOne({
        where: { id: item.product_id, shop_id: shopId, status: 'active' },
        transaction,
      });
      if (!product) {
        await transaction.rollback();
        return res.status(400).json({ message: `Product ${item.product_id} not found` });
      }

      const qty = parseFloat(item.quantity);

      // Lock the stock row and check availability against the TOTAL requested
      // for this product (covers duplicate line items).
      const stock = await db.Stock.findOne({
        where: { product_id: product.id, branch_id: targetBranchId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const available = parseFloat(stock?.quantity_on_hand || 0);
      if (available < (qtyByProduct.get(product.id) || qty)) {
        await transaction.rollback();
        return res.status(400).json({ message: `Insufficient stock for ${product.name}. Available: ${available}` });
      }

      // Price is server-owned. Client override only with sales:override_price.
      let unitPrice = parseFloat(product.sale_price);
      if (canOverridePrice && item.unit_price !== undefined && item.unit_price !== null && item.unit_price !== '') {
        unitPrice = parseFloat(item.unit_price);
      }
      if (!(unitPrice >= 0)) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Unit price must be a non-negative number' });
      }

      let lineDiscount = parseFloat(item.discount) || 0;
      if (lineDiscount < 0) lineDiscount = 0;
      if (lineDiscount > unitPrice * qty) lineDiscount = unitPrice * qty; // never below zero line
      const lineTotal = (unitPrice * qty) - lineDiscount;
      subtotal += lineTotal;

      lineItems.push({ product, qty, unitPrice, lineDiscount, lineTotal });
    }

    let saleDiscount = parseFloat(discount) || 0;
    let saleTax = parseFloat(tax) || 0;
    if (saleDiscount < 0) saleDiscount = 0;
    if (saleTax < 0) saleTax = 0;
    if (saleDiscount > subtotal) saleDiscount = subtotal; // total never goes negative
    const total = subtotal - saleDiscount + saleTax;

    const invoice_number = await generateInvoiceNumber(shopId, transaction);

    const sale = await db.Sale.create({
      shop_id: shopId,
      invoice_number,
      customer_id: customer_id || null,
      employee_id: employee_id ? parseInt(employee_id, 10) : null,
      branch_id: targetBranchId,
      cashier_id: req.user.id,
      sale_date: new Date(),
      sale_type: sale_type || 'cash',
      subtotal,
      discount: saleDiscount,
      tax: saleTax,
      total,
      description: (typeof description === 'string' && description.trim()) ? description.trim() : null,
      status: 'completed',
    }, { transaction });

    let cogsTotal = 0;
    for (const line of lineItems) {
      await db.SaleItem.create({
        sale_id: sale.id,
        product_id: line.product.id,
        product_name: line.product.name,
        quantity: line.qty,
        unit_price: line.unitPrice,
        discount: line.lineDiscount,
        line_total: line.lineTotal,
      }, { transaction });

      const [stock] = await db.Stock.findOrCreate({
        where: { product_id: line.product.id, branch_id: targetBranchId },
        defaults: { quantity_on_hand: 0, quantity_reserved: 0 },
        transaction,
      });
      const newQty = Math.round((parseFloat(stock.quantity_on_hand || 0) - line.qty) * 1000) / 1000;
      await stock.update({ quantity_on_hand: newQty }, { transaction });

      await db.StockMovement.create({
        product_id: line.product.id,
        branch_id: targetBranchId,
        ref_type: 'sale',
        ref_id: sale.id,
        quantity: -line.qty,
        balance_after: newQty,
      }, { transaction });

      cogsTotal += line.qty * parseFloat(line.product.cost_price || 0);
    }
    cogsTotal = Math.round(cogsTotal * 100) / 100;

    // Determine how much was actually paid now.
    // - credit: whatever the customer paid up front (default 0), clamped to [0, total]
    // - cash/card: full total unless an explicit amount is given
    let payAmount;
    if (sale_type === 'credit') {
      payAmount = payment_amount !== undefined && payment_amount !== null ? parseFloat(payment_amount) : 0;
    } else {
      payAmount = payment_amount !== undefined && payment_amount !== null ? parseFloat(payment_amount) : total;
    }
    if (!(payAmount >= 0)) payAmount = 0;
    if (payAmount > total) payAmount = total;

    const finalPaymentMethod = mapPaymentMethod(payment_method || sale_type || 'cash');
    const isBankMethod = ['card', 'bank', 'mobile_wallet'].includes(finalPaymentMethod);

    let bankAcc = null;
    if (payAmount > 0) {
      if (isBankMethod) {
        bankAcc = await creditBankAccount(shopId, payAmount, transaction, bank_account_id);
      } else if (bank_account_id) {
        bankAcc = await creditCashPayment(shopId, payAmount, transaction, bank_account_id);
      }
    }

    await db.Payment.create({
      sale_id: sale.id,
      amount: payAmount,
      payment_method: finalPaymentMethod,
      payment_date: new Date(),
      bank_account_id: bankAcc?.id || null,
    }, { transaction });

    // GL receivable leg: shortfall after cash payment and any customer advance applied.
    let advanceApplied = 0;
    const revenueCreditAmount = total;

    // customerName is resolved inside the customer block below and used in the
    // GL narration outside it — must be declared here to stay in scope.
    let customerName = 'Walk-in Customer';

    // Ledger trail for the customer: EVERY sale tied to a registered customer
    // gets a full-value charge entry plus (if anything was paid now) a payment
    // entry — not just credit/installment sales — so the audit log shows every
    // flow in & out, not only the ones that change the running balance. Net
    // effect on current_balance is (total - payAmount), which for a cash sale
    // paid in full is 0 (charge and payment cancel out) and for credit/
    // installment sales equals exactly what the old sale_type-specific code
    // computed (down_payment IS payAmount for installment sales — see above).
    if (customer_id) {
      const customer = await db.Customer.findOne({ where: { id: customer_id, shop_id: shopId }, transaction, lock: transaction.LOCK.UPDATE });
      if (customer) {
        customerName = customer.name;
        const advanceAvailable = Math.max(0, -parseFloat(customer.current_balance || 0));
        advanceApplied = Math.round(Math.min(advanceAvailable, total) * 100) / 100;
        const itemsSummary = lineItems.map(l => `${l.qty} ${l.product.unit || 'Pcs'} of ${l.product.name}`).join(', ');

        await customer.update({
          current_balance: Math.round((parseFloat(customer.current_balance || 0) + total - advanceApplied - payAmount) * 100) / 100,
        }, { transaction });

        if (total > 0) {
          await db.CustomerTransaction.create({
            shop_id: shopId, customer_id: customer.id, date: sale.sale_date,
            type: 'sale_charge',
            amount: total, method: null,
            related_sale_id: sale.id, notes: `Customer ${customer.name} purchased ${itemsSummary}`, created_by: req.user.id,
          }, { transaction });
        }
        if (advanceApplied > 0) {
          await db.CustomerTransaction.create({
            shop_id: shopId, customer_id: customer.id, date: sale.sale_date,
            type: 'payment_received', amount: advanceApplied, method: 'advance',
            related_sale_id: sale.id, notes: `Advance credit of Rs. ${advanceApplied} applied from ${customer.name}`, created_by: req.user.id,
          }, { transaction });
        }
        if (payAmount > 0) {
          await db.CustomerTransaction.create({
            shop_id: shopId, customer_id: customer.id, date: sale.sale_date,
            type: 'payment_received', amount: payAmount, method: finalPaymentMethod,
            related_sale_id: sale.id, notes: `Payment of Rs. ${payAmount} received from ${customer.name} via ${finalPaymentMethod}`, created_by: req.user.id,
          }, { transaction });
        }
      }
    }

    const arDebitAmount = Math.round((total - payAmount - advanceApplied) * 100) / 100;
    const itemsSummary = lineItems.map(l => `${l.qty} ${l.product.unit || 'Pcs'} of ${l.product.name}`).join(', ');
    const paymentLine = payAmount > 0
      ? { accountCode: isBankMethod ? bankAccountCode(bankAcc) : paymentAccountCode('cash', bankAcc), debit: payAmount }
      : null;

    const advanceLine = advanceApplied > 0 ? { accountCode: '03-CUSTADV', debit: advanceApplied } : null;

    await postVoucher(shopId, {
      type: 'receipt',
      date: sale.sale_date,
      narration: `${customerName} purchased ${itemsSummary}`,
      createdBy: req.user.id,
      branchId: targetBranchId,
      lines: [
        ...(paymentLine ? [paymentLine] : []),
        ...(advanceLine ? [advanceLine] : []),
        ...(arDebitAmount > 0 ? [{ accountCode: '05-AR', debit: arDebitAmount }] : []),
        { accountCode: '06-SALES', credit: revenueCreditAmount },
        ...(cogsTotal > 0 ? [{ accountCode: '07-COGS', debit: cogsTotal }, { accountCode: '05-STOCK', credit: cogsTotal }] : []),
      ],
    }, transaction);


    await transaction.commit();

    const full = await db.Sale.findByPk(sale.id, { include: saleIncludes });
    return res.status(201).json({ sale: full });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('createSale error:', error);
    return res.status(500).json({ message: error.message || 'Internal server error' });
  }
};

exports.stats = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 6);

    const todaySales = await db.Sale.findAll({
      where: {
        shop_id: shopId,
        status: 'completed',
        sale_date: { [Op.gte]: today },
      },
      attributes: ['total'],
    });

    const weekSales = await db.Sale.findAll({
      where: {
        shop_id: shopId,
        status: 'completed',
        sale_date: { [Op.gte]: weekStart },
      },
      attributes: ['total', 'sale_date'],
    });

    const products = await db.Product.findAll({
      where: { shop_id: shopId },
      attributes: ['id', 'cost_price'],
    });
    const productCostMap = {};
    products.forEach(p => { productCostMap[p.id] = parseFloat(p.cost_price) || 0; });

    const weekMovements = await db.StockMovement.findAll({
      where: {
        ref_type: { [Op.in]: ['purchase', 'adjustment'] },
        quantity: { [Op.gt]: 0 },
        created_at: { [Op.gte]: weekStart },
      },
      include: [{
        model: db.Product,
        where: { shop_id: shopId },
        attributes: ['id', 'cost_price'],
      }],
      attributes: ['quantity', 'createdAt', 'product_id'],
    });

    const dayLabels = last7DayLabels();
    const weeklyChart = dayLabels.map(({ date, day }) => {
      const salesTotal = weekSales
        .filter(s => new Date(s.sale_date).toISOString().slice(0, 10) === date)
        .reduce((sum, s) => sum + parseFloat(s.total), 0);

      const purchasesTotal = weekMovements
        .filter(m => new Date(m.createdAt).toISOString().slice(0, 10) === date)
        .reduce((sum, m) => {
          const cost = m.Product?.cost_price ?? productCostMap[m.product_id] ?? 0;
          return sum + (m.quantity * parseFloat(cost));
        }, 0);

      return { day, date, sales: Math.round(salesTotal), purchases: Math.round(purchasesTotal) };
    });

    const recentSales = await db.Sale.findAll({
      where: { shop_id: shopId, status: 'completed' },
      include: [
        { model: db.Customer, attributes: ['name'] },
        { model: db.SaleItem, as: 'SaleItems', include: [{ model: db.Product, attributes: ['name'] }] },
      ],
      order: [['sale_date', 'DESC']],
      limit: 5,
    });

    const lowStock = await db.Stock.findAll({
      include: [{
        model: db.Product,
        where: { shop_id: shopId, status: 'active' },
        attributes: ['name', 'sku', 'reorder_level'],
      }],
    });
    const lowStockItems = lowStock.filter(s => s.quantity_on_hand <= (s.Product?.reorder_level || 5));

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdaySales = await db.Sale.findAll({
      where: {
        shop_id: shopId,
        status: 'completed',
        sale_date: { [Op.gte]: yesterday, [Op.lt]: today },
      },
      attributes: ['total'],
    });
    const yesterdayTotal = yesterdaySales.reduce((s, x) => s + parseFloat(x.total), 0);
    const todayTotal = todaySales.reduce((s, x) => s + parseFloat(x.total), 0);
    const salesChange = yesterdayTotal > 0
      ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 1000) / 10
      : (todayTotal > 0 ? 100 : 0);

    return res.json({
      stats: {
        today_total: todayTotal,
        today_orders: todaySales.length,
        low_stock_count: lowStockItems.length,
        sales_change: salesChange,
        week_sales_total: weekSales.reduce((s, x) => s + parseFloat(x.total), 0),
        week_orders: weekSales.length,
      },
      weekly_chart: weeklyChart,
      recent_sales: recentSales,
      low_stock: lowStockItems.slice(0, 5),
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('salesStats error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
