const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { assertCashAvailable, debitBankAccount, bankAccountCode } = require('../utils/cashHelpers');
const { postVoucher } = require('../utils/postVoucher');

// ── POST /suppliers/:id/payments ─────────────────────────────────────────────
// Standalone payment to a supplier (not tied to a specific stock receipt).
// Overpayment doesn't error — the excess is banked as supplier credit_balance
// for future stock receipts (SUPPLIER_CREDIT method in receiveStock).
exports.recordPayment = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const supplier = await db.Supplier.findOne({
      where: { id: req.params.id, shop_id: shopId },
      transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!supplier) { await transaction.rollback(); return res.status(404).json({ message: 'Supplier not found' }); }

    const { amount, method, bank_account_id, board_member_id, date, notes } = req.body;
    const amt = parseFloat(amount);
    if (!(amt > 0)) { await transaction.rollback(); return res.status(400).json({ message: 'amount must be greater than 0' }); }
    const isBod = method === 'bod_cash' || method === 'bod_bank';
    if (!['cash', 'bank', 'bod_cash', 'bod_bank'].includes(method)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'method must be cash, bank, or BOD Current' });
    }
    if (isBod && !board_member_id) {
      await transaction.rollback();
      return res.status(400).json({ message: 'board_member_id is required for BOD Current' });
    }

    let bankAcc = null;
    const storedMethod = isBod ? (method === 'bod_bank' ? 'bank' : 'cash') : method;
    if (!isBod) {
      if (method === 'cash') {
        await assertCashAvailable(shopId, amt, transaction);
      } else {
        bankAcc = await debitBankAccount(shopId, amt, transaction, bank_account_id);
      }
    }

    const currentPayable = parseFloat(supplier.current_payable || 0);
    const currentCredit = parseFloat(supplier.credit_balance || 0);
    let newPayable, newCredit, allocatable;
    if (amt <= currentPayable) {
      newPayable = Math.round((currentPayable - amt) * 100) / 100;
      newCredit = currentCredit;
      allocatable = amt;
    } else {
      const excess = Math.round((amt - currentPayable) * 100) / 100;
      newPayable = 0;
      newCredit = Math.round((currentCredit + excess) * 100) / 100;
      allocatable = currentPayable;
    }
    await supplier.update({ current_payable: newPayable, credit_balance: newCredit }, { transaction });

    // Allocate the payable-reducing portion FIFO across open purchase invoices
    // (oldest first) so PurchaseInvoice.status / the aging report stay accurate
    // — mirrors the excess-rollover pattern in installmentController.recordPayment.
    const createdTxns = [];
    let remaining = allocatable;
    if (remaining > 0) {
      const openInvoices = await db.PurchaseInvoice.findAll({
        where: { supplier_id: supplier.id, status: { [Op.ne]: 'paid' } },
        order: [['invoice_date', 'ASC']],
        transaction, lock: transaction.LOCK.UPDATE,
      });
      const priorPaid = openInvoices.length
        ? await db.SupplierTransaction.findAll({
            where: { stock_batch_id: { [Op.in]: openInvoices.map(i => i.id) } },
            attributes: ['stock_batch_id', 'paid_amount'],
            transaction,
          })
        : [];
      const paidMap = {};
      priorPaid.forEach(p => { paidMap[p.stock_batch_id] = (paidMap[p.stock_batch_id] || 0) + parseFloat(p.paid_amount || 0); });

      for (const inv of openInvoices) {
        if (remaining <= 0) break;
        const outstanding = Math.round((parseFloat(inv.amount) - (paidMap[inv.id] || 0)) * 100) / 100;
        if (outstanding <= 0) continue;
        const applied = Math.min(remaining, outstanding);
        remaining = Math.round((remaining - applied) * 100) / 100;
        await inv.update({ status: outstanding - applied <= 0 ? 'paid' : 'partial' }, { transaction });
        createdTxns.push(await db.SupplierTransaction.create({
          shop_id: shopId, supplier_id: supplier.id,
          date: date ? new Date(date) : new Date(),
          type: 'payment_made', total_amount: applied, paid_amount: applied, remaining_amount: 0,
          method: storedMethod, stock_batch_id: inv.id, notes: notes?.trim() || `Payment made to ${supplier.company_name}`, created_by: req.user.id,
        }, { transaction }));
      }
    }
    // Whatever couldn't be tied to a specific open invoice (e.g. an opening
    // balance with no invoice row, or the pure-overpayment/credit portion)
    // still gets a ledger entry so the transaction total always reconciles.
    const unallocated = Math.round((amt - createdTxns.reduce((s, t) => s + parseFloat(t.paid_amount), 0)) * 100) / 100;
    if (unallocated > 0) {
      createdTxns.push(await db.SupplierTransaction.create({
        shop_id: shopId, supplier_id: supplier.id,
        date: date ? new Date(date) : new Date(),
        type: 'payment_made', total_amount: unallocated, paid_amount: unallocated, remaining_amount: 0,
        method: storedMethod, stock_batch_id: null, notes: notes?.trim() || `Payment made to ${supplier.company_name}`, created_by: req.user.id,
      }, { transaction }));
    }

    const excessAmt = Math.round((amt - allocatable) * 100) / 100;
    const debitLines = [
      ...(allocatable > 0 ? [{ accountCode: '03-AP', debit: allocatable }] : []),
      ...(excessAmt > 0 ? [{ accountCode: '05-SUPCREDIT', debit: excessAmt }] : []),
    ];
    if (isBod) {
      const { postPayFromBodCurrent } = require('../utils/bodAccounts');
      await postPayFromBodCurrent(shopId, {
        amount: amt,
        method,
        boardMemberId: board_member_id,
        debitLines,
        narration: `Payment made to ${supplier.company_name}`,
        createdBy: req.user.id,
        date,
        notes,
      }, transaction);
    } else {
      await postVoucher(shopId, {
        type: 'payment',
        date: date ? new Date(date) : new Date(),
        narration: `Payment made to ${supplier.company_name}`,
        createdBy: req.user.id,
        lines: [
          ...debitLines,
          { accountCode: method === 'bank' ? bankAccountCode(bankAcc) : '05-CASH', credit: amt },
        ],
      }, transaction);
    }

    await transaction.commit();
    const fresh = await db.Supplier.findByPk(supplier.id);
    return res.status(201).json({ transactions: createdTxns, supplier: fresh });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('recordSupplierPayment error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── POST /suppliers/:id/opening-balance ──────────────────────────────────────
// One-time migration entry — rejected if already recorded for this supplier.
exports.recordOpeningBalance = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const supplier = await db.Supplier.findOne({
      where: { id: req.params.id, shop_id: shopId },
      transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!supplier) { await transaction.rollback(); return res.status(404).json({ message: 'Supplier not found' }); }

    const existing = await db.SupplierTransaction.findOne({
      where: { supplier_id: supplier.id, type: 'opening_balance' },
      transaction,
    });
    if (existing) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Opening balance already recorded for this supplier' });
    }

    const { amount, date } = req.body;
    const amt = parseFloat(amount);
    if (!(amt >= 0)) { await transaction.rollback(); return res.status(400).json({ message: 'amount must be >= 0' }); }

    await supplier.update({
      current_payable: Math.round((parseFloat(supplier.current_payable || 0) + amt) * 100) / 100,
    }, { transaction });

    const txn = await db.SupplierTransaction.create({
      shop_id: shopId,
      supplier_id: supplier.id,
      date: date ? new Date(date) : new Date(),
      type: 'opening_balance',
      total_amount: amt,
      paid_amount: 0,
      remaining_amount: amt,
      method: null,
      stock_batch_id: null,
      notes: `Opening balance recorded for ${supplier.company_name}`,
      created_by: req.user.id,
    }, { transaction });

    if (amt > 0) {
      await postVoucher(shopId, {
        type: 'journal',
        date: date ? new Date(date) : new Date(),
        narration: `Opening balance recorded for ${supplier.company_name}`,
        createdBy: req.user.id,
        lines: [
          { accountCode: '01-CAPITAL', debit: amt },
          { accountCode: '03-AP', credit: amt },
        ],
      }, transaction);
    }

    await transaction.commit();
    const fresh = await db.Supplier.findByPk(supplier.id);
    return res.status(201).json({ transaction: txn, supplier: fresh });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('recordSupplierOpeningBalance error:', error);
    return res.status(500).json({ message: error.message || 'Internal server error' });
  }
};

// ── GET /suppliers/:id/ledger ─────────────────────────────────────────────────
exports.getLedger = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const supplier = await db.Supplier.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: [{ model: db.ProductSupplier, as: 'ProductSuppliers', include: [{ model: db.Product, attributes: ['id', 'name', 'sku'] }] }],
    });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const productsLinked = (supplier.ProductSuppliers || []).map(ps => ({
      product_id: ps.product_id,
      product_name: ps.Product?.name,
      sku: ps.Product?.sku,
      purchase_price: parseFloat(ps.purchase_price || 0),
      preferred_supplier: ps.preferred_supplier,
      status: ps.status,
    }));

    // ── Products received: reuse the StockMovement(ref_type='purchase', ref_id=supplier.id) join
    // already established by inventoryController.receiveStock ──────────────
    const movements = await db.StockMovement.findAll({
      where: { ref_type: 'purchase', ref_id: supplier.id },
      include: [
        { model: db.Product, attributes: ['id', 'name', 'sku'] },
        { model: db.Branch, attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
    });
    const productsReceived = movements.map(m => ({
      product_id: m.product_id,
      product_name: m.Product?.name,
      sku: m.Product?.sku,
      branch: m.Branch?.name,
      quantity: m.quantity,
      date: m.created_at,
    }));
    const productCount = new Set(movements.map(m => m.product_id)).size;

    // ── Transaction history with running balance ─────────────────────────────
    const txns = await db.SupplierTransaction.findAll({
      where: { supplier_id: supplier.id },
      include: [{ model: db.User, as: 'CreatedBy', attributes: ['id', 'name'] }],
      order: [['date', 'ASC'], ['id', 'ASC']],
    });
    // running_balance mirrors current_payable's actual clamp-at-zero/overflow-to-
    // credit behaviour (see recordPayment/receiveStock) rather than a naive
    // cumulative sum, so it lands on the same number current_payable holds today.
    let running = 0;
    const history = txns.map(t => {
      if (t.type === 'payment_made') {
        const amt = parseFloat(t.paid_amount || 0);
        running = Math.round(Math.max(0, running - amt) * 100) / 100;
      } else {
        running = Math.round((running + parseFloat(t.remaining_amount || 0)) * 100) / 100;
      }
      return {
        id: t.id,
        date: t.date,
        type: t.type,
        total_amount: parseFloat(t.total_amount || 0),
        paid_amount: parseFloat(t.paid_amount || 0),
        remaining_amount: parseFloat(t.remaining_amount || 0),
        method: t.method,
        notes: t.notes,
        created_by: t.CreatedBy?.name || null,
        running_balance: running,
      };
    }).reverse();

    const totalPaid = txns.reduce((s, t) => s + parseFloat(t.paid_amount || 0), 0);
    const totalStockValue = txns
      .filter(t => t.type === 'stock_received')
      .reduce((s, t) => s + parseFloat(t.total_amount || 0), 0);

    // ── Aging buckets from open purchase invoices ─────────────────────────────
    const invoices = await db.PurchaseInvoice.findAll({
      where: { supplier_id: supplier.id, status: { [Op.ne]: 'paid' } },
    });
    const paidByBatch = {};
    txns.forEach(t => {
      if (t.stock_batch_id) paidByBatch[t.stock_batch_id] = (paidByBatch[t.stock_batch_id] || 0) + parseFloat(t.paid_amount || 0);
    });
    const now = new Date();
    const aging = { bucket_0_30: 0, bucket_31_60: 0, bucket_60_plus: 0 };
    invoices.forEach(inv => {
      const paid = paidByBatch[inv.id] || 0;
      const outstanding = Math.max(0, parseFloat(inv.amount || 0) - paid);
      if (outstanding <= 0) return;
      const days = Math.floor((now - new Date(inv.invoice_date)) / (1000 * 60 * 60 * 24));
      if (days <= 30) aging.bucket_0_30 += outstanding;
      else if (days <= 60) aging.bucket_31_60 += outstanding;
      else aging.bucket_60_plus += outstanding;
    });
    Object.keys(aging).forEach(k => { aging[k] = Math.round(aging[k] * 100) / 100; });

    return res.json({
      supplier: {
        id: supplier.id,
        company_name: supplier.company_name,
        supplier_code: supplier.supplier_code,
      },
      summary: {
        total_stock_value: Math.round(totalStockValue * 100) / 100,
        product_count: productCount,
        total_paid: Math.round(totalPaid * 100) / 100,
        current_payable: parseFloat(supplier.current_payable || 0),
        credit_balance: parseFloat(supplier.credit_balance || 0),
      },
      products_received: productsReceived,
      products_linked: productsLinked,
      transaction_history: history,
      aging,
    });
  } catch (error) {
    console.error('getSupplierLedger error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
