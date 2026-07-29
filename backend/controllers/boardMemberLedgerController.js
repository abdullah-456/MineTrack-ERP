'use strict';

const db = require('../models');
const { requireShopId } = require('../utils/shopScope');
const {
  personalDeposit,
  transferToCapital,
  transferFromCapital,
  round2,
} = require('../utils/bodAccounts');

async function loadMember(req, shopId, transaction) {
  return db.BoardMember.findOne({
    where: { id: req.params.id, shop_id: shopId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
}

const INVESTMENT_TYPES = new Set(['opening_balance', 'contribution', 'withdrawal', 'adjustment', 'transfer_to_capital']);
const CURRENT_TYPES = new Set([
  'personal_deposit', 'transfer_to_capital', 'transfer_from_capital',
  'current_payment', 'current_receipt',
]);

// ── POST /board-members/:id/personal-deposit ─────────────────────────────────
exports.recordPersonalDeposit = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const member = await loadMember(req, shopId, transaction);
    if (!member) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Board member not found' });
    }

    const { amount, method, date, notes } = req.body;
    const result = await personalDeposit(shopId, member, {
      amount, method, createdBy: req.user.id, date, notes,
    }, transaction);

    await transaction.commit();
    const fresh = await db.BoardMember.findByPk(member.id);
    return res.status(201).json({ transaction: result.transaction, member: fresh });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('recordPersonalDeposit error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── POST /board-members/:id/transfer ─────────────────────────────────────────
// direction: 'to_capital' | 'from_capital'
exports.recordTransfer = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const member = await loadMember(req, shopId, transaction);
    if (!member) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Board member not found' });
    }

    const {
      direction, amount, current_method, capital_method, capital_bank_account_id, date, notes,
    } = req.body;

    const args = {
      amount,
      currentMethod: current_method || 'cash',
      capitalMethod: capital_method || 'cash',
      capitalBankAccountId: capital_bank_account_id || null,
      createdBy: req.user.id,
      date,
      notes,
    };

    let result;
    if (direction === 'to_capital') {
      result = await transferToCapital(shopId, member, args, transaction);
    } else if (direction === 'from_capital') {
      result = await transferFromCapital(shopId, member, args, transaction);
    } else {
      await transaction.rollback();
      return res.status(400).json({ message: 'direction must be to_capital or from_capital' });
    }

    await transaction.commit();
    const fresh = await db.BoardMember.findByPk(member.id);
    return res.status(201).json({ transaction: result.transaction, member: fresh });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('recordBoardMemberTransfer error:', error);
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
    });
    if (!member) return res.status(404).json({ message: 'Board member not found' });

    // Deliberately does NOT provision chart-of-accounts rows. This used to call
    // ensureBodAccounts(member, null, null) — with no transaction, and with
    // every error swallowed — so a plain GET could create up to four accounts
    // and update the member row, and a failure part-way through left them
    // half-created with nothing surfaced. Accounts are provisioned on member
    // create/update and on any posting path (all of which run transactionally);
    // a read just reports what exists.
    const bucket = req.query.bucket || 'all'; // all | investment | current

    const txns = await db.BoardMemberTransaction.findAll({
      where: { board_member_id: member.id },
      include: [
        { model: db.User, as: 'CreatedBy', attributes: ['id', 'name'] },
        { model: db.BankAccount, attributes: ['id', 'account_name'] },
      ],
      order: [['date', 'ASC'], ['id', 'ASC']],
    });

    const filtered = txns.filter(t => {
      if (bucket === 'investment') {
        return t.account_bucket === 'investment'
          || (!t.account_bucket && INVESTMENT_TYPES.has(t.type));
      }
      if (bucket === 'current') {
        return CURRENT_TYPES.has(t.type)
          || (t.account_bucket && t.account_bucket.startsWith('current'));
      }
      return true;
    });

    let invRunning = 0;
    let cashRunning = 0;
    let bankRunning = 0;

    const history = filtered.map(t => {
      const amt = round2(t.amount);
      const type = t.type;
      let invDelta = 0;
      let cashDelta = 0;
      let bankDelta = 0;

      if (type === 'opening_balance' || type === 'contribution' || type === 'adjustment') {
        invDelta = amt;
      } else if (type === 'withdrawal') {
        invDelta = -amt;
      } else if (type === 'transfer_to_capital') {
        // Only the director's own money raises Investment; the company portion
        // just settles Due-from. The split is now stored on the row (see
        // bodAccounts.transferToCapital), so this no longer has to be inferred
        // from fund_origin — which tested only 'personal' and silently counted
        // the personal share of a 'mixed' transfer as zero.
        invDelta = round2(t.personal_amount);
        // Current always decreases
        if (t.method === 'bank') bankDelta = -amt;
        else cashDelta = -amt;
      } else if (type === 'transfer_from_capital') {
        if (t.method === 'bank') bankDelta = amt;
        else cashDelta = amt;
      } else if (type === 'personal_deposit' || type === 'current_receipt') {
        if (t.method === 'bank') bankDelta = amt;
        else cashDelta = amt;
      } else if (type === 'current_payment') {
        // Paying a company bill from the director's own funds is a capital
        // contribution for that portion — postPayFromBodCurrent raises
        // investment_balance by exactly this amount, so the trail must too.
        invDelta = round2(t.personal_amount);
        if (t.method === 'bank') bankDelta = -amt;
        else cashDelta = -amt;
      }

      invRunning = round2(invRunning + invDelta);
      cashRunning = round2(cashRunning + cashDelta);
      bankRunning = round2(bankRunning + bankDelta);

      return {
        id: t.id,
        date: t.date,
        type: t.type,
        amount: amt,
        method: t.method,
        bank_account_name: t.BankAccount?.account_name || null,
        notes: t.notes,
        created_by: t.CreatedBy?.name || null,
        account_bucket: t.account_bucket,
        fund_origin: t.fund_origin,
        counterpart_method: t.counterpart_method,
        running_investment: invRunning,
        running_current_cash: cashRunning,
        running_current_bank: bankRunning,
        running_balance: invRunning, // legacy
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
        investment_balance: round2(member.investment_balance),
        current_cash_balance: round2(member.current_cash_balance),
        current_bank_balance: round2(member.current_bank_balance),
        due_from_balance: round2(member.due_from_balance),
        current_balance: round2(member.investment_balance),
      },
      summary: {
        total_contributed: round2(totalContributed),
        total_withdrawn: round2(totalWithdrawn),
        investment_balance: round2(member.investment_balance),
        current_cash_balance: round2(member.current_cash_balance),
        current_bank_balance: round2(member.current_bank_balance),
        current_total: round2(parseFloat(member.current_cash_balance) + parseFloat(member.current_bank_balance)),
        due_from_balance: round2(member.due_from_balance),
        current_balance: round2(member.investment_balance),
      },
      transaction_history: history,
    });
  } catch (error) {
    console.error('getBoardMemberLedger error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
