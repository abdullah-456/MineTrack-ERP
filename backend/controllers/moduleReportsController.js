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

// Report responses go out as JSON — a `render` function attached to a column
// definition is silently dropped by JSON.stringify, so it can never reach the
// frontend. Every transaction-row date shown in these reports must already be
// a formatted string by the time the row object is built, not a raw Date/ISO
// value formatted later by a render callback that will never survive the trip.
function formatDateTime(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d).slice(0, 10);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

/** Local calendar-day bounds (avoid UTC midnight cutting off PK morning entries). */
function rangeDates(from, to) {
  return {
    fromDate: new Date(`${from}T00:00:00.000`),
    toDate: new Date(`${to}T23:59:59.999`),
  };
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
    const customerId = req.query.customer_id ? parseInt(req.query.customer_id, 10) : undefined;
    const { fromDate, toDate } = rangeDates(from, to);

    const saleWhere = {
      shop_id: shopId,
      status: 'completed',
      sale_date: { [Op.between]: [fromDate, toDate] },
    };
    if (branchId) saleWhere.branch_id = branchId;
    if (customerId) saleWhere.customer_id = customerId;

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
    if (customerId) returnWhere.customer_id = customerId;

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
        where: { shop_id: shopId, status: 'completed', ...(customerId ? { customer_id: customerId } : {}) },
        attributes: ['id', 'refund_amount', 'refund_method', 'return_date', 'created_at', 'sale_id', 'customer_id'],
        include: [{ model: db.Customer, attributes: ['id', 'name'] }],
      });
      returns = returns.filter(r => {
        const d = dayKey(r.return_date || r.createdAt);
        return d && d >= from && d <= to;
      });
    }

    const recoveryWhere = {
      shop_id: shopId,
      type: 'payment_received',
      date: { [Op.between]: [fromDate, toDate] },
    };
    if (customerId) recoveryWhere.customer_id = customerId;
    const recoveries = await db.CustomerTransaction.findAll({
      where: recoveryWhere,
      include: [{ model: db.Customer, attributes: ['id', 'name', 'phone'] }],
      order: [['date', 'DESC']],
    });

    // Snapshot: outstanding receivables / customer advances (shop-wide; not period-bound).
    // Narrowed to the one customer when filtered, so "Sales Report -> Customer: X" reads
    // as everything about X rather than X's sales plus everyone else's receivables.
    const customerSnapshotWhere = { shop_id: shopId, status: 'active' };
    if (customerId) customerSnapshotWhere.id = customerId;
    const customers = await db.Customer.findAll({
      where: customerSnapshotWhere,
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

    // Only cash/card/bank/mobile_wallet refunds are money actually leaving the
    // till/bank — store_credit (and 'none') just adjusts the customer's ledger
    // balance, no physical cash movement, so it must not reduce cash/bank in.
    let refundCashOut = 0;
    let refundBankOut = 0;
    for (const r of returns) {
      const amt = round2(r.refund_amount);
      if (r.refund_method === 'cash') refundCashOut += amt;
      else if (['bank', 'card', 'mobile_wallet'].includes(r.refund_method)) refundBankOut += amt;
    }
    const refundCashBankOut = round2(refundCashOut + refundBankOut);

    // Every at-sale payment from a registered customer is logged twice by design:
    // once as a Payment row (feeds collectedAtSale above) and once as a
    // CustomerTransaction 'payment_received' row tied via related_sale_id to that
    // same sale (saleController.js). If a ledger payment's related_sale_id is one
    // of THIS period's sales, it's the same money already counted in "Collected at
    // sale" — counting it again under "Customer recoveries" would double it. Only
    // ledger payments settling dues from OUTSIDE this period (an older sale, or no
    // sale at all) are genuine new recoveries.
    const saleIdSet = new Set(saleIds);
    let recoveryTotal = 0;
    let recoveryCash = 0;
    let recoveryBank = 0;
    const recoveryRows = recoveries.map(r => {
      const amt = round2(r.amount);
      const alreadyInCollectedAtSale = !!(r.related_sale_id && saleIdSet.has(r.related_sale_id));
      if (!alreadyInCollectedAtSale) {
        recoveryTotal += amt;
        if (r.method === 'cash') recoveryCash += amt;
        else if (['bank', 'card', 'mobile_wallet'].includes(r.method)) recoveryBank += amt;
      }
      return {
        id: r.id,
        date: formatDateTime(r.date),
        customer_id: r.customer_id,
        customer_name: r.Customer?.name || '—',
        amount: amt,
        method: r.method,
        related_sale_id: r.related_sale_id,
        already_in_collected_at_sale: alreadyInCollectedAtSale,
        notes: r.notes,
      };
    });
    recoveryTotal = round2(recoveryTotal);
    recoveryCash = round2(recoveryCash);
    recoveryBank = round2(recoveryBank);

    // Every rupee received from a customer this period — registered or walk-in,
    // at the counter or settling an old debt — lands in exactly one of these two
    // buckets with no overlap: paid at the moment of billing (collectedAtSale,
    // already includes walk-ins), or paid later against a pre-existing balance
    // (recoveryTotal, deduplicated above).
    const totalIncomingsCash = round2(collectedAtSale + recoveryTotal);
    const netCashBankIn = round2(totalIncomingsCash - refundCashBankOut);
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
      customer_id: customerId || null,
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
          label: 'Later recoveries (old dues settled)',
          amount: round2(recoveryTotal),
          cash: round2(recoveryCash),
          bank: round2(recoveryBank),
          hint: 'Payments collecting a balance from before this period — excludes at-sale payments already counted in "Collected at sale" above',
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
          label: 'Total cash/bank in from customers (gross)',
          amount: totalIncomingsCash,
          collected_at_sale: round2(collectedAtSale),
          recovery: round2(recoveryTotal),
          hint: 'Collected at sale + later recoveries of old dues (registered & walk-in combined) — before refunds paid out',
        },
        refunds_cash_bank: {
          label: 'Cash/bank refunds paid out',
          amount: refundCashBankOut,
          cash: round2(refundCashOut),
          bank: round2(refundBankOut),
          hint: 'Returns refunded via cash/bank/card/mobile wallet — actual money that left the shop (store-credit refunds excluded, since no cash moves)',
        },
        net_cash_bank_in: {
          label: 'Net cash/bank in',
          amount: netCashBankIn,
          hint: 'Total cash/bank in (gross) minus cash/bank refunds paid out',
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
        refunds_cash_bank: refundCashBankOut,
        net_cash_bank_in: netCashBankIn,
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
        date: formatDateTime(r.return_date || r.createdAt),
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

function moneyStr(n) {
  return `Rs. ${round2(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function openLink(type, id) {
  const n = parseInt(id, 10);
  return Number.isFinite(n) && n > 0 ? { type, id: n } : null;
}

function pdfTable(heading, columns, rows, totals) {
  return {
    heading,
    columns,
    rows: rows.slice(0, 100),
    ...(totals != null ? { totals } : {}),
  };
}

function supplierName(s) {
  return s?.company_name || s?.name || '—';
}

exports.purchasesSummary = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { from, to } = defaultRange(req.query);
    const branchId = parseBranchId(req.query);
    const supplierId = req.query.supplier_id ? parseInt(req.query.supplier_id, 10) : undefined;
    const { fromDate, toDate } = rangeDates(from, to);

    const grnWhere = {
      shop_id: shopId,
      status: 'posted',
      receipt_date: { [Op.between]: [fromDate, toDate] },
    };
    if (branchId) grnWhere.branch_id = branchId;
    if (supplierId) grnWhere.supplier_id = supplierId;

    const receipts = await db.GoodsReceiptNote.findAll({
      where: grnWhere,
      include: [
        { model: db.Supplier, attributes: ['id', 'company_name', 'name'] },
        { model: db.Branch, attributes: ['id', 'name'] },
        { model: db.PurchaseInvoice, attributes: ['id', 'invoice_number'] },
      ],
      order: [['receipt_date', 'DESC']],
    });

    const txnWhere = {
      shop_id: shopId,
      date: { [Op.between]: [fromDate, toDate] },
    };
    if (supplierId) txnWhere.supplier_id = supplierId;
    const transactions = await db.SupplierTransaction.findAll({
      where: txnWhere,
      include: [{ model: db.Supplier, attributes: ['id', 'company_name', 'name'] }],
      order: [['date', 'DESC']],
    });

    // Shop-wide payables/advances snapshot, narrowed to the one supplier when
    // filtered — see the matching comment in salesSummary's customer snapshot.
    const supplierSnapshotWhere = { shop_id: shopId, status: 'active' };
    if (supplierId) supplierSnapshotWhere.id = supplierId;
    const suppliers = await db.Supplier.findAll({
      where: supplierSnapshotWhere,
      attributes: ['id', 'company_name', 'name', 'phone', 'current_payable', 'credit_balance'],
      order: [['company_name', 'ASC']],
    });

    let stockReceived = 0;
    const byDayMap = new Map();
    const receiptRows = receipts.map(r => {
      const amt = round2(r.total);
      stockReceived += amt;
      const day = dayKey(r.receipt_date) || from;
      const row = byDayMap.get(day) || { date: day, stock_in: 0, payments: 0, credit: 0 };
      row.stock_in = round2(row.stock_in + amt);
      byDayMap.set(day, row);
      const out = {
        id: r.id,
        grn_number: r.grn_number,
        receipt_date: formatDateTime(r.receipt_date),
        supplier_id: r.supplier_id,
        supplier_name: supplierName(r.Supplier),
        branch_name: r.Branch?.name || null,
        total: amt,
        open: r.PurchaseInvoice?.id
          ? openLink('purchase_invoice', r.PurchaseInvoice.id)
          : (r.purchase_order_id
            ? openLink('purchase_order', r.purchase_order_id)
            : openLink('supplier', r.supplier_id)),
      };
      if (r.purchase_order_id) {
        out.purchase_order_id = r.purchase_order_id;
        out.purchase_order_open = openLink('purchase_order', r.purchase_order_id);
      }
      if (r.PurchaseInvoice?.id) {
        out.purchase_invoice_id = r.PurchaseInvoice.id;
      }
      return out;
    });

    let paymentsOut = 0;
    let paymentCash = 0;
    let paymentBank = 0;
    let paymentsForThisStock = 0;
    let paymentsForOlderBalance = 0;
    let creditPurchases = 0;
    const paymentRows = [];
    const creditRows = [];
    for (const t of transactions) {
      if (t.type === 'payment_made') {
        const amt = round2(t.total_amount);
        paymentsOut += amt;
        paymentsForOlderBalance = round2(paymentsForOlderBalance + amt);
        if (t.method === 'cash') paymentCash += amt;
        else if (t.method === 'bank') paymentBank += amt;
        const day = dayKey(t.date) || from;
        const row = byDayMap.get(day) || { date: day, stock_in: 0, payments: 0, credit: 0 };
        row.payments = round2(row.payments + amt);
        byDayMap.set(day, row);
        paymentRows.push({
          id: t.id,
          date: formatDateTime(t.date),
          supplier_id: t.supplier_id,
          supplier_name: supplierName(t.Supplier),
          amount: amt,
          method: t.method,
          notes: t.notes,
          open: openLink('supplier', t.supplier_id),
        });
      } else if (t.type === 'stock_received') {
        // Paid in full/partially at the moment stock came in (paymentStatus:
        // 'paid'/'partial' on the receive form) never creates a separate
        // 'payment_made' row — that type is only used for a LATER standalone
        // payment against an existing payable. Without this, cash/bank paid
        // at receipt silently vanished from "Payments out" even though it's
        // real money that left the shop the same moment stock arrived.
        const paidAtReceipt = round2(Math.min(parseFloat(t.paid_amount || 0), parseFloat(t.total_amount || 0)));
        if (paidAtReceipt > 0 && t.method !== 'supplier_credit') {
          paymentsOut = round2(paymentsOut + paidAtReceipt);
          paymentsForThisStock = round2(paymentsForThisStock + paidAtReceipt);
          if (t.method === 'cash') paymentCash = round2(paymentCash + paidAtReceipt);
          else if (t.method === 'bank') paymentBank = round2(paymentBank + paidAtReceipt);
          const payDay = dayKey(t.date) || from;
          const payRow = byDayMap.get(payDay) || { date: payDay, stock_in: 0, payments: 0, credit: 0 };
          payRow.payments = round2(payRow.payments + paidAtReceipt);
          byDayMap.set(payDay, payRow);
          paymentRows.push({
            id: t.id,
            date: formatDateTime(t.date),
            supplier_id: t.supplier_id,
            supplier_name: supplierName(t.Supplier),
            amount: paidAtReceipt,
            method: t.method,
            notes: 'Paid at time of stock receipt',
            open: openLink('supplier', t.supplier_id),
          });
        }

        const credit = round2(
          t.method === 'supplier_credit'
            ? parseFloat(t.total_amount || 0)
            : Math.max(0, parseFloat(t.total_amount || 0) - parseFloat(t.paid_amount || 0)),
        );
        if (credit > 0) {
          creditPurchases += credit;
          const day = dayKey(t.date) || from;
          const row = byDayMap.get(day) || { date: day, stock_in: 0, payments: 0, credit: 0 };
          row.credit = round2(row.credit + credit);
          byDayMap.set(day, row);
          creditRows.push({
            id: t.id,
            date: formatDateTime(t.date),
            supplier_id: t.supplier_id,
            supplier_name: supplierName(t.Supplier),
            method: t.method,
            credit_amount: credit,
            open: openLink('supplier', t.supplier_id),
          });
        }
      }
    }

    const payablesList = suppliers
      .filter(s => parseFloat(s.current_payable || 0) > 0.009)
      .map(s => ({
        supplier_id: s.id,
        supplier_name: supplierName(s),
        phone: s.phone,
        payable: round2(s.current_payable),
        open: openLink('supplier', s.id),
      }))
      .sort((a, b) => b.payable - a.payable);

    const advancesList = suppliers
      .filter(s => parseFloat(s.credit_balance || 0) > 0.009)
      .map(s => ({
        supplier_id: s.id,
        supplier_name: supplierName(s),
        advance: round2(s.credit_balance),
        open: openLink('supplier', s.id),
      }))
      .sort((a, b) => b.advance - a.advance);

    const payablesTotal = round2(payablesList.reduce((s, p) => s + p.payable, 0));
    const advancesTotal = round2(advancesList.reduce((s, p) => s + p.advance, 0));
    const byDay = [...byDayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    // Fallback: if no posted GRNs, show supplier ledger stock_received lines so data isn't blank
    const stockLedgerRows = transactions
      .filter(t => t.type === 'stock_received')
      .map(t => ({
        id: t.id,
        grn_number: t.notes || `Stock #${t.id}`,
        receipt_date: formatDateTime(t.date),
        supplier_id: t.supplier_id,
        supplier_name: supplierName(t.Supplier),
        branch_name: null,
        total: round2(t.total_amount),
        open: openLink('supplier', t.supplier_id),
      }));
    const stockLedgerTotal = round2(stockLedgerRows.reduce((s, r) => s + r.total, 0));
    // "Stock received" above only counts GRNs — formal Purchase Order fulfillment.
    // Stock can also arrive without a PO (e.g. a new product's opening stock tied
    // to a supplier) — still a real supplier-ledger stock_received entry, still
    // paid for, but invisible to the GRN count. Surfaced here so "Paid for this
    // period's stock" (ledger-wide) never looks bigger than what was "received"
    // for a reason that isn't explained on the page.
    const stockOutsidePO = round2(Math.max(0, stockLedgerTotal - round2(stockReceived)));
    const stockCardRows = receiptRows.length ? receiptRows : stockLedgerRows;
    const stockCardTotal = receiptRows.length ? round2(stockReceived) : stockLedgerTotal;
    const stockCardExtra = receiptRows.length
      ? `${receiptRows.length} receipt(s)`
      : `${stockLedgerRows.length} ledger entr${stockLedgerRows.length === 1 ? 'y' : 'ies'}`;

    return res.json({
      module: 'purchases',
      from,
      to,
      branch_id: branchId || null,
      supplier_id: supplierId || null,
      cards: [
        {
          key: 'stock_received',
          title: 'Stock received via Purchase Orders',
          amount: stockCardTotal,
          hint: (receiptRows.length
            ? 'Posted goods receipt notes (GRNs) in this period'
            : 'Supplier ledger stock received (no posted GRNs in range)')
            + (stockOutsidePO > 0.009 ? ` — plus ${moneyStr(stockOutsidePO)} received outside the PO workflow this period (see Payments below)` : ''),
          tone: 'green',
          extra: stockCardExtra,
          breakdown: {
            columns: [
              { header: receiptRows.length ? 'GRN' : 'Ref', key: 'grn_number' },
              { header: 'Date', key: 'receipt_date' },
              { header: 'Supplier', key: 'supplier_name' },
              { header: 'Amount', key: 'total', money: true, align: 'right' },
            ],
            rows: stockCardRows,
            total: stockCardTotal,
          },
        },
        {
          key: 'payments_out',
          title: 'Payments to suppliers',
          amount: round2(paymentsOut),
          hint: `${moneyStr(paymentsForThisStock)} for stock received this period + ${moneyStr(paymentsForOlderBalance)} settling earlier balances — can exceed "Stock received" above when older dues are paid off now`,
          tone: 'red',
          extra: `Cash ${moneyStr(paymentCash)} · Bank ${moneyStr(paymentBank)}`,
          breakdown: {
            columns: [
              { header: 'Date', key: 'date' },
              { header: 'Supplier', key: 'supplier_name' },
              { header: 'Method', key: 'method' },
              { header: 'Amount', key: 'amount', money: true, align: 'right' },
            ],
            rows: paymentRows,
            total: round2(paymentsOut),
          },
        },
        {
          key: 'credit_purchases',
          title: 'Credit purchases',
          amount: round2(creditPurchases),
          hint: 'New payables booked from stock received on credit',
          tone: 'amber',
          extra: null,
          breakdown: {
            columns: [
              { header: 'Date', key: 'date' },
              { header: 'Supplier', key: 'supplier_name' },
              { header: 'Method', key: 'method' },
              { header: 'Credit amount', key: 'credit_amount', money: true, align: 'right' },
            ],
            rows: creditRows,
            total: round2(creditPurchases),
          },
        },
        {
          key: 'payables',
          title: 'Payables outstanding',
          amount: payablesTotal,
          hint: 'Amount suppliers are still owed (snapshot)',
          tone: 'amber',
          extra: `${payablesList.length} supplier(s)`,
          breakdown: {
            columns: [
              { header: 'Supplier', key: 'supplier_name' },
              { header: 'Payable', key: 'payable', money: true, align: 'right' },
            ],
            rows: payablesList,
            total: payablesTotal,
          },
        },
        {
          key: 'advances',
          title: 'Supplier advances / credit',
          amount: advancesTotal,
          hint: 'Prepaid balance with suppliers (snapshot)',
          tone: 'blue',
          extra: `${advancesList.length} supplier(s)`,
          breakdown: {
            columns: [
              { header: 'Supplier', key: 'supplier_name' },
              { header: 'Advance', key: 'advance', money: true, align: 'right' },
            ],
            rows: advancesList,
            total: advancesTotal,
          },
        },
      ],
      tabs: [
        {
          id: 'by_day',
          label: 'By day',
          columns: [
            { header: 'Date', key: 'date' },
            { header: 'Stock in', key: 'stock_in', money: true, align: 'right' },
            { header: 'Payments', key: 'payments', money: true, align: 'right' },
            { header: 'Credit', key: 'credit', money: true, align: 'right' },
          ],
          rows: byDay,
          totals: {
            __label: 'Total',
            stock_in: round2(byDay.reduce((s, d) => s + d.stock_in, 0)),
            payments: round2(byDay.reduce((s, d) => s + d.payments, 0)),
            credit: round2(byDay.reduce((s, d) => s + d.credit, 0)),
          },
        },
        {
          id: 'receipts',
          label: 'Receipts',
          columns: [
            { header: 'GRN / Ref', key: 'grn_number' },
            { header: 'Date', key: 'receipt_date' },
            { header: 'Supplier', key: 'supplier_name' },
            { header: 'Branch', key: 'branch_name' },
            { header: 'Total', key: 'total', money: true, align: 'right' },
          ],
          rows: stockCardRows,
        },
        {
          id: 'payments',
          label: 'Payments',
          columns: [
            { header: 'Date', key: 'date' },
            { header: 'Supplier', key: 'supplier_name' },
            { header: 'Method', key: 'method' },
            { header: 'Amount', key: 'amount', money: true, align: 'right' },
          ],
          rows: paymentRows,
          totals: { __label: 'Total', amount: round2(paymentsOut) },
        },
        {
          id: 'payables',
          label: 'Payables',
          columns: [
            { header: 'Supplier', key: 'supplier_name' },
            { header: 'Phone', key: 'phone' },
            { header: 'Payable', key: 'payable', money: true, align: 'right' },
          ],
          rows: payablesList,
          totals: { __label: 'Total', payable: payablesTotal },
        },
      ],
      pdf: {
        title: 'Purchases Summary Report',
        sections: [
          {
            heading: 'Money flow',
            rows: [
              { label: 'Stock received via Purchase Orders (this period)', value: moneyStr(stockReceived) },
              { label: 'Stock received outside Purchase Orders (this period)', value: moneyStr(stockOutsidePO) },
              { label: 'Total stock received (this period)', value: moneyStr(round2(stockReceived + stockOutsidePO)) },
              { label: 'Paid for this period\'s stock (either kind, above)', value: moneyStr(paymentsForThisStock) },
              { label: 'Paid toward earlier balances (stock from a prior period)', value: moneyStr(paymentsForOlderBalance) },
              { label: 'Total payments out (this period)', value: moneyStr(paymentsOut) },
              { label: 'Credit purchases (new, unpaid)', value: moneyStr(creditPurchases) },
              { label: 'Payables outstanding (all-time snapshot)', value: moneyStr(payablesTotal) },
              { label: 'Supplier advances (all-time snapshot)', value: moneyStr(advancesTotal) },
            ],
          },
        ],
        tables: [
          pdfTable(
            'Goods receipts',
            [
              { header: 'GRN', key: 'grn_number' },
              { header: 'Date', key: 'receipt_date' },
              { header: 'Supplier', key: 'supplier_name' },
              { header: 'Amount', key: 'total', money: true, align: 'right' },
            ],
            receiptRows,
            { __label: 'Total', total: round2(stockReceived) },
          ),
          pdfTable(
            'Supplier payments',
            [
              { header: 'Date', key: 'date' },
              { header: 'Supplier', key: 'supplier_name' },
              { header: 'Method', key: 'method' },
              { header: 'Amount', key: 'amount', money: true, align: 'right' },
            ],
            paymentRows,
            { __label: 'Total', amount: round2(paymentsOut) },
          ),
        ],
      },
      meta: { generated_at: new Date().toISOString() },
    });
  } catch (error) {
    console.error('purchasesSummary report error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.inventorySummary = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { from, to } = defaultRange(req.query);
    const branchId = parseBranchId(req.query);
    const productId = req.query.product_id ? parseInt(req.query.product_id, 10) : undefined;
    const { fromDate, toDate } = rangeDates(from, to);

    const moveWhere = { created_at: { [Op.between]: [fromDate, toDate] } };
    if (branchId) moveWhere.branch_id = branchId;
    if (productId) moveWhere.product_id = productId;

    const movements = await db.StockMovement.findAll({
      where: moveWhere,
      include: [
        { model: db.Product, where: { shop_id: shopId }, attributes: ['id', 'name', 'sku', 'cost_price'] },
        { model: db.Branch, attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
    });

    const productWhere = { shop_id: shopId, status: 'active' };
    if (productId) productWhere.id = productId;
    const stockInclude = {
      model: db.Stock,
      as: 'Stock',
      attributes: ['branch_id', 'quantity_on_hand'],
      ...(branchId ? { where: { branch_id: branchId } } : {}),
    };
    const products = await db.Product.findAll({
      where: productWhere,
      attributes: ['id', 'name', 'sku', 'cost_price', 'reorder_level'],
      include: [stockInclude],
    });

    let stockInQty = 0;
    let stockInValue = 0;
    let stockOutQty = 0;
    let stockOutValue = 0;
    const byProductMap = new Map();
    const movementRows = [];

    for (const m of movements) {
      const qty = parseFloat(m.quantity || 0);
      const cost = parseFloat(m.Product?.cost_price || 0);
      const value = round2(Math.abs(qty) * cost);
      const incoming = qty > 0;
      const outgoing = qty < 0;

      if (incoming) {
        stockInQty = round2(stockInQty + Math.abs(qty));
        stockInValue = round2(stockInValue + value);
      }
      if (outgoing) {
        stockOutQty = round2(stockOutQty + Math.abs(qty));
        stockOutValue = round2(stockOutValue + value);
      }

      const pid = m.product_id;
      const prow = byProductMap.get(pid) || {
        product_id: pid,
        product_name: m.Product?.name || `Product #${pid}`,
        sku: m.Product?.sku || null,
        in_qty: 0,
        out_qty: 0,
        net_qty: 0,
        value_moved: 0,
      };
      if (incoming) prow.in_qty = round2(prow.in_qty + Math.abs(qty));
      if (outgoing) prow.out_qty = round2(prow.out_qty + Math.abs(qty));
      prow.net_qty = round2(prow.in_qty - prow.out_qty);
      prow.value_moved = round2(prow.value_moved + value);
      byProductMap.set(pid, prow);

      movementRows.push({
        id: m.id,
        date: formatDateTime(m.createdAt),
        product_id: pid,
        product_name: m.Product?.name || '—',
        sku: m.Product?.sku || null,
        branch_name: m.Branch?.name || null,
        ref_type: m.ref_type,
        quantity: round2(qty),
        value: value,
        open: openLink('product', pid),
      });
    }

    let onHandQty = 0;
    let onHandValue = 0;
    const onHandRows = [];
    const lowStockRows = [];
    for (const p of products) {
      const stocks = p.Stock || [];
      const qty = round2(stocks.reduce((s, st) => s + parseFloat(st.quantity_on_hand || 0), 0));
      const value = round2(qty * parseFloat(p.cost_price || 0));
      onHandQty = round2(onHandQty + qty);
      onHandValue = round2(onHandValue + value);
      if (qty > 0.009) {
        onHandRows.push({
          product_id: p.id,
          product_name: p.name,
          sku: p.sku,
          qty,
          value,
          open: openLink('product', p.id),
        });
      }
      if (qty <= parseFloat(p.reorder_level || 0)) {
        lowStockRows.push({
          product_id: p.id,
          product_name: p.name,
          sku: p.sku,
          on_hand: qty,
          reorder_level: p.reorder_level,
          value,
          open: openLink('product', p.id),
        });
      }
    }
    onHandRows.sort((a, b) => b.value - a.value);
    lowStockRows.sort((a, b) => a.on_hand - b.on_hand);
    const byProduct = [...byProductMap.values()]
      .map(p => ({ ...p, open: openLink('product', p.product_id) }))
      .sort((a, b) => b.value_moved - a.value_moved);
    const stockInRows = movementRows.filter(r => r.quantity > 0);
    const stockOutRows = movementRows.filter(r => r.quantity < 0);

    return res.json({
      module: 'inventory',
      from,
      to,
      branch_id: branchId || null,
      product_id: productId || null,
      cards: [
        {
          key: 'stock_in',
          title: 'Stock in',
          amount: round2(stockInValue),
          hint: 'Incoming movements in this period (at cost)',
          tone: 'green',
          extra: `${stockInQty} units`,
          breakdown: {
            columns: [
              { header: 'Date', key: 'date' },
              { header: 'Product', key: 'product_name' },
              { header: 'Qty', key: 'quantity', align: 'right' },
              { header: 'Value', key: 'value', money: true, align: 'right' },
            ],
            rows: stockInRows,
            total: round2(stockInValue),
          },
        },
        {
          key: 'stock_out',
          title: 'Stock out',
          amount: round2(stockOutValue),
          hint: 'Outgoing movements in this period (at cost)',
          tone: 'red',
          extra: `${stockOutQty} units`,
          breakdown: {
            columns: [
              { header: 'Date', key: 'date' },
              { header: 'Product', key: 'product_name' },
              { header: 'Qty', key: 'quantity', align: 'right' },
              { header: 'Value', key: 'value', money: true, align: 'right' },
            ],
            rows: stockOutRows,
            total: round2(stockOutValue),
          },
        },
        {
          key: 'on_hand_value',
          title: 'On-hand value',
          amount: round2(onHandValue),
          hint: 'Current stock quantity × cost price',
          tone: 'blue',
          extra: `${onHandQty} units on hand`,
          breakdown: {
            columns: [
              { header: 'Product', key: 'product_name' },
              { header: 'SKU', key: 'sku' },
              { header: 'Qty', key: 'qty', align: 'right' },
              { header: 'Value', key: 'value', money: true, align: 'right' },
            ],
            rows: onHandRows,
            total: round2(onHandValue),
          },
        },
        {
          key: 'low_stock',
          title: 'Low stock items',
          amount: lowStockRows.length,
          hint: 'Products at or below reorder level',
          tone: 'amber',
          extra: null,
          breakdown: {
            columns: [
              { header: 'Product', key: 'product_name' },
              { header: 'On hand', key: 'on_hand', align: 'right' },
              { header: 'Reorder', key: 'reorder_level', align: 'right' },
            ],
            rows: lowStockRows,
            total: lowStockRows.length,
          },
        },
      ],
      tabs: [
        {
          id: 'movements',
          label: 'Movements',
          columns: [
            { header: 'Date', key: 'date' },
            { header: 'Product', key: 'product_name' },
            { header: 'Type', key: 'ref_type' },
            { header: 'Qty', key: 'quantity', align: 'right' },
            { header: 'Value', key: 'value', money: true, align: 'right' },
          ],
          rows: movementRows,
        },
        {
          id: 'by_product',
          label: 'By product',
          columns: [
            { header: 'Product', key: 'product_name' },
            { header: 'In', key: 'in_qty', align: 'right' },
            { header: 'Out', key: 'out_qty', align: 'right' },
            { header: 'Value moved', key: 'value_moved', money: true, align: 'right' },
          ],
          rows: byProduct,
        },
        {
          id: 'low_stock',
          label: 'Low stock',
          columns: [
            { header: 'Product', key: 'product_name' },
            { header: 'SKU', key: 'sku' },
            { header: 'On hand', key: 'on_hand', align: 'right' },
            { header: 'Reorder', key: 'reorder_level', align: 'right' },
            { header: 'Value', key: 'value', money: true, align: 'right' },
          ],
          rows: lowStockRows,
        },
      ],
      pdf: {
        title: 'Inventory Summary Report',
        sections: [
          {
            heading: 'Stock flow',
            rows: [
              { label: 'Stock in (value)', value: moneyStr(stockInValue) },
              { label: 'Stock out (value)', value: moneyStr(stockOutValue) },
              { label: 'On-hand value', value: moneyStr(onHandValue) },
              { label: 'Low stock count', value: String(lowStockRows.length) },
            ],
          },
        ],
        tables: [
          pdfTable(
            'Recent movements',
            [
              { header: 'Date', key: 'date' },
              { header: 'Product', key: 'product_name' },
              { header: 'Type', key: 'ref_type' },
              { header: 'Qty', key: 'quantity', align: 'right' },
              { header: 'Value', key: 'value', money: true, align: 'right' },
            ],
            movementRows,
          ),
        ],
      },
      meta: { generated_at: new Date().toISOString() },
    });
  } catch (error) {
    console.error('inventorySummary report error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.customersSummary = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { from, to } = defaultRange(req.query);
    const branchId = parseBranchId(req.query);
    const customerId = req.query.customer_id ? parseInt(req.query.customer_id, 10) : undefined;
    const { fromDate, toDate } = rangeDates(from, to);

    const txnWhere = { shop_id: shopId, date: { [Op.between]: [fromDate, toDate] } };
    if (customerId) txnWhere.customer_id = customerId;
    const txns = await db.CustomerTransaction.findAll({
      where: txnWhere,
      include: [{ model: db.Customer, attributes: ['id', 'name', 'phone', 'current_balance'] }],
      order: [['date', 'DESC']],
    });

    const customerSnapshotWhere = { shop_id: shopId, status: 'active' };
    if (customerId) customerSnapshotWhere.id = customerId;
    const customers = await db.Customer.findAll({
      where: customerSnapshotWhere,
      attributes: ['id', 'name', 'phone', 'current_balance', 'credit_limit'],
      order: [['name', 'ASC']],
    });

    let charges = 0;
    let recoveries = 0;
    let returnCredits = 0;
    const byDayMap = new Map();
    const txnRows = [];
    const customerDetailCols = [
      { header: 'Date', key: 'date' },
      { header: 'Customer', key: 'customer_name' },
      { header: 'Amount', key: 'amount', money: true, align: 'right' },
      { header: 'Method', key: 'method' },
    ];

    for (const t of txns) {
      const amt = round2(t.amount);
      const day = dayKey(t.date) || from;
      const dayRow = byDayMap.get(day) || { date: day, charges: 0, recoveries: 0, returns: 0 };
      const row = {
        id: t.id,
        date: formatDateTime(t.date),
        type: t.type,
        customer_id: t.customer_id,
        customer_name: t.Customer?.name || '—',
        amount: amt,
        method: t.method,
        open: openLink('customer', t.customer_id),
      };
      if (t.related_sale_id) {
        row.related_sale_id = t.related_sale_id;
        row.sale_open = openLink('sale', t.related_sale_id);
      }
      txnRows.push(row);
      if (t.type === 'sale_charge') {
        charges += amt;
        dayRow.charges = round2(dayRow.charges + amt);
      } else if (t.type === 'payment_received') {
        recoveries += amt;
        dayRow.recoveries = round2(dayRow.recoveries + amt);
      } else if (t.type === 'return_credit') {
        returnCredits += amt;
        dayRow.returns = round2(dayRow.returns + amt);
      }
      byDayMap.set(day, dayRow);
    }

    const debtors = customers
      .filter(c => parseFloat(c.current_balance || 0) > 0.009)
      .map(c => ({
        customer_id: c.id,
        customer_name: c.name,
        phone: c.phone,
        receivable: round2(c.current_balance),
        credit_limit: round2(c.credit_limit),
        open: openLink('customer', c.id),
      }))
      .sort((a, b) => b.receivable - a.receivable);

    const advances = customers
      .filter(c => parseFloat(c.current_balance || 0) < -0.009)
      .map(c => ({
        customer_id: c.id,
        customer_name: c.name,
        advance: round2(Math.abs(c.current_balance)),
        open: openLink('customer', c.id),
      }))
      .sort((a, b) => b.advance - a.advance);

    const receivablesTotal = round2(debtors.reduce((s, d) => s + d.receivable, 0));
    const advancesTotal = round2(advances.reduce((s, d) => s + d.advance, 0));
    const byDay = [...byDayMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    const chargeRows = txnRows.filter(r => r.type === 'sale_charge');
    const recoveryRows = txnRows.filter(r => r.type === 'payment_received');
    const returnCreditRows = txnRows.filter(r => r.type === 'return_credit');

    return res.json({
      module: 'customers',
      from,
      to,
      branch_id: branchId || null,
      customer_id: customerId || null,
      cards: [
        {
          key: 'charges',
          title: 'Sale charges',
          amount: round2(charges),
          hint: 'Customer ledger charges in this period',
          tone: 'green',
          extra: null,
          breakdown: {
            columns: customerDetailCols,
            rows: chargeRows,
            total: round2(charges),
          },
        },
        {
          key: 'recoveries',
          title: 'Recoveries',
          amount: round2(recoveries),
          hint: 'Payments received from customers',
          tone: 'blue',
          extra: null,
          breakdown: {
            columns: customerDetailCols,
            rows: recoveryRows,
            total: round2(recoveries),
          },
        },
        {
          key: 'return_credits',
          title: 'Return credits',
          amount: round2(returnCredits),
          hint: 'Credits issued via returns',
          tone: 'red',
          extra: null,
          breakdown: {
            columns: customerDetailCols,
            rows: returnCreditRows,
            total: round2(returnCredits),
          },
        },
        {
          key: 'receivables',
          title: 'Receivables outstanding',
          amount: receivablesTotal,
          hint: 'Customers who currently owe the shop',
          tone: 'amber',
          extra: `${debtors.length} customer(s)`,
          breakdown: {
            columns: [
              { header: 'Customer', key: 'customer_name' },
              { header: 'Due', key: 'receivable', money: true, align: 'right' },
            ],
            rows: debtors,
            total: receivablesTotal,
          },
        },
        {
          key: 'advances',
          title: 'Customer advances',
          amount: advancesTotal,
          hint: 'Prepaid customer balances (snapshot)',
          tone: 'violet',
          extra: `${advances.length} customer(s)`,
          breakdown: {
            columns: [
              { header: 'Customer', key: 'customer_name' },
              { header: 'Advance', key: 'advance', money: true, align: 'right' },
            ],
            rows: advances,
            total: advancesTotal,
          },
        },
      ],
      tabs: [
        {
          id: 'by_day',
          label: 'By day',
          columns: [
            { header: 'Date', key: 'date' },
            { header: 'Charges', key: 'charges', money: true, align: 'right' },
            { header: 'Recoveries', key: 'recoveries', money: true, align: 'right' },
            { header: 'Returns', key: 'returns', money: true, align: 'right' },
          ],
          rows: byDay,
        },
        {
          id: 'transactions',
          label: 'Transactions',
          columns: [
            { header: 'Date', key: 'date' },
            { header: 'Type', key: 'type' },
            { header: 'Customer', key: 'customer_name' },
            { header: 'Amount', key: 'amount', money: true, align: 'right' },
          ],
          rows: txnRows,
        },
        {
          id: 'debtors',
          label: 'Debtors',
          columns: [
            { header: 'Customer', key: 'customer_name' },
            { header: 'Phone', key: 'phone' },
            { header: 'Receivable', key: 'receivable', money: true, align: 'right' },
          ],
          rows: debtors,
          totals: { __label: 'Total', receivable: receivablesTotal },
        },
      ],
      pdf: {
        title: 'Registered Customers Summary Report',
        sections: [
          {
            heading: 'Money flow (registered customers only)',
            rows: [
              { label: 'Customer type covered', value: 'Registered (has a customer account) — walk-in sales are under Sales → Collected at Sale, not here' },
              { label: 'Sale charges', value: moneyStr(charges) },
              { label: 'Recoveries', value: moneyStr(recoveries) },
              { label: 'Return credits', value: moneyStr(returnCredits) },
              { label: 'Receivables', value: moneyStr(receivablesTotal) },
              { label: 'Advances', value: moneyStr(advancesTotal) },
            ],
          },
        ],
        tables: [
          pdfTable(
            'Transactions',
            [
              { header: 'Date', key: 'date' },
              { header: 'Type', key: 'type' },
              { header: 'Customer', key: 'customer_name' },
              { header: 'Amount', key: 'amount', money: true, align: 'right' },
            ],
            txnRows,
          ),
        ],
      },
      meta: { generated_at: new Date().toISOString() },
    });
  } catch (error) {
    console.error('customersSummary report error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.suppliersSummary = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { from, to } = defaultRange(req.query);
    const branchId = parseBranchId(req.query);
    const supplierId = req.query.supplier_id ? parseInt(req.query.supplier_id, 10) : undefined;
    const { fromDate, toDate } = rangeDates(from, to);

    const txnWhere = { shop_id: shopId, date: { [Op.between]: [fromDate, toDate] } };
    if (supplierId) txnWhere.supplier_id = supplierId;
    const transactions = await db.SupplierTransaction.findAll({
      where: txnWhere,
      include: [{ model: db.Supplier, attributes: ['id', 'company_name', 'name'] }],
      order: [['date', 'DESC']],
    });

    const supplierSnapshotWhere = { shop_id: shopId, status: 'active' };
    if (supplierId) supplierSnapshotWhere.id = supplierId;
    const suppliers = await db.Supplier.findAll({
      where: supplierSnapshotWhere,
      attributes: ['id', 'company_name', 'name', 'phone', 'current_payable', 'credit_balance'],
      order: [['company_name', 'ASC']],
    });

    let stockReceived = 0;
    let paymentsOut = 0;
    let paymentsForThisStock = 0;
    let paymentsForOlderBalance = 0;
    const txnRows = [];
    const supplierDetailCols = [
      { header: 'Date', key: 'date' },
      { header: 'Supplier', key: 'supplier_name' },
      { header: 'Amount', key: 'amount', money: true, align: 'right' },
      { header: 'Method', key: 'method' },
    ];

    for (const t of transactions) {
      const amt = round2(t.total_amount);
      if (t.type === 'stock_received') {
        stockReceived += amt;
        txnRows.push({
          id: t.id,
          date: formatDateTime(t.date),
          type: t.type,
          supplier_id: t.supplier_id,
          supplier_name: supplierName(t.Supplier),
          amount: amt,
          method: t.method,
          open: openLink('supplier', t.supplier_id),
        });

        // Paid in full/partially the moment stock arrived (paymentStatus
        // 'paid'/'partial' on the receive form) never gets its own
        // 'payment_made' row — that type only covers a LATER standalone
        // payment against an existing payable. Without this, cash/bank paid
        // at receipt silently vanished from "Payments out" even though the
        // matching "Payables" snapshot correctly shows Rs. 0 for it.
        const paidAtReceipt = round2(Math.min(parseFloat(t.paid_amount || 0), parseFloat(t.total_amount || 0)));
        if (paidAtReceipt > 0 && t.method !== 'supplier_credit') {
          paymentsOut += paidAtReceipt;
          paymentsForThisStock = round2(paymentsForThisStock + paidAtReceipt);
          txnRows.push({
            id: t.id,
            date: formatDateTime(t.date),
            type: 'payment_made',
            supplier_id: t.supplier_id,
            supplier_name: supplierName(t.Supplier),
            amount: paidAtReceipt,
            method: t.method,
            notes: 'Paid at time of stock receipt',
            open: openLink('supplier', t.supplier_id),
          });
        }
      } else if (t.type === 'payment_made') {
        paymentsOut += amt;
        paymentsForOlderBalance = round2(paymentsForOlderBalance + amt);
        txnRows.push({
          id: t.id,
          date: formatDateTime(t.date),
          type: t.type,
          supplier_id: t.supplier_id,
          supplier_name: supplierName(t.Supplier),
          amount: amt,
          method: t.method,
          open: openLink('supplier', t.supplier_id),
        });
      }
    }

    const stockReceivedRows = txnRows.filter(r => r.type === 'stock_received');
    const paymentOutRows = txnRows.filter(r => r.type === 'payment_made');

    const payablesList = suppliers
      .filter(s => parseFloat(s.current_payable || 0) > 0.009)
      .map(s => ({
        supplier_id: s.id,
        supplier_name: supplierName(s),
        phone: s.phone,
        payable: round2(s.current_payable),
        open: openLink('supplier', s.id),
      }))
      .sort((a, b) => b.payable - a.payable);

    const advancesList = suppliers
      .filter(s => parseFloat(s.credit_balance || 0) > 0.009)
      .map(s => ({
        supplier_id: s.id,
        supplier_name: supplierName(s),
        advance: round2(s.credit_balance),
        open: openLink('supplier', s.id),
      }))
      .sort((a, b) => b.advance - a.advance);

    const payablesTotal = round2(payablesList.reduce((s, p) => s + p.payable, 0));
    const advancesTotal = round2(advancesList.reduce((s, p) => s + p.advance, 0));

    return res.json({
      module: 'suppliers',
      from,
      to,
      branch_id: branchId || null,
      supplier_id: supplierId || null,
      cards: [
        {
          key: 'stock_received',
          title: 'Stock received',
          amount: round2(stockReceived),
          hint: 'Supplier ledger stock received in period',
          tone: 'green',
          extra: null,
          breakdown: {
            columns: supplierDetailCols,
            rows: stockReceivedRows,
            total: round2(stockReceived),
          },
        },
        {
          key: 'payments_out',
          title: 'Payments made',
          amount: round2(paymentsOut),
          hint: `${moneyStr(paymentsForThisStock)} for stock received this period + ${moneyStr(paymentsForOlderBalance)} settling earlier balances — can exceed "Stock received" above when older dues are paid off now`,
          tone: 'red',
          extra: null,
          breakdown: {
            columns: supplierDetailCols,
            rows: paymentOutRows,
            total: round2(paymentsOut),
          },
        },
        {
          key: 'payables',
          title: 'Payables outstanding',
          amount: payablesTotal,
          hint: 'Current supplier dues (snapshot)',
          tone: 'amber',
          extra: `${payablesList.length} supplier(s)`,
          breakdown: {
            columns: [
              { header: 'Supplier', key: 'supplier_name' },
              { header: 'Payable', key: 'payable', money: true, align: 'right' },
            ],
            rows: payablesList,
            total: payablesTotal,
          },
        },
        {
          key: 'advances',
          title: 'Supplier advances',
          amount: advancesTotal,
          hint: 'Credit balance with suppliers',
          tone: 'blue',
          extra: `${advancesList.length} supplier(s)`,
          breakdown: {
            columns: [
              { header: 'Supplier', key: 'supplier_name' },
              { header: 'Advance', key: 'advance', money: true, align: 'right' },
            ],
            rows: advancesList,
            total: advancesTotal,
          },
        },
      ],
      tabs: [
        {
          id: 'transactions',
          label: 'Transactions',
          columns: [
            { header: 'Date', key: 'date' },
            { header: 'Type', key: 'type' },
            { header: 'Supplier', key: 'supplier_name' },
            { header: 'Method', key: 'method' },
            { header: 'Amount', key: 'amount', money: true, align: 'right' },
          ],
          rows: txnRows,
        },
        {
          id: 'payables',
          label: 'Payables',
          columns: [
            { header: 'Supplier', key: 'supplier_name' },
            { header: 'Phone', key: 'phone' },
            { header: 'Payable', key: 'payable', money: true, align: 'right' },
          ],
          rows: payablesList,
          totals: { __label: 'Total', payable: payablesTotal },
        },
      ],
      pdf: {
        title: 'Suppliers Summary Report',
        sections: [
          {
            heading: 'Ledger summary',
            rows: [
              { label: 'Stock received (this period)', value: moneyStr(stockReceived) },
              { label: 'Paid for this period\'s stock', value: moneyStr(paymentsForThisStock) },
              { label: 'Paid toward earlier balances', value: moneyStr(paymentsForOlderBalance) },
              { label: 'Total payments out (this period)', value: moneyStr(paymentsOut) },
              { label: 'Payables outstanding (all-time snapshot)', value: moneyStr(payablesTotal) },
              { label: 'Supplier advances (all-time snapshot)', value: moneyStr(advancesTotal) },
            ],
          },
        ],
        tables: [
          pdfTable(
            'Transactions',
            [
              { header: 'Date', key: 'date' },
              { header: 'Type', key: 'type' },
              { header: 'Supplier', key: 'supplier_name' },
              { header: 'Amount', key: 'amount', money: true, align: 'right' },
            ],
            txnRows,
          ),
        ],
      },
      meta: { generated_at: new Date().toISOString() },
    });
  } catch (error) {
    console.error('suppliersSummary report error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.expensesSummary = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { from, to } = defaultRange(req.query);
    const branchId = parseBranchId(req.query);
    const category = req.query.category ? String(req.query.category).trim() : undefined;
    const { fromDate, toDate } = rangeDates(from, to);

    const expWhere = {
      shop_id: shopId,
      status: 'posted',
      expense_date: { [Op.between]: [fromDate, toDate] },
    };
    if (branchId) expWhere.branch_id = branchId;
    // Exact match — category is free text (no categories table), so this is the
    // same string the by_category breakdown already groups on.
    if (category) expWhere.category = category;

    const expenses = await db.Expense.findAll({
      where: expWhere,
      include: [{ model: db.Branch, attributes: ['id', 'name'] }],
      order: [['expense_date', 'DESC']],
    });

    let totalOut = 0;
    let cashTotal = 0;
    let bankTotal = 0;
    const byCategoryMap = new Map();
    const byDayMap = new Map();
    const expenseRows = [];

    for (const e of expenses) {
      const amt = round2(e.amount);
      totalOut += amt;
      if (e.paid_via === 'cash') cashTotal += amt;
      else if (e.paid_via === 'bank') bankTotal += amt;

      const cat = e.category || 'Other';
      byCategoryMap.set(cat, round2((byCategoryMap.get(cat) || 0) + amt));

      const day = dayKey(e.expense_date) || from;
      byDayMap.set(day, round2((byDayMap.get(day) || 0) + amt));

      expenseRows.push({
        id: e.id,
        expense_date: formatDateTime(e.expense_date),
        category: cat,
        description: e.description,
        paid_via: e.paid_via,
        branch_name: e.Branch?.name || null,
        amount: amt,
      });
    }

    const byCategory = [...byCategoryMap.entries()]
      .map(([category, amount]) => ({ category, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount);
    const byDay = [...byDayMap.entries()]
      .map(([date, amount]) => ({ date, amount: round2(amount) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const expenseDetailCols = [
      { header: 'Date', key: 'expense_date' },
      { header: 'Category', key: 'category' },
      { header: 'Description', key: 'description' },
      { header: 'Amount', key: 'amount', money: true, align: 'right' },
    ];
    const cashExpenseRows = expenseRows.filter(r => r.paid_via === 'cash');
    const bankExpenseRows = expenseRows.filter(r => r.paid_via === 'bank');

    return res.json({
      module: 'expenses',
      from,
      to,
      branch_id: branchId || null,
      category: category || null,
      cards: [
        {
          key: 'total_outgoings',
          title: 'Total expenses',
          amount: round2(totalOut),
          hint: 'Posted expenses in this period',
          tone: 'red',
          extra: `${expenseRows.length} expense(s)`,
          breakdown: {
            columns: expenseDetailCols,
            rows: expenseRows,
            total: round2(totalOut),
          },
        },
        {
          key: 'cash',
          title: 'Paid by cash',
          amount: round2(cashTotal),
          hint: 'Expenses paid from cash',
          tone: 'amber',
          extra: null,
          breakdown: {
            columns: expenseDetailCols,
            rows: cashExpenseRows,
            total: round2(cashTotal),
          },
        },
        {
          key: 'bank',
          title: 'Paid by bank',
          amount: round2(bankTotal),
          hint: 'Expenses paid from bank',
          tone: 'blue',
          extra: null,
          breakdown: {
            columns: expenseDetailCols,
            rows: bankExpenseRows,
            total: round2(bankTotal),
          },
        },
      ],
      tabs: [
        {
          id: 'by_category',
          label: 'By category',
          columns: [
            { header: 'Category', key: 'category' },
            { header: 'Amount', key: 'amount', money: true, align: 'right' },
          ],
          rows: byCategory,
          totals: { __label: 'Total', amount: round2(totalOut) },
        },
        {
          id: 'by_day',
          label: 'By day',
          columns: [
            { header: 'Date', key: 'date' },
            { header: 'Amount', key: 'amount', money: true, align: 'right' },
          ],
          rows: byDay,
          totals: { __label: 'Total', amount: round2(totalOut) },
        },
        {
          id: 'expenses',
          label: 'Expenses',
          columns: [
            { header: 'Date', key: 'expense_date' },
            { header: 'Category', key: 'category' },
            { header: 'Paid via', key: 'paid_via' },
            { header: 'Amount', key: 'amount', money: true, align: 'right' },
          ],
          rows: expenseRows,
          totals: { __label: 'Total', amount: round2(totalOut) },
        },
      ],
      pdf: {
        title: 'Expenses Summary Report',
        sections: [
          {
            heading: 'Outgoings',
            rows: [
              { label: 'Total expenses', value: moneyStr(totalOut) },
              { label: 'Cash', value: moneyStr(cashTotal) },
              { label: 'Bank', value: moneyStr(bankTotal) },
            ],
          },
        ],
        tables: [
          pdfTable(
            'By category',
            [
              { header: 'Category', key: 'category' },
              { header: 'Amount', key: 'amount', money: true, align: 'right' },
            ],
            byCategory,
            { __label: 'Total', amount: round2(totalOut) },
          ),
          pdfTable(
            'Expenses',
            [
              { header: 'Date', key: 'expense_date' },
              { header: 'Category', key: 'category' },
              { header: 'Paid via', key: 'paid_via' },
              { header: 'Amount', key: 'amount', money: true, align: 'right' },
            ],
            expenseRows,
            { __label: 'Total', amount: round2(totalOut) },
          ),
        ],
      },
      meta: { generated_at: new Date().toISOString() },
    });
  } catch (error) {
    console.error('expensesSummary report error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.accountingSummary = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { from, to } = defaultRange(req.query);
    const branchId = parseBranchId(req.query);
    // Voucher type is a fixed enum, not a linked entity — see backend/models/voucher.js.
    // The by_type tab already groups on this same column.
    const VOUCHER_TYPES = ['payment', 'receipt', 'journal', 'contra', 'opening', 'closing'];
    const voucherType = VOUCHER_TYPES.includes(req.query.voucher_type) ? req.query.voucher_type : undefined;
    const { fromDate, toDate } = rangeDates(from, to);

    const voucherWhere = {
      shop_id: shopId,
      status: 'posted',
      voucher_date: { [Op.between]: [fromDate, toDate] },
    };
    if (branchId) voucherWhere.branch_id = branchId;
    if (voucherType) voucherWhere.voucher_type = voucherType;

    const vouchers = await db.Voucher.findAll({
      where: voucherWhere,
      include: [{ model: db.VoucherEntry, attributes: ['debit_amount', 'credit_amount'] }],
      order: [['voucher_date', 'DESC']],
    });

    let receiptsIn = 0;
    let paymentsOut = 0;
    let journalTotal = 0;
    let contraTotal = 0;
    let journalCount = 0;
    let contraCount = 0;
    const byTypeMap = new Map();
    const byDayMap = new Map();
    const voucherRows = [];

    for (const v of vouchers) {
      const entries = v.VoucherEntries || [];
      const debitSum = round2(entries.reduce((s, e) => s + parseFloat(e.debit_amount || 0), 0));
      const creditSum = round2(entries.reduce((s, e) => s + parseFloat(e.credit_amount || 0), 0));
      const amount = debitSum || creditSum;

      if (v.voucher_type === 'receipt') receiptsIn += debitSum;
      else if (v.voucher_type === 'payment') paymentsOut += creditSum;
      else if (v.voucher_type === 'journal') {
        journalCount += 1;
        journalTotal = round2(journalTotal + debitSum);
      } else if (v.voucher_type === 'contra') {
        contraCount += 1;
        contraTotal = round2(contraTotal + debitSum);
      }

      byTypeMap.set(v.voucher_type, round2((byTypeMap.get(v.voucher_type) || 0) + amount));

      const day = dayKey(v.voucher_date) || from;
      byDayMap.set(day, round2((byDayMap.get(day) || 0) + amount));

      voucherRows.push({
        id: v.id,
        voucher_number: v.voucher_number,
        voucher_date: formatDateTime(v.voucher_date),
        voucher_type: v.voucher_type,
        amount,
        narration: v.narration,
        open: openLink('voucher', v.id),
      });
    }

    const byType = [...byTypeMap.entries()]
      .map(([voucher_type, amount]) => ({ voucher_type, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount);
    const byDay = [...byDayMap.entries()]
      .map(([date, amount]) => ({ date, amount: round2(amount) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const voucherDetailCols = [
      { header: 'Number', key: 'voucher_number' },
      { header: 'Date', key: 'voucher_date' },
      { header: 'Type', key: 'voucher_type' },
      { header: 'Amount', key: 'amount', money: true, align: 'right' },
    ];
    const receiptRows = voucherRows.filter(r => r.voucher_type === 'receipt');
    const paymentRows = voucherRows.filter(r => r.voucher_type === 'payment');
    const journalRows = voucherRows.filter(r => r.voucher_type === 'journal');
    const contraRows = voucherRows.filter(r => r.voucher_type === 'contra');

    return res.json({
      module: 'accounting',
      from,
      to,
      branch_id: branchId || null,
      voucher_type: voucherType || null,
      cards: [
        {
          key: 'receipts_in',
          title: 'Receipts',
          amount: round2(receiptsIn),
          hint: 'Money in via receipt vouchers',
          tone: 'green',
          extra: null,
          breakdown: {
            columns: voucherDetailCols,
            rows: receiptRows,
            total: round2(receiptsIn),
          },
        },
        {
          key: 'payments_out',
          title: 'Payments',
          amount: round2(paymentsOut),
          hint: 'Money out via payment vouchers',
          tone: 'red',
          extra: null,
          breakdown: {
            columns: voucherDetailCols,
            rows: paymentRows,
            total: round2(paymentsOut),
          },
        },
        {
          key: 'journals',
          title: 'Journal vouchers',
          amount: round2(journalTotal),
          hint: 'Journal entry value in period',
          tone: 'violet',
          extra: `${journalCount} voucher(s)`,
          breakdown: {
            columns: voucherDetailCols,
            rows: journalRows,
            total: round2(journalTotal),
          },
        },
        {
          key: 'contra',
          title: 'Contra vouchers',
          amount: round2(contraTotal),
          hint: 'Contra / transfer vouchers',
          tone: 'cyan',
          extra: `${contraCount} voucher(s)`,
          breakdown: {
            columns: voucherDetailCols,
            rows: contraRows,
            total: round2(contraTotal),
          },
        },
        {
          key: 'voucher_count',
          title: 'Vouchers posted',
          amount: vouchers.length,
          hint: 'Total posted vouchers in period',
          tone: 'blue',
          extra: null,
          breakdown: {
            columns: voucherDetailCols,
            rows: voucherRows,
            total: vouchers.length,
          },
        },
      ],
      tabs: [
        {
          id: 'by_type',
          label: 'By type',
          columns: [
            { header: 'Type', key: 'voucher_type' },
            { header: 'Amount', key: 'amount', money: true, align: 'right' },
          ],
          rows: byType,
        },
        {
          id: 'by_day',
          label: 'By day',
          columns: [
            { header: 'Date', key: 'date' },
            { header: 'Amount', key: 'amount', money: true, align: 'right' },
          ],
          rows: byDay,
        },
        {
          id: 'vouchers',
          label: 'Vouchers',
          columns: [
            { header: 'Number', key: 'voucher_number' },
            { header: 'Date', key: 'voucher_date' },
            { header: 'Type', key: 'voucher_type' },
            { header: 'Amount', key: 'amount', money: true, align: 'right' },
          ],
          rows: voucherRows,
        },
      ],
      pdf: {
        title: 'Accounting Summary Report',
        sections: [
          {
            heading: 'Voucher totals',
            rows: [
              { label: 'Receipts in', value: moneyStr(receiptsIn) },
              { label: 'Payments out', value: moneyStr(paymentsOut) },
              { label: 'Journals', value: moneyStr(journalTotal) },
              { label: 'Contra', value: moneyStr(contraTotal) },
              { label: 'Voucher count', value: String(vouchers.length) },
            ],
          },
        ],
        tables: [
          pdfTable(
            'Vouchers',
            [
              { header: 'Number', key: 'voucher_number' },
              { header: 'Date', key: 'voucher_date' },
              { header: 'Type', key: 'voucher_type' },
              { header: 'Amount', key: 'amount', money: true, align: 'right' },
            ],
            voucherRows,
          ),
        ],
      },
      meta: { generated_at: new Date().toISOString() },
    });
  } catch (error) {
    console.error('accountingSummary report error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.employeesSummary = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { from, to } = defaultRange(req.query);
    const branchId = parseBranchId(req.query);
    const employeeId = req.query.employee_id ? parseInt(req.query.employee_id, 10) : undefined;
    const { fromDate, toDate } = rangeDates(from, to);

    const empInclude = {
      model: db.Employee,
      attributes: ['id', 'name', 'branch_id', 'current_payable'],
      ...(branchId ? { where: { branch_id: branchId } } : {}),
    };

    const txnWhere = { shop_id: shopId, date: { [Op.between]: [fromDate, toDate] } };
    if (employeeId) txnWhere.employee_id = employeeId;
    const txns = await db.EmployeeTransaction.findAll({
      where: txnWhere,
      include: [empInclude],
      order: [['date', 'DESC']],
    });

    const empWhere = { shop_id: shopId, status: 'active' };
    if (branchId) empWhere.branch_id = branchId;
    if (employeeId) empWhere.id = employeeId;
    const employees = await db.Employee.findAll({
      where: empWhere,
      attributes: ['id', 'name', 'phone', 'current_payable'],
      order: [['name', 'ASC']],
    });

    let salaryPaid = 0;
    let advancesLoansOut = 0;
    let recoveriesIn = 0;
    const byDayMap = new Map();
    const txnRows = [];
    const employeeDetailCols = [
      { header: 'Date', key: 'date' },
      { header: 'Employee', key: 'employee_name' },
      { header: 'Amount', key: 'amount', money: true, align: 'right' },
      { header: 'Method', key: 'method' },
    ];

    for (const t of txns) {
      if (!t.Employee) continue;
      const amt = round2(t.amount);
      const day = dayKey(t.date) || from;
      txnRows.push({
        id: t.id,
        date: formatDateTime(t.date),
        type: t.type,
        employee_id: t.employee_id,
        employee_name: t.Employee.name,
        amount: amt,
        method: t.method,
        open: openLink('employee', t.employee_id),
      });

      if (t.type === 'payment_made') salaryPaid += amt;
      else if (['advance_given', 'loan_given'].includes(t.type)) advancesLoansOut += amt;
      else if (['loan_repayment', 'receivable_collected'].includes(t.type)) recoveriesIn += amt;

      const out = ['payment_made', 'advance_given', 'loan_given'].includes(t.type) ? amt : 0;
      const inn = ['loan_repayment', 'receivable_collected'].includes(t.type) ? amt : 0;
      const dayRow = byDayMap.get(day) || { date: day, out: 0, in: 0 };
      dayRow.out = round2(dayRow.out + out);
      dayRow.in = round2(dayRow.in + inn);
      byDayMap.set(day, dayRow);
    }

    const payablesList = employees
      .filter(e => parseFloat(e.current_payable || 0) > 0.009)
      .map(e => ({
        employee_id: e.id,
        employee_name: e.name,
        phone: e.phone,
        payable: round2(e.current_payable),
        open: openLink('employee', e.id),
      }))
      .sort((a, b) => b.payable - a.payable);

    const payablesTotal = round2(payablesList.reduce((s, p) => s + p.payable, 0));
    const byDay = [...byDayMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    const salaryRows = txnRows.filter(r => r.type === 'payment_made');
    const advancesLoansRows = txnRows.filter(r => ['advance_given', 'loan_given'].includes(r.type));
    const recoveryRows = txnRows.filter(r => ['loan_repayment', 'receivable_collected'].includes(r.type));

    return res.json({
      module: 'employees',
      from,
      to,
      branch_id: branchId || null,
      employee_id: employeeId || null,
      cards: [
        {
          key: 'salary_paid',
          title: 'Salary paid',
          amount: round2(salaryPaid),
          hint: 'Employee payments made in period',
          tone: 'red',
          extra: null,
          breakdown: {
            columns: employeeDetailCols,
            rows: salaryRows,
            total: round2(salaryPaid),
          },
        },
        {
          key: 'advances_loans_out',
          title: 'Advances & loans out',
          amount: round2(advancesLoansOut),
          hint: 'Advances and loans given to employees',
          tone: 'amber',
          extra: null,
          breakdown: {
            columns: employeeDetailCols,
            rows: advancesLoansRows,
            total: round2(advancesLoansOut),
          },
        },
        {
          key: 'recoveries_in',
          title: 'Recoveries',
          amount: round2(recoveriesIn),
          hint: 'Loan repayments and receivables collected',
          tone: 'green',
          extra: null,
          breakdown: {
            columns: employeeDetailCols,
            rows: recoveryRows,
            total: round2(recoveriesIn),
          },
        },
        {
          key: 'employee_payables',
          title: 'Employee payables',
          amount: payablesTotal,
          hint: 'Outstanding dues to employees (snapshot)',
          tone: 'blue',
          extra: `${payablesList.length} employee(s)`,
          breakdown: {
            columns: [
              { header: 'Employee', key: 'employee_name' },
              { header: 'Payable', key: 'payable', money: true, align: 'right' },
            ],
            rows: payablesList,
            total: payablesTotal,
          },
        },
      ],
      tabs: [
        {
          id: 'by_day',
          label: 'By day',
          columns: [
            { header: 'Date', key: 'date' },
            { header: 'Out', key: 'out', money: true, align: 'right' },
            { header: 'In', key: 'in', money: true, align: 'right' },
          ],
          rows: byDay,
        },
        {
          id: 'transactions',
          label: 'Transactions',
          columns: [
            { header: 'Date', key: 'date' },
            { header: 'Type', key: 'type' },
            { header: 'Employee', key: 'employee_name' },
            { header: 'Amount', key: 'amount', money: true, align: 'right' },
          ],
          rows: txnRows,
        },
        {
          id: 'payables',
          label: 'Payables',
          columns: [
            { header: 'Employee', key: 'employee_name' },
            { header: 'Phone', key: 'phone' },
            { header: 'Payable', key: 'payable', money: true, align: 'right' },
          ],
          rows: payablesList,
          totals: { __label: 'Total', payable: payablesTotal },
        },
      ],
      pdf: {
        title: 'Employees Summary Report',
        sections: [
          {
            heading: 'Payroll flow',
            rows: [
              { label: 'Salary paid', value: moneyStr(salaryPaid) },
              { label: 'Advances & loans out', value: moneyStr(advancesLoansOut) },
              { label: 'Recoveries in', value: moneyStr(recoveriesIn) },
              { label: 'Employee payables', value: moneyStr(payablesTotal) },
            ],
          },
        ],
        tables: [
          pdfTable(
            'Transactions',
            [
              { header: 'Date', key: 'date' },
              { header: 'Type', key: 'type' },
              { header: 'Employee', key: 'employee_name' },
              { header: 'Amount', key: 'amount', money: true, align: 'right' },
            ],
            txnRows,
          ),
        ],
      },
      meta: { generated_at: new Date().toISOString() },
    });
  } catch (error) {
    console.error('employeesSummary report error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.boardSummary = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { from, to } = defaultRange(req.query);
    const branchId = parseBranchId(req.query);
    const memberId = req.query.board_member_id ? parseInt(req.query.board_member_id, 10) : undefined;
    const { fromDate, toDate } = rangeDates(from, to);

    const txnWhere = { shop_id: shopId, date: { [Op.between]: [fromDate, toDate] } };
    if (memberId) txnWhere.board_member_id = memberId;
    const txns = await db.BoardMemberTransaction.findAll({
      where: txnWhere,
      include: [{ model: db.BoardMember, attributes: ['id', 'name', 'current_balance'] }],
      order: [['date', 'DESC']],
    });

    const memberSnapshotWhere = { shop_id: shopId };
    if (memberId) memberSnapshotWhere.id = memberId;
    const members = await db.BoardMember.findAll({
      where: memberSnapshotWhere,
      attributes: ['id', 'name', 'phone', 'current_balance'],
      order: [['name', 'ASC']],
    });

    let contributions = 0;
    let withdrawals = 0;
    const byMemberMap = new Map();
    const txnRows = [];
    const boardDetailCols = [
      { header: 'Date', key: 'date' },
      { header: 'Member', key: 'member_name' },
      { header: 'Amount', key: 'amount', money: true, align: 'right' },
      { header: 'Method', key: 'method' },
    ];

    for (const t of txns) {
      const amt = round2(t.amount);
      const memberName = t.BoardMember?.name || '—';
      txnRows.push({
        id: t.id,
        date: formatDateTime(t.date),
        type: t.type,
        board_member_id: t.board_member_id,
        member_name: memberName,
        amount: amt,
        method: t.method,
        open: openLink('board_member', t.board_member_id),
      });

      if (t.type === 'contribution') contributions += amt;
      else if (t.type === 'withdrawal') withdrawals += amt;

      const mid = t.board_member_id;
      const mrow = byMemberMap.get(mid) || {
        member_id: mid,
        member_name: memberName,
        contributions: 0,
        withdrawals: 0,
        net: 0,
      };
      if (t.type === 'contribution') mrow.contributions = round2(mrow.contributions + amt);
      else if (t.type === 'withdrawal') mrow.withdrawals = round2(mrow.withdrawals + amt);
      mrow.net = round2(mrow.contributions - mrow.withdrawals);
      byMemberMap.set(mid, mrow);
    }

    const memberBalancesTotal = round2(
      members.reduce((s, m) => s + parseFloat(m.current_balance || 0), 0),
    );
    const netCapital = round2(contributions - withdrawals);
    const byMember = [...byMemberMap.values()]
      .map(m => ({ ...m, board_member_id: m.member_id, open: openLink('board_member', m.member_id) }))
      .sort((a, b) => b.net - a.net);
    const balanceRows = members.map(m => ({
      board_member_id: m.id,
      member_name: m.name,
      phone: m.phone,
      balance: round2(m.current_balance),
      open: openLink('board_member', m.id),
    }));
    const contributionRows = txnRows.filter(r => r.type === 'contribution');
    const withdrawalRows = txnRows.filter(r => r.type === 'withdrawal');
    const netCapitalRows = [
      { label: 'Contributions', amount: round2(contributions) },
      { label: 'Withdrawals', amount: round2(withdrawals) },
    ];

    return res.json({
      module: 'board',
      from,
      to,
      branch_id: branchId || null,
      board_member_id: memberId || null,
      cards: [
        {
          key: 'contributions',
          title: 'Contributions',
          amount: round2(contributions),
          hint: 'Capital contributed in this period',
          tone: 'green',
          extra: null,
          breakdown: {
            columns: boardDetailCols,
            rows: contributionRows,
            total: round2(contributions),
          },
        },
        {
          key: 'withdrawals',
          title: 'Withdrawals',
          amount: round2(withdrawals),
          hint: 'Capital withdrawn in this period',
          tone: 'red',
          extra: null,
          breakdown: {
            columns: boardDetailCols,
            rows: withdrawalRows,
            total: round2(withdrawals),
          },
        },
        {
          key: 'net_capital',
          title: 'Net capital flow',
          amount: netCapital,
          hint: 'Contributions minus withdrawals in period',
          tone: 'blue',
          extra: null,
          breakdown: {
            columns: [
              { header: 'Item', key: 'label' },
              { header: 'Amount', key: 'amount', money: true, align: 'right' },
            ],
            rows: netCapitalRows,
            total: netCapital,
          },
        },
        {
          key: 'member_balances_total',
          title: 'Member balances',
          amount: memberBalancesTotal,
          hint: 'Total current board member balances',
          tone: 'violet',
          extra: `${members.length} member(s)`,
          breakdown: {
            columns: [
              { header: 'Member', key: 'member_name' },
              { header: 'Balance', key: 'balance', money: true, align: 'right' },
            ],
            rows: balanceRows,
            total: memberBalancesTotal,
          },
        },
      ],
      tabs: [
        {
          id: 'transactions',
          label: 'Transactions',
          columns: [
            { header: 'Date', key: 'date' },
            { header: 'Type', key: 'type' },
            { header: 'Member', key: 'member_name' },
            { header: 'Amount', key: 'amount', money: true, align: 'right' },
          ],
          rows: txnRows,
        },
        {
          id: 'by_member',
          label: 'By member',
          columns: [
            { header: 'Member', key: 'member_name' },
            { header: 'In', key: 'contributions', money: true, align: 'right' },
            { header: 'Out', key: 'withdrawals', money: true, align: 'right' },
            { header: 'Net', key: 'net', money: true, align: 'right' },
          ],
          rows: byMember,
        },
      ],
      pdf: {
        title: 'Board Summary Report',
        sections: [
          {
            heading: 'Capital flow',
            rows: [
              { label: 'Contributions', value: moneyStr(contributions) },
              { label: 'Withdrawals', value: moneyStr(withdrawals) },
              { label: 'Net capital flow', value: moneyStr(netCapital) },
              { label: 'Member balances total', value: moneyStr(memberBalancesTotal) },
            ],
          },
        ],
        tables: [
          pdfTable(
            'Transactions',
            [
              { header: 'Date', key: 'date' },
              { header: 'Type', key: 'type' },
              { header: 'Member', key: 'member_name' },
              { header: 'Amount', key: 'amount', money: true, align: 'right' },
            ],
            txnRows,
          ),
        ],
      },
      meta: { generated_at: new Date().toISOString() },
    });
  } catch (error) {
    console.error('boardSummary report error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Filter options for the "narrow to one X" dropdown on each report ────────
// Cheap id+name lookups, unscoped by date/branch/status — the picker itself
// shouldn't shrink when the date range narrows, and an inactive/terminated
// entity with historical activity in the period must still be selectable.
// Same shape and same no-status-filter precedent as
// utils/ledgerEntityFilter.js's listFilterOptions (used by the General
// Ledger), just split one per module so each is gated on that module's own
// permission instead of everything piggybacking on 'accounting:read'.
async function nameList(model, where, attributes, order, nameOf) {
  const rows = await model.findAll({ where, attributes, order, raw: true });
  return rows.map(r => ({ id: r.id, name: nameOf(r) }));
}

exports.salesFilterOptions = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const customers = await nameList(
      db.Customer, { shop_id: shopId }, ['id', 'name'], [['name', 'ASC']], c => c.name,
    );
    return res.json({ customers });
  } catch (error) {
    console.error('salesFilterOptions error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
exports.customersFilterOptions = exports.salesFilterOptions;

exports.purchasesFilterOptions = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const suppliers = await nameList(
      db.Supplier, { shop_id: shopId }, ['id', 'company_name', 'name'], [['company_name', 'ASC']],
      s => supplierName(s),
    );
    return res.json({ suppliers });
  } catch (error) {
    console.error('purchasesFilterOptions error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
exports.suppliersFilterOptions = exports.purchasesFilterOptions;

exports.inventoryFilterOptions = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const products = await nameList(
      db.Product, { shop_id: shopId }, ['id', 'name', 'sku'], [['name', 'ASC']],
      p => (p.sku ? `${p.name} (${p.sku})` : p.name),
    );
    return res.json({ products });
  } catch (error) {
    console.error('inventoryFilterOptions error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Category has no lookup table (Expense.category is free text) — the option
// list is whatever distinct values this shop has actually used, id === name
// so it round-trips straight into the `category` query param unchanged.
exports.expensesFilterOptions = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const rows = await db.Expense.findAll({
      where: { shop_id: shopId },
      attributes: [[db.sequelize.fn('DISTINCT', db.sequelize.col('category')), 'category']],
      order: [['category', 'ASC']],
      raw: true,
    });
    const categories = rows.map(r => r.category).filter(Boolean).map(c => ({ id: c, name: c }));
    return res.json({ categories });
  } catch (error) {
    console.error('expensesFilterOptions error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.employeesFilterOptions = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const employees = await nameList(
      db.Employee, { shop_id: shopId }, ['id', 'name'], [['name', 'ASC']], e => e.name,
    );
    return res.json({ employees });
  } catch (error) {
    console.error('employeesFilterOptions error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.boardFilterOptions = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const boardMembers = await nameList(
      db.BoardMember, { shop_id: shopId }, ['id', 'name'], [['name', 'ASC']], m => m.name,
    );
    return res.json({ board_members: boardMembers });
  } catch (error) {
    console.error('boardFilterOptions error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Production ────────────────────────────────────────────────────────────────
// Quantity-first, not money-first (mirrors inventorySummary's on-hand/low-stock
// cards, which already use a plain count/qty as the card headline number even
// though the frontend's generic FlowCard formats every card amount as
// currency — see the low_stock card above for the existing precedent).
exports.productionSummary = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { from, to } = defaultRange(req.query);
    const branchId = parseBranchId(req.query);
    const pitId = req.query.pit_id ? parseInt(req.query.pit_id, 10) : undefined;
    const benchId = req.query.bench_id ? parseInt(req.query.bench_id, 10) : undefined;
    const mineralId = req.query.mineral_id ? parseInt(req.query.mineral_id, 10) : undefined;

    const where = { shop_id: shopId, date: { [Op.between]: [from, to] } };
    if (branchId) where.mine_id = branchId;
    if (pitId) where.pit_id = pitId;
    if (benchId) where.bench_id = benchId;
    if (mineralId) where.mineral_id = mineralId;

    const entries = await db.ProductionEntry.findAll({
      where,
      include: [
        { model: db.Branch, as: 'Mine', attributes: ['id', 'name'] },
        { model: db.Pit, as: 'Pit', attributes: ['id', 'area_name'] },
        { model: db.Bench, as: 'Bench', attributes: ['id', 'bench_number'] },
        { model: db.Mineral, as: 'Mineral', attributes: ['id', 'name', 'unit', 'default_price'] },
        { model: db.Employee, as: 'Supervisor', attributes: ['id', 'name'] },
      ],
      order: [['date', 'DESC'], ['id', 'DESC']],
    });

    let totalQty = 0;
    let totalAmount = 0;
    const byUnit = new Map();
    const byMine = new Map();
    const byPit = new Map();
    const byBench = new Map();
    const byMineral = new Map();
    const entryRows = [];
    const supervisorNames = new Map();

    const bump = (map, key, label, qty) => {
      if (key == null) return;
      const row = map.get(key) || { key, label, quantity: 0 };
      row.quantity = round2(row.quantity + qty);
      map.set(key, row);
    };

    for (const e of entries) {
      const qty = parseFloat(e.quantity || 0);
      totalQty = round2(totalQty + qty);
      const price = parseFloat(e.Mineral?.default_price) || 0;
      const amount = round2(qty * price);
      totalAmount = round2(totalAmount + amount);

      const unitRow = byUnit.get(e.unit) || { unit: e.unit, quantity: 0 };
      unitRow.quantity = round2(unitRow.quantity + qty);
      byUnit.set(e.unit, unitRow);

      bump(byMine, e.mine_id, e.Mine?.name || `Mine #${e.mine_id}`, qty);
      bump(byPit, e.pit_id, e.Pit?.area_name || `Pit #${e.pit_id}`, qty);
      bump(byBench, e.bench_id, e.Bench?.bench_number || `Bench #${e.bench_id}`, qty);
      bump(byMineral, e.mineral_id, e.Mineral?.name || 'Unassigned', qty);
      if (e.supervisor_id) supervisorNames.set(e.supervisor_id, e.Supervisor?.name);

      entryRows.push({
        id: e.id,
        date: e.date,
        mine_name: e.Mine?.name || '—',
        pit_name: e.Pit?.area_name || '—',
        bench_number: e.Bench?.bench_number || '—',
        shift: e.shift || '—',
        mineral_name: e.Mineral?.name || '—',
        quantity: round2(qty),
        unit: e.unit,
        amount,
        supervisor_name: e.Supervisor?.name || '—',
        open: openLink('bench', e.bench_id),
      });
    }

    const unitBreakdownText = [...byUnit.values()].map(u => `${u.quantity.toLocaleString()} ${u.unit}`).join(', ') || null;

    // Personalized footer: only name a person when the report is actually
    // narrowed to exactly one of them — a mixed-scope report keeps the
    // generic blank signature (see reportSignature below).
    const singleSupervisorName = supervisorNames.size === 1 ? [...supervisorNames.values()][0] : null;
    const singleMineId = byMine.size === 1 ? [...byMine.keys()][0] : null;
    const singleMine = singleMineId
      ? await db.Branch.findOne({
        where: { id: singleMineId, shop_id: shopId },
        include: [{ model: db.Employee, as: 'Manager', attributes: ['id', 'name'] }],
      })
      : null;
    const reportSignature = {
      left: singleSupervisorName ? `Supervisor: ${singleSupervisorName}` : 'Prepared By',
      right: singleMine?.Manager?.name ? `Manager: ${singleMine.Manager.name}` : 'Received / Verified By',
    };

    const entryCols = [
      { header: 'Date', key: 'date' },
      { header: 'Mine', key: 'mine_name' },
      { header: 'Pit', key: 'pit_name' },
      { header: 'Bench', key: 'bench_number' },
      { header: 'Shift', key: 'shift' },
      { header: 'Mineral', key: 'mineral_name' },
      { header: 'Qty', key: 'quantity', align: 'right' },
      { header: 'Unit', key: 'unit' },
      { header: 'Amount', key: 'amount', align: 'right', money: true },
      { header: 'Supervisor', key: 'supervisor_name' },
    ];

    const qtyTotals = (map) => ({ __label: 'Total', quantity: round2([...map.values()].reduce((s, r) => s + r.quantity, 0)) });

    return res.json({
      module: 'production',
      from,
      to,
      branch_id: branchId || null,
      pit_id: pitId || null,
      bench_id: benchId || null,
      mineral_id: mineralId || null,
      cards: [
        {
          key: 'total_production',
          title: 'Total production',
          amount: totalQty,
          hint: 'Sum of all production entries in the selected period',
          tone: 'green',
          extra: unitBreakdownText,
          breakdown: { columns: entryCols, rows: entryRows, total: totalQty },
        },
        {
          key: 'entry_count',
          title: 'Production entries',
          amount: entryRows.length,
          hint: 'Number of production log entries in the selected period',
          tone: 'blue',
          extra: null,
          breakdown: { columns: entryCols, rows: entryRows, total: entryRows.length },
        },
        {
          key: 'total_amount',
          title: 'Total production value',
          amount: totalAmount,
          hint: 'Quantity × mineral default price, summed',
          tone: 'amber',
          extra: null,
          breakdown: { columns: entryCols, rows: entryRows, total: totalAmount },
        },
      ],
      tabs: [
        {
          id: 'entries',
          label: 'Production Entries',
          columns: entryCols,
          rows: entryRows,
          totals: { __label: 'Total', quantity: totalQty, amount: totalAmount },
        },
        {
          id: 'by_mine',
          label: 'Mine-wise Production',
          columns: [{ header: 'Mine', key: 'label' }, { header: 'Qty', key: 'quantity', align: 'right' }],
          rows: [...byMine.values()].sort((a, b) => b.quantity - a.quantity),
          totals: qtyTotals(byMine),
        },
        {
          id: 'by_pit',
          label: 'Pit-wise Production',
          columns: [{ header: 'Pit', key: 'label' }, { header: 'Qty', key: 'quantity', align: 'right' }],
          rows: [...byPit.values()].sort((a, b) => b.quantity - a.quantity),
          totals: qtyTotals(byPit),
        },
        {
          id: 'by_bench',
          label: 'Bench-wise Production',
          columns: [{ header: 'Bench', key: 'label' }, { header: 'Qty', key: 'quantity', align: 'right' }],
          rows: [...byBench.values()].sort((a, b) => b.quantity - a.quantity),
          totals: qtyTotals(byBench),
        },
        {
          id: 'by_mineral',
          label: 'Mineral Details',
          columns: [{ header: 'Mineral', key: 'label' }, { header: 'Qty', key: 'quantity', align: 'right' }],
          rows: [...byMineral.values()].sort((a, b) => b.quantity - a.quantity),
          totals: qtyTotals(byMineral),
        },
      ],
      pdf: {
        title: 'Production Minerals Report',
        signature: reportSignature,
        sections: [
          {
            heading: 'Totals',
            rows: [
              { label: 'Total production', value: unitBreakdownText || String(totalQty) },
              { label: 'Entries', value: String(entryRows.length) },
              { label: 'Total production value', value: String(totalAmount) },
            ],
          },
        ],
        tables: [pdfTable('Production entries', entryCols, entryRows, { __label: 'Total', quantity: totalQty, amount: totalAmount })],
      },
      meta: { generated_at: new Date().toISOString() },
    });
  } catch (error) {
    console.error('productionSummary error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.productionFilterOptions = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    // Mine is already covered by the standard branch filter every report
    // module gets — this "narrow to one X" filter is Mineral instead.
    const minerals = await nameList(db.Mineral, { shop_id: shopId }, ['id', 'name'], [['name', 'ASC']], m => m.name);
    return res.json({ minerals });
  } catch (error) {
    console.error('productionFilterOptions error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
