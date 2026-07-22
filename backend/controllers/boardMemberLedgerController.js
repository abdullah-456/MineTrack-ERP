const db = require('../models');
const { requireShopId } = require('../utils/shopScope');
const { debitBankAccount, debitCashPayment, creditBankAccount, creditCashPayment, bankAccountCode, paymentAccountCode } = require('../utils/cashHelpers');
const { postVoucher } = require('../utils/postVoucher');

// +1 = company owes this member more (contribution in, opening balance);
// -1 = member has drawn against it (withdrawal out) — matches
// BoardMember.current_balance's meaning (positive = company owes them).
const SIGN_FOR = {
  opening_balance: 1,
  contribution: 1,
  adjustment: 1,
  withdrawal: -1,
};

async function loadMember(req, shopId, transaction) {
  return db.BoardMember.findOne({
    where: { id: req.params.id, shop_id: shopId },
    transaction, lock: transaction.LOCK.UPDATE,
  });
}

// ── POST /board-members/:id/receive ──────────────────────────────────────────
// A capital contribution from the director/investor — money coming INTO the
// business. Increases what the company owes them (current_balance) and
// posts against their own dedicated ledger sub-account, not a shared bucket.
exports.recordReceive = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const member = await loadMember(req, shopId, transaction);
    if (!member || !member.chart_of_account_id) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Board member not found' });
    }

    const { amount, method, bank_account_id, date, notes } = req.body;
    const amt = Math.round((parseFloat(amount) || 0) * 100) / 100;
    if (!(amt > 0)) { await transaction.rollback(); return res.status(400).json({ message: 'amount must be greater than 0' }); }
    if (!['cash', 'bank'].includes(method)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'method must be cash or bank' });
    }

    let bankAcc = null;
    let cashAcc = null;
    if (method === 'bank') {
      bankAcc = await creditBankAccount(shopId, amt, transaction, bank_account_id);
    } else if (bank_account_id) {
      cashAcc = await creditCashPayment(shopId, amt, transaction, bank_account_id);
    }

    await member.update({
      current_balance: Math.round((parseFloat(member.current_balance || 0) + amt) * 100) / 100,
    }, { transaction });

    const txn = await db.BoardMemberTransaction.create({
      shop_id: shopId, board_member_id: member.id,
      date: date ? new Date(date) : new Date(),
      type: 'contribution', amount: amt, method, bank_account_id: bankAcc?.id || cashAcc?.id || null,
      notes: notes?.trim() || null, created_by: req.user.id,
    }, { transaction });

    const memberAccountCode = (await db.ChartOfAccount.findByPk(member.chart_of_account_id, { transaction })).account_code;
    await postVoucher(shopId, {
      type: 'receipt',
      date: date ? new Date(date) : new Date(),
      narration: `Contribution received from ${member.name}${notes?.trim() ? ' — Note: ' + notes.trim() : ''}`,
      createdBy: req.user.id,
      branchId: member.branch_id,
      lines: [
        { accountCode: method === 'bank' ? bankAccountCode(bankAcc) : paymentAccountCode('cash', cashAcc), debit: amt },
        { accountCode: memberAccountCode, credit: amt },
      ],
    }, transaction);

    await transaction.commit();
    const fresh = await db.BoardMember.findByPk(member.id);
    return res.status(201).json({ transaction: txn, member: fresh });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('recordBoardMemberReceive error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── POST /board-members/:id/send ─────────────────────────────────────────────
// A withdrawal/drawing paid OUT to the director/investor. Decreases what the
// company owes them. No floor check against their own balance — a director
// overdrawing is a business decision, not something the system blocks — but
// the underlying cash/bank account still can't go negative.
exports.recordSend = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const member = await loadMember(req, shopId, transaction);
    if (!member || !member.chart_of_account_id) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Board member not found' });
    }

    const { amount, method, bank_account_id, date, notes } = req.body;
    const amt = Math.round((parseFloat(amount) || 0) * 100) / 100;
    if (!(amt > 0)) { await transaction.rollback(); return res.status(400).json({ message: 'amount must be greater than 0' }); }
    if (!['cash', 'bank'].includes(method)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'method must be cash or bank' });
    }

    let bankAcc = null;
    let cashAcc = null;
    if (method === 'bank') {
      bankAcc = await debitBankAccount(shopId, amt, transaction, bank_account_id);
    } else {
      cashAcc = await debitCashPayment(shopId, amt, transaction, bank_account_id);
    }

    await member.update({
      current_balance: Math.round((parseFloat(member.current_balance || 0) - amt) * 100) / 100,
    }, { transaction });

    const txn = await db.BoardMemberTransaction.create({
      shop_id: shopId, board_member_id: member.id,
      date: date ? new Date(date) : new Date(),
      type: 'withdrawal', amount: amt, method, bank_account_id: bankAcc?.id || cashAcc?.id || null,
      notes: notes?.trim() || null, created_by: req.user.id,
    }, { transaction });

    const memberAccountCode = (await db.ChartOfAccount.findByPk(member.chart_of_account_id, { transaction })).account_code;
    await postVoucher(shopId, {
      type: 'payment',
      date: date ? new Date(date) : new Date(),
      narration: `Withdrawal paid to ${member.name}${notes?.trim() ? ' — Note: ' + notes.trim() : ''}`,
      createdBy: req.user.id,
      branchId: member.branch_id,
      lines: [
        { accountCode: memberAccountCode, debit: amt },
        { accountCode: method === 'bank' ? bankAccountCode(bankAcc) : paymentAccountCode('cash', cashAcc), credit: amt },
      ],
    }, transaction);

    await transaction.commit();
    const fresh = await db.BoardMember.findByPk(member.id);
    return res.status(201).json({ transaction: txn, member: fresh });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('recordBoardMemberSend error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── GET /board-members/:id/ledger ────────────────────────────────────────────
exports.getLedger = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const member = await db.BoardMember.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: [{ model: db.Branch, attributes: ['id', 'name'] }],
    });
    if (!member) return res.status(404).json({ message: 'Board member not found' });

    const txns = await db.BoardMemberTransaction.findAll({
      where: { board_member_id: member.id },
      include: [
        { model: db.User, as: 'CreatedBy', attributes: ['id', 'name'] },
        { model: db.BankAccount, attributes: ['id', 'account_name'] },
      ],
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
        bank_account_name: t.BankAccount?.account_name || null,
        notes: t.notes,
        created_by: t.CreatedBy?.name || null,
        running_balance: running,
      };
    }).reverse();

    const totalContributed = txns
      .filter(t => t.type === 'contribution' || t.type === 'opening_balance')
      .reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const totalWithdrawn = txns
      .filter(t => t.type === 'withdrawal')
      .reduce((s, t) => s + parseFloat(t.amount || 0), 0);

    return res.json({
      member: {
        id: member.id,
        name: member.name,
        phone: member.phone,
        cnic: member.cnic,
        branch_id: member.branch_id,
        branch_name: member.Branch?.name || null,
      },
      summary: {
        total_contributed: Math.round(totalContributed * 100) / 100,
        total_withdrawn: Math.round(totalWithdrawn * 100) / 100,
        current_balance: parseFloat(member.current_balance || 0),
      },
      transaction_history: history,
    });
  } catch (error) {
    console.error('getBoardMemberLedger error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
