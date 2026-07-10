const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');

const planIncludes = [
  { model: db.Sale, attributes: ['id', 'invoice_number', 'total', 'sale_date'] },
  { model: db.Customer, attributes: ['id', 'name', 'phone', 'cnic'] },
  {
    model: db.InstallmentSchedule, foreignKey: 'plan_id',
    include: [{ model: db.InstallmentPayment, foreignKey: 'schedule_id' }],
    order: [['installment_no', 'ASC']],
  },
];

function computeSchedule(plan_id, total_amount, down_payment, markup_rate, num, frequency, start_date) {
  const principal = (parseFloat(total_amount) - parseFloat(down_payment || 0));
  const markup = parseFloat(markup_rate || 0) / 100;
  const totalWithMarkup = principal * (1 + markup);
  const perInstallment = Math.round((totalWithMarkup / num) * 100) / 100;

  const rows = [];
  for (let i = 1; i <= num; i++) {
    const d = new Date(start_date);
    if (frequency === 'monthly') d.setMonth(d.getMonth() + (i - 1));
    else d.setDate(d.getDate() + (i - 1) * 7);

    rows.push({
      plan_id,
      installment_no: i,
      due_date: d,
      due_amount: i === num
        ? Math.round((totalWithMarkup - perInstallment * (num - 1)) * 100) / 100
        : perInstallment,
      status: 'pending',
      late_fee: 0,
    });
  }
  return rows;
}

// ── List all plans ─────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = {};
    if (req.query.status && req.query.status !== 'all') where.status = req.query.status;
    if (req.query.customer_id) where.customer_id = req.query.customer_id;
    if (req.query.search) {
      // Search by customer name or invoice_number via join — handled in include
    }

    const plans = await db.InstallmentPlan.findAll({
      where,
      include: [
        { model: db.Sale, where: { shop_id: shopId }, attributes: ['id', 'invoice_number', 'total', 'sale_date'] },
        { model: db.Customer, attributes: ['id', 'name', 'phone'] },
        { model: db.InstallmentSchedule, foreignKey: 'plan_id', attributes: ['id', 'status', 'due_date', 'due_amount'] },
      ],
      order: [['created_at', 'DESC']],
    });

    const now = new Date();
    const enriched = plans.map(p => {
      const schedules = p.InstallmentSchedules || [];
      const paidCount = schedules.filter(s => s.status === 'paid').length;
      const overdueCount = schedules.filter(s => s.status !== 'paid' && new Date(s.due_date) < now).length;
      const remaining = schedules.filter(s => s.status !== 'paid').reduce((sum, s) => sum + parseFloat(s.due_amount), 0);
      return {
        ...p.toJSON(),
        paid_count: paidCount,
        total_count: schedules.length,
        overdue_count: overdueCount,
        remaining_amount: Math.round(remaining * 100) / 100,
      };
    });

    return res.json({ plans: enriched });
  } catch (error) {
    console.error('listInstallments error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Get single plan with full schedule ─────────────────────
exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const plan = await db.InstallmentPlan.findOne({
      where: { id: req.params.id },
      include: [
        { model: db.Sale, where: { shop_id: shopId }, attributes: ['id', 'invoice_number', 'total', 'sale_date'] },
        { model: db.Customer, attributes: ['id', 'name', 'phone', 'cnic', 'address'] },
        {
          model: db.InstallmentSchedule, foreignKey: 'plan_id',
          include: [{ model: db.InstallmentPayment, foreignKey: 'schedule_id' }],
        },
      ],
    });

    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    // Mark overdue
    const now = new Date();
    const updated = [];
    for (const s of plan.InstallmentSchedules || []) {
      if (s.status === 'pending' && new Date(s.due_date) < now) {
        await s.update({ status: 'overdue' });
        updated.push(s.id);
      }
    }

    const fresh = updated.length > 0
      ? await db.InstallmentPlan.findOne({
          where: { id: req.params.id },
          include: [
            { model: db.Sale, where: { shop_id: shopId }, attributes: ['id', 'invoice_number', 'total', 'sale_date'] },
            { model: db.Customer, attributes: ['id', 'name', 'phone', 'cnic', 'address'] },
            {
              model: db.InstallmentSchedule, foreignKey: 'plan_id',
              include: [{ model: db.InstallmentPayment, foreignKey: 'schedule_id' }],
            },
          ],
        })
      : plan;

    return res.json({ plan: fresh });
  } catch (error) {
    console.error('getInstallment error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Create plan (called from sale creation transaction, or standalone) ──
exports.createPlan = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const {
      sale_id, customer_id, total_amount, down_payment,
      number_of_installments, frequency, markup_rate, start_date,
    } = req.body;

    if (!sale_id || !customer_id || !total_amount || !number_of_installments || !start_date) {
      await transaction.rollback();
      return res.status(400).json({ message: 'sale_id, customer_id, total_amount, number_of_installments, start_date are required' });
    }

    // Verify sale belongs to shop
    const sale = await db.Sale.findOne({ where: { id: sale_id, shop_id: shopId }, transaction });
    if (!sale) { await transaction.rollback(); return res.status(404).json({ message: 'Sale not found' }); }

    const plan = await db.InstallmentPlan.create({
      sale_id,
      customer_id,
      total_amount: parseFloat(total_amount),
      down_payment: parseFloat(down_payment || 0),
      number_of_installments: parseInt(number_of_installments, 10),
      frequency: frequency || 'monthly',
      markup_rate: parseFloat(markup_rate || 0),
      start_date: new Date(start_date),
      status: 'active',
    }, { transaction });

    const scheduleRows = computeSchedule(
      plan.id, total_amount, down_payment, markup_rate,
      parseInt(number_of_installments, 10), frequency || 'monthly', start_date,
    );
    await db.InstallmentSchedule.bulkCreate(scheduleRows, { transaction });

    await transaction.commit();

    const full = await db.InstallmentPlan.findByPk(plan.id, { include: planIncludes });
    return res.status(201).json({ plan: full });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('createPlan error:', error);
    return res.status(500).json({ message: error.message || 'Internal server error' });
  }
};

// ── Record payment on a schedule slot ─────────────────────
exports.recordPayment = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const { id: planId, scheduleId } = req.params;
    const { amount_paid, method, payment_date, late_fee_charged } = req.body;

    if (!method) {
      await transaction.rollback();
      return res.status(400).json({ message: 'method is required' });
    }
    if (!(parseFloat(amount_paid) > 0)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'amount_paid must be greater than 0' });
    }

    // Verify plan belongs to shop
    const plan = await db.InstallmentPlan.findOne({
      where: { id: planId },
      include: [{ model: db.Sale, where: { shop_id: shopId } }],
      transaction,
    });
    if (!plan) { await transaction.rollback(); return res.status(404).json({ message: 'Plan not found' }); }

    const schedule = await db.InstallmentSchedule.findOne({
      where: { id: scheduleId, plan_id: planId },
      transaction,
      lock: transaction.LOCK.UPDATE, // prevent double-payment race on the same slot
    });
    if (!schedule) { await transaction.rollback(); return res.status(404).json({ message: 'Schedule entry not found' }); }
    if (schedule.status === 'paid') { await transaction.rollback(); return res.status(400).json({ message: 'Already paid' }); }

    // Record payment
    await db.InstallmentPayment.create({
      schedule_id: scheduleId,
      amount_paid: parseFloat(amount_paid),
      payment_date: payment_date ? new Date(payment_date) : new Date(),
      method: method,
      late_fee_charged: parseFloat(late_fee_charged || 0),
    }, { transaction });

    const paidVal = parseFloat(amount_paid);
    const currentDue = parseFloat(schedule.due_amount);
    
    if (paidVal >= currentDue) {
      await schedule.update({ status: 'paid', due_amount: 0, late_fee: parseFloat(late_fee_charged || 0) }, { transaction });
      let excess = paidVal - currentDue;
      
      if (excess > 0) {
        const nextSchedules = await db.InstallmentSchedule.findAll({
          where: { plan_id: planId, status: { [Op.ne]: 'paid' } },
          order: [['installment_no', 'ASC']],
          transaction,
        });

        for (const ns of nextSchedules) {
          if (excess <= 0) break;
          const nsDue = parseFloat(ns.due_amount);
          if (excess >= nsDue) {
            excess -= nsDue;
            await ns.update({ due_amount: 0, status: 'paid' }, { transaction });
          } else {
            await ns.update({ due_amount: Math.round((nsDue - excess) * 100) / 100 }, { transaction });
            excess = 0;
          }
        }
      }
    } else {
      await schedule.update({ due_amount: Math.round((currentDue - paidVal) * 100) / 100 }, { transaction });
    }

    // Check if all schedules paid → close plan
    const remaining = await db.InstallmentSchedule.count({
      where: { plan_id: planId, status: { [Op.ne]: 'paid' }, due_amount: { [Op.gt]: 0 } },
      transaction,
    });
    if (remaining === 0) {
      await plan.update({ status: 'closed' }, { transaction });
    }

    // Update customer balance. Only the principal+markup portion reduces debt —
    // a late fee is income, not a reduction of what the customer owed.
    const lateFee = parseFloat(late_fee_charged || 0);
    const debtReduction = Math.max(0, paidVal - lateFee);
    const customer = await db.Customer.findByPk(plan.customer_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (customer) {
      const newBal = Math.max(0, parseFloat(customer.current_balance || 0) - debtReduction);
      await customer.update({ current_balance: newBal }, { transaction });
    }

    await transaction.commit();

    const fresh = await db.InstallmentPlan.findByPk(planId, { include: planIncludes });
    return res.json({ plan: fresh, message: 'Payment recorded successfully' });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('recordPayment error:', error);
    return res.status(500).json({ message: error.message || 'Internal server error' });
  }
};

// ── Stats for dashboard ────────────────────────────────────
exports.stats = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const now = new Date();

    // Get all active plans for this shop via Sales join
    const plans = await db.InstallmentPlan.findAll({
      where: { status: { [Op.in]: ['active'] } },
      include: [
        { model: db.Sale, where: { shop_id: shopId }, attributes: ['id', 'invoice_number'] },
        { model: db.Customer, attributes: ['id', 'name', 'phone'] },
        { model: db.InstallmentSchedule, foreignKey: 'plan_id', attributes: ['id', 'status', 'due_date', 'due_amount'] },
      ],
    });

    let overdueCount = 0;
    let overdueAmount = 0;
    const overdueItems = [];

    for (const plan of plans) {
      const schedules = plan.InstallmentSchedules || [];
      const overdue = schedules.filter(s => s.status !== 'paid' && new Date(s.due_date) < now);
      if (overdue.length > 0) {
        overdueCount += overdue.length;
        const planOverdue = overdue.reduce((sum, s) => sum + parseFloat(s.due_amount), 0);
        overdueAmount += planOverdue;
        overdueItems.push({
          plan_id: plan.id,
          customer_name: plan.Customer?.name,
          customer_phone: plan.Customer?.phone,
          invoice_number: plan.Sale?.invoice_number,
          overdue_slots: overdue.length,
          overdue_amount: Math.round(planOverdue * 100) / 100,
          earliest_due: overdue.sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0]?.due_date,
        });
      }
    }

    return res.json({
      overdue_count: overdueCount,
      overdue_amount: Math.round(overdueAmount * 100) / 100,
      active_plans: plans.length,
      overdue_items: overdueItems.slice(0, 10),
    });
  } catch (error) {
    console.error('installmentStats error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
