const db = require('../models');
const { requireShopId } = require('../utils/shopScope');
const { creditBankAccount } = require('../utils/cashHelpers');
const { postVoucher } = require('../utils/postVoucher');

// Sign convention mirrors employeeLedgerController's signFor map: +1 increases
// what the customer owes, -1 reduces it — matches Customer.current_balance's
// existing meaning (positive = customer owes the shop).
const SIGN_FOR = {
  sale_charge: 1,
  installment_charge: 1,
  opening_balance: 1,
  adjustment: 1,
  payment_received: -1,
  return_credit: -1,
};

// ── POST /customers/:id/payments ─────────────────────────────────────────────
// Standalone payment received from a customer. Applies against any outstanding
// balance (credit sales / installment principal), and — when the amount exceeds
// what's owed — records the excess as an advance, leaving the customer with a
// credit (negative current_balance) that future sales draw down automatically.
exports.recordPayment = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const customer = await db.Customer.findOne({
      where: { id: req.params.id, shop_id: shopId },
      transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!customer) { await transaction.rollback(); return res.status(404).json({ message: 'Customer not found' }); }

    const { amount, method, date, notes } = req.body;
    const amt = parseFloat(amount);
    if (!(amt > 0)) { await transaction.rollback(); return res.status(400).json({ message: 'amount must be greater than 0' }); }
    if (!['cash', 'bank'].includes(method)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'method must be cash or bank' });
    }

    const outstanding = parseFloat(customer.current_balance || 0);
    const newBalance = Math.round((outstanding - amt) * 100) / 100;
    const advancePortion = newBalance < 0 ? Math.round(Math.min(amt, -newBalance) * 100) / 100 : 0;

    // Money is coming IN, so credit (increase) the bank balance for bank payments.
    if (method === 'bank') await creditBankAccount(shopId, amt, transaction);
    // Cash coming in needs no floor guard.

    await customer.update({ current_balance: newBalance }, { transaction });

    const defaultPaymentNote = advancePortion > 0
      ? `Payment received from ${customer.name} including advance credit of Rs. ${advancePortion}`
      : `Payment received from ${customer.name}`;
    const finalNotes = notes?.trim() ? `${notes.trim()} — ${defaultPaymentNote}` : defaultPaymentNote;

    const txn = await db.CustomerTransaction.create({
      shop_id: shopId, customer_id: customer.id,
      date: date ? new Date(date) : new Date(),
      type: 'payment_received', amount: amt, method,
      notes: finalNotes, created_by: req.user.id,
    }, { transaction });

    await postVoucher(shopId, {
      type: 'receipt',
      date: date ? new Date(date) : new Date(),
      narration: advancePortion > 0
        ? `Payment received from ${customer.name} including advance credit`
        : `Payment received from ${customer.name}`,
      createdBy: req.user.id,
      lines: [
        { accountCode: method === 'bank' ? '05-BANK' : '05-CASH', debit: amt },
        { accountCode: '05-AR', credit: amt },
      ],
    }, transaction);

    await transaction.commit();
    const fresh = await db.Customer.findByPk(customer.id);
    return res.status(201).json({ transaction: txn, customer: fresh, advance: advancePortion });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('recordCustomerPayment error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── GET /customers/:id/ledger ────────────────────────────────────────────────
exports.getLedger = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const customer = await db.Customer.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const sales = await db.Sale.findAll({
      where: { customer_id: customer.id, shop_id: shopId },
      include: [
        { model: db.SaleItem, as: 'SaleItems', include: [{ model: db.Product, attributes: ['id', 'name', 'sku'] }] },
        { model: db.Branch, attributes: ['id', 'name'] },
      ],
      order: [['sale_date', 'DESC']],
      limit: 50,
    });

    const txns = await db.CustomerTransaction.findAll({
      where: { customer_id: customer.id },
      include: [{ model: db.User, as: 'CreatedBy', attributes: ['id', 'name'] }],
      order: [['date', 'ASC'], ['id', 'ASC']],
    });

    let running = 0;
    const history = txns.map(t => {
      const delta = (SIGN_FOR[t.type] || 0) * parseFloat(t.amount || 0);
      running = Math.round((running + delta) * 100) / 100;
      return {
        id: t.id,
        date: t.date,
        type: t.type,
        amount: parseFloat(t.amount || 0),
        method: t.method,
        notes: t.notes,
        related_sale_id: t.related_sale_id,
        created_by: t.CreatedBy?.name || null,
        running_balance: running,
      };
    }).reverse();

    const totalCharged = txns
      .filter(t => t.type === 'sale_charge' || t.type === 'installment_charge')
      .reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const totalPaid = txns
      .filter(t => t.type === 'payment_received' || t.type === 'return_credit')
      .reduce((s, t) => s + parseFloat(t.amount || 0), 0);

    return res.json({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        cnic: customer.cnic,
      },
      summary: {
        total_charged: Math.round(totalCharged * 100) / 100,
        total_paid: Math.round(totalPaid * 100) / 100,
        current_balance: parseFloat(customer.current_balance || 0),
        credit_limit: parseFloat(customer.credit_limit || 0),
      },
      sales_history: sales,
      transaction_history: history,
    });
  } catch (error) {
    console.error('getCustomerLedger error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
