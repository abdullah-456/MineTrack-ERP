'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { requireShopId } = require('../utils/shopScope');

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

function parseBranchId(query) {
  const raw = query.branch_id;
  if (!raw) return undefined;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) ? id : undefined;
}

function defaultRange(query) {
  const today = new Date().toISOString().slice(0, 10);
  const to = query.to || today;
  const from = query.from || `${to.slice(0, 7)}-01`;
  return { from, to };
}

function dayKey(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d).slice(0, 10);
  return dt.toISOString().slice(0, 10);
}

/**
 * Sales module consolidated report.
 * Money-flow language:
 *  - incomings  = gross sales billed in period
 *  - collected  = cash/bank taken at sale + later customer recoveries
 *  - credit     = portion billed on account (new receivables from sales)
 *  - outgoings  = refunds / returns paid out
 *  - receivables = what customers still owe (snapshot)
 */
exports.salesSummary = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { from, to } = defaultRange(req.query);
    const branchId = parseBranchId(req.query);
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);

    const saleWhere = {
      shop_id: shopId,
      status: 'completed',
      sale_date: { [Op.between]: [fromDate, toDate] },
    };
    if (branchId) saleWhere.branch_id = branchId;

    const sales = await db.Sale.findAll({
      where: saleWhere,
      include: [
        { model: db.Customer, attributes: ['id', 'name', 'phone', 'current_balance'] },
        { model: db.Branch, attributes: ['id', 'name'] },
        { model: db.Payment, as: 'Payments', attributes: ['id', 'amount', 'payment_method', 'payment_date'] },
        {
          model: db.SaleItem,
          as: 'SaleItems',
          attributes: ['product_id', 'quantity', 'unit_price', 'line_total'],
          include: [{ model: db.Product, attributes: ['id', 'name', 'sku'] }],
        },
      ],
      order: [['sale_date', 'DESC'], ['id', 'DESC']],
    });

    const saleIds = sales.map(s => s.id);

    const returnWhere = {
      shop_id: shopId,
      status: 'completed',
      return_date: { [Op.between]: [fromDate, toDate] },
    };
    if (branchId) returnWhere.branch_id = branchId;

    let returns = [];
    try {
      returns = await db.SaleReturn.findAll({
        where: returnWhere,
        attributes: ['id', 'refund_amount', 'refund_method', 'return_date', 'sale_id', 'customer_id'],
        include: [{ model: db.Customer, attributes: ['id', 'name'] }],
      });
    } catch {
      // Older schemas may use created_at only — fall back without branch/date constraints beyond shop
      returns = await db.SaleReturn.findAll({
        where: { shop_id: shopId, status: 'completed' },
        attributes: ['id', 'refund_amount', 'refund_method', 'return_date', 'created_at', 'sale_id', 'customer_id'],
        include: [{ model: db.Customer, attributes: ['id', 'name'] }],
      });
      returns = returns.filter(r => {
        const d = dayKey(r.return_date || r.created_at);
        return d && d >= from && d <= to;
      });
    }

    const recoveryWhere = {
      shop_id: shopId,
      type: 'payment_received',
      date: { [Op.between]: [fromDate, toDate] },
    };
    const recoveries = await db.CustomerTransaction.findAll({
      where: recoveryWhere,
      include: [{ model: db.Customer, attributes: ['id', 'name', 'phone'] }],
      order: [['date', 'DESC']],
    });

    // Snapshot: outstanding receivables / customer advances (shop-wide; not period-bound)
    const customers = await db.Customer.findAll({
      where: { shop_id: shopId, status: 'active' },
      attributes: ['id', 'name', 'phone', 'current_balance', 'credit_limit'],
      order: [['name', 'ASC']],
    });

    let grossSales = 0;
    let collectedAtSale = 0;
    let creditBooked = 0;
    let cashCollected = 0;
    let bankCollected = 0;
    const byDayMap = new Map();
    const byCustomerMap = new Map();
    const byPaymentMap = new Map();
    const byProductMap = new Map();

    const invoiceRows = sales.map(sale => {
      const total = round2(sale.total);
      const paid = round2((sale.Payments || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0));
      const onAccount = round2(Math.max(0, total - paid));
      grossSales += total;
      collectedAtSale += paid;
      creditBooked += onAccount;

      for (const p of sale.Payments || []) {
        const method = p.payment_method || 'cash';
        const amt = round2(p.amount);
        byPaymentMap.set(method, round2((byPaymentMap.get(method) || 0) + amt));
        if (method === 'cash') cashCollected += amt;
        else if (['bank', 'card', 'mobile_wallet'].includes(method)) bankCollected += amt;
      }

      const day = dayKey(sale.sale_date) || from;
      const dayRow = byDayMap.get(day) || { date: day, sales: 0, collected: 0, credit: 0, invoices: 0 };
      dayRow.sales = round2(dayRow.sales + total);
      dayRow.collected = round2(dayRow.collected + paid);
      dayRow.credit = round2(dayRow.credit + onAccount);
      dayRow.invoices += 1;
      byDayMap.set(day, dayRow);

      const custKey = sale.customer_id || 'walkin';
      const custName = sale.Customer?.name || 'Walk-in';
      const custRow = byCustomerMap.get(custKey) || {
        customer_id: sale.customer_id || null,
        customer_name: custName,
        phone: sale.Customer?.phone || null,
        sales: 0,
        collected: 0,
        credit: 0,
        invoices: 0,
        outstanding: sale.Customer ? round2(Math.max(0, parseFloat(sale.Customer.current_balance || 0))) : 0,
      };
      custRow.sales = round2(custRow.sales + total);
      custRow.collected = round2(custRow.collected + paid);
      custRow.credit = round2(custRow.credit + onAccount);
      custRow.invoices += 1;
      byCustomerMap.set(custKey, custRow);

      for (const line of sale.SaleItems || []) {
        const pid = line.product_id;
        const prow = byProductMap.get(pid) || {
          product_id: pid,
          product_name: line.Product?.name || `Product #${pid}`,
          sku: line.Product?.sku || null,
          quantity: 0,
          amount: 0,
        };
        prow.quantity = round2(prow.quantity + parseFloat(line.quantity || 0));
        prow.amount = round2(prow.amount + parseFloat(line.line_total || 0));
        byProductMap.set(pid, prow);
      }

      return {
        id: sale.id,
        invoice_number: sale.invoice_number,
        sale_date: sale.sale_date,
        customer_id: sale.customer_id || null,
        customer_name: custName,
        branch_name: sale.Branch?.name || null,
        sale_type: sale.sale_type,
        total,
        collected: paid,
        on_account: onAccount,
      };
    });

    const returnsOut = round2(returns.reduce((s, r) => s + parseFloat(r.refund_amount || 0), 0));

    // Later recoveries (ledger payments in period). Deduplicate: payments already
    // counted in collectedAtSale are those tied to sales in this period with same day —
    // still useful as "total cash in from customers" including settling old invoices.
    let recoveryTotal = 0;
    let recoveryCash = 0;
    let recoveryBank = 0;
    const recoveryRows = recoveries.map(r => {
      const amt = round2(r.amount);
      recoveryTotal += amt;
      if (r.method === 'cash') recoveryCash += amt;
      else if (['bank', 'card', 'mobile_wallet'].includes(r.method)) recoveryBank += amt;
      return {
        id: r.id,
        date: r.date,
        customer_id: r.customer_id,
        customer_name: r.Customer?.name || '—',
        amount: amt,
        method: r.method,
        related_sale_id: r.related_sale_id,
        notes: r.notes,
      };
    });

    // "New money in" from customers in period ≈ recoveries (includes at-sale payments
    // that create payment_received rows). For walk-in cash sales without customer,
    // add collectedAtSale that has no customer ledger trail.
    const salesWithoutCustomerCollected = round2(
      sales
        .filter(s => !s.customer_id)
        .reduce((sum, s) => sum + (s.Payments || []).reduce((a, p) => a + parseFloat(p.amount || 0), 0), 0),
    );

    const totalIncomingsCash = round2(recoveryTotal + salesWithoutCustomerCollected);
    const netSales = round2(grossSales - returnsOut);

    const debtors = customers
      .filter(c => parseFloat(c.current_balance || 0) > 0.009)
      .map(c => ({
        customer_id: c.id,
        customer_name: c.name,
        phone: c.phone,
        outstanding: round2(c.current_balance),
        credit_limit: round2(c.credit_limit),
      }))
      .sort((a, b) => b.outstanding - a.outstanding);

    const advances = customers
      .filter(c => parseFloat(c.current_balance || 0) < -0.009)
      .map(c => ({
        customer_id: c.id,
        customer_name: c.name,
        phone: c.phone,
        advance: round2(Math.abs(c.current_balance)),
      }))
      .sort((a, b) => b.advance - a.advance);

    const receivablesOutstanding = round2(debtors.reduce((s, d) => s + d.outstanding, 0));
    const customerAdvances = round2(advances.reduce((s, d) => s + d.advance, 0));

    const byDay = [...byDayMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    const byCustomer = [...byCustomerMap.values()].sort((a, b) => b.sales - a.sales);
    const byProduct = [...byProductMap.values()].sort((a, b) => b.amount - a.amount);
    const byPaymentMethod = [...byPaymentMap.entries()].map(([method, amount]) => ({ method, amount: round2(amount) }));

    return res.json({
      module: 'sales',
      from,
      to,
      branch_id: branchId || null,
      flow: {
        // Clear money language for the UI
        incomings: {
          label: 'Gross sales (billed)',
          amount: round2(grossSales),
          hint: 'Total invoice value of completed sales in this period',
        },
        collected_at_sale: {
          label: 'Collected at sale',
          amount: round2(collectedAtSale),
          cash: round2(cashCollected),
          bank: round2(bankCollected),
          hint: 'Cash/bank received when the invoice was created',
        },
        credit_booked: {
          label: 'Sold on credit (new receivables)',
          amount: round2(creditBooked),
          hint: 'Invoice amount not paid at sale — added to customer dues',
        },
        recovery: {
          label: 'Customer recoveries (period)',
          amount: round2(recoveryTotal),
          cash: round2(recoveryCash),
          bank: round2(recoveryBank),
          hint: 'All payments received from customers in this period (incl. settling older invoices)',
        },
        outgoings: {
          label: 'Returns / refunds',
          amount: returnsOut,
          count: returns.length,
          hint: 'Money or credit given back via sales returns',
        },
        net_sales: {
          label: 'Net sales',
          amount: netSales,
          hint: 'Gross sales minus returns',
        },
        cash_in_total: {
          label: 'Total cash/bank in from customers',
          amount: totalIncomingsCash,
          hint: 'Ledger recoveries + walk-in collections without a customer account',
        },
        receivables: {
          label: 'Receivables outstanding',
          amount: receivablesOutstanding,
          customers: debtors.length,
          hint: 'What customers currently owe the shop (all-time snapshot)',
        },
        customer_advances: {
          label: 'Customer advances (prepaid)',
          amount: customerAdvances,
          customers: advances.length,
          hint: 'Prepaid credit sitting with customers (shop owes them supply / future offset)',
        },
      },
      kpis: {
        invoice_count: sales.length,
        gross_sales: round2(grossSales),
        collected_at_sale: round2(collectedAtSale),
        credit_booked: round2(creditBooked),
        recovery: round2(recoveryTotal),
        returns: returnsOut,
        net_sales: netSales,
        receivables_outstanding: receivablesOutstanding,
        customer_advances: customerAdvances,
        cash_in_total: totalIncomingsCash,
      },
      by_day: byDay,
      by_customer: byCustomer,
      by_product: byProduct,
      by_payment_method: byPaymentMethod,
      invoices: invoiceRows,
      recoveries: recoveryRows,
      debtors: debtors.slice(0, 50),
      advances: advances.slice(0, 50),
      returns: returns.map(r => ({
        id: r.id,
        date: r.return_date || r.created_at,
        customer_name: r.Customer?.name || '—',
        refund_amount: round2(r.refund_amount),
        refund_method: r.refund_method,
        sale_id: r.sale_id,
      })),
      meta: {
        sale_ids_count: saleIds.length,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('salesSummary report error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
