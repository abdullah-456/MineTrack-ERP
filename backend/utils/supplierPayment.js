const db = require('../models');
const { assertCashAvailable, debitBankAccount } = require('./cashHelpers');
const { postVoucher } = require('./postVoucher');

// ── applySupplierStockPayment ───────────────────────────────────────────────
// Shared by inventoryController.receiveStock and productController.create (the
// two places stock can arrive tied to a supplier): creates the PurchaseInvoice,
// applies the Paid?/method payment panel (cash/bank/supplier_credit), updates
// Supplier.current_payable, records the SupplierTransaction, and posts the
// matching GL voucher (Dr Stock, Cr A/P + Cr Cash/Bank/Supplier Credit).
//
// `supplierRow` must already be fetched + row-locked (transaction.LOCK.UPDATE)
// by the caller, since both callers need the lock before this runs.
// Throws (with .statusCode) on validation failure — caller is expected to roll
// back its transaction and surface the message.
async function applySupplierStockPayment({
  shopId, supplierRow, totalAmount, paymentStatus, paidAmountInput, paymentMethod,
  notes, createdBy,
}, transaction) {
  const round = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
  totalAmount = round(totalAmount);

  let paidAmount = 0;
  if (paymentStatus === 'paid') {
    paidAmount = totalAmount;
  } else if (paymentStatus === 'partial') {
    paidAmount = parseFloat(paidAmountInput) || 0;
  }
  if (paidAmount < 0) paidAmount = 0;
  if (paidAmount > totalAmount) paidAmount = totalAmount;

  const method = ['cash', 'bank', 'supplier_credit'].includes(paymentMethod) ? paymentMethod : null;
  if (paidAmount > 0 && !method) {
    const err = new Error('payment_method is required when a payment is made');
    err.statusCode = 400;
    throw err;
  }

  if (paidAmount > 0) {
    if (method === 'supplier_credit') {
      const available = parseFloat(supplierRow.credit_balance || 0);
      if (available < paidAmount) {
        const err = new Error(`Insufficient supplier credit. Available: ${available.toFixed(2)}`);
        err.statusCode = 400;
        throw err;
      }
      await supplierRow.update({ credit_balance: round(available - paidAmount) }, { transaction });
    } else if (method === 'bank') {
      await debitBankAccount(shopId, paidAmount, transaction);
    } else if (method === 'cash') {
      await assertCashAvailable(shopId, paidAmount, transaction);
    }
  }

  const remainingAmount = round(totalAmount - paidAmount);
  const invStatus = remainingAmount <= 0 ? 'paid' : (paidAmount > 0 ? 'partial' : 'unpaid');

  const pinvCount = await db.PurchaseInvoice.count({ transaction });
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const invoice_number = `PINV-${dateStr}-${String(pinvCount + 1).padStart(4, '0')}`;

  const purchaseInvoice = await db.PurchaseInvoice.create({
    supplier_id: supplierRow.id,
    invoice_number,
    invoice_date: new Date(),
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    amount: totalAmount,
    status: invStatus,
  }, { transaction });

  await supplierRow.update({
    current_payable: round(parseFloat(supplierRow.current_payable || 0) + remainingAmount),
  }, { transaction });

  const supplierTransaction = await db.SupplierTransaction.create({
    shop_id: shopId,
    supplier_id: supplierRow.id,
    date: new Date(),
    type: 'stock_received',
    total_amount: totalAmount,
    paid_amount: paidAmount,
    remaining_amount: remainingAmount,
    method,
    stock_batch_id: purchaseInvoice.id,
    notes: notes?.trim() || null,
    created_by: createdBy,
  }, { transaction });

  const paidLine = method === 'supplier_credit'
    ? { accountCode: '05-SUPCREDIT', credit: paidAmount }
    : method === 'bank'
      ? { accountCode: '05-BANK', credit: paidAmount }
      : { accountCode: '05-CASH', credit: paidAmount };

  const voucher = await postVoucher(shopId, {
    type: 'journal',
    date: new Date(),
    narration: `Stock received from ${supplierRow.company_name}${notes?.trim() ? ' — ' + notes.trim() : ''}`,
    createdBy,
    lines: [
      { accountCode: '05-STOCK', debit: totalAmount },
      { accountCode: '03-AP', credit: remainingAmount },
      ...(paidAmount > 0 ? [paidLine] : []),
    ],
  }, transaction);

  return { purchaseInvoice, supplierTransaction, voucher };
}

// Stock received without a supplier (product opening stock, etc.):
// unpaid → Dr Stock / Cr Capital; paid or partial → Dr Stock / Cr Cash|Bank (+ Capital for remainder).
async function applyDirectStockPayment({
  shopId, totalAmount, paymentStatus, paidAmountInput, paymentMethod, notes, createdBy,
}, transaction) {
  const round = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
  totalAmount = round(totalAmount);
  if (!(totalAmount > 0)) {
    const err = new Error('Stock value must be greater than zero');
    err.statusCode = 400;
    throw err;
  }

  const status = paymentStatus || 'unpaid';
  let paidAmount = 0;
  if (status === 'paid') paidAmount = totalAmount;
  else if (status === 'partial') paidAmount = parseFloat(paidAmountInput) || 0;
  if (paidAmount < 0) paidAmount = 0;
  if (paidAmount > totalAmount) paidAmount = totalAmount;

  const remainingAmount = round(totalAmount - paidAmount);
  const method = ['cash', 'bank'].includes(paymentMethod) ? paymentMethod : null;

  if (paidAmount > 0) {
    if (!method) {
      const err = new Error('payment_method (cash or bank) is required when a payment is made');
      err.statusCode = 400;
      throw err;
    }
    if (method === 'bank') await debitBankAccount(shopId, paidAmount, transaction);
    else await assertCashAvailable(shopId, paidAmount, transaction);
  }

  await db.SupplierTransaction.create({
    shop_id: shopId,
    supplier_id: null,
    date: new Date(),
    type: 'stock_received',
    total_amount: totalAmount,
    paid_amount: paidAmount,
    remaining_amount: remainingAmount,
    method: paidAmount > 0 ? method : null,
    notes: notes?.trim() || null,
    created_by: createdBy,
  }, { transaction });

  const lines = [{ accountCode: '05-STOCK', debit: totalAmount }];
  if (paidAmount > 0) {
    lines.push({ accountCode: method === 'bank' ? '05-BANK' : '05-CASH', credit: paidAmount });
  }
  if (remainingAmount > 0) {
    lines.push({ accountCode: '01-CAPITAL', credit: remainingAmount });
  }

  const voucher = await postVoucher(shopId, {
    type: 'journal',
    date: new Date(),
    narration: notes?.trim() || 'Direct stock received',
    createdBy,
    lines,
  }, transaction);

  return { voucher };
}

module.exports = { applySupplierStockPayment, applyDirectStockPayment };
