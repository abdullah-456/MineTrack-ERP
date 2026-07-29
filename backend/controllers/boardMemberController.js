const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { requestOrAllowDelete } = require('../utils/deletionRequest');
const { createAccount, getOrCreateDirectorsParent } = require('../utils/chartOfAccounts');
const { assertCnicAvailable } = require('../utils/cnic');
const { ensureBodAccounts, composeWalletName } = require('../utils/bodAccounts');

exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${req.query.search}%` } },
        { phone: { [Op.iLike]: `%${req.query.search}%` } },
        { cnic: { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    const members = await db.BoardMember.findAll({
      where,
      order: [['created_at', 'DESC']],
    });
    return res.json({ members });
  } catch (error) {
    console.error('listBoardMembers error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const member = await db.BoardMember.findOne({
      where: { id: req.params.id, shop_id: shopId },
    });
    if (!member) return res.status(404).json({ message: 'Board member not found' });
    return res.json({ member });
  } catch (error) {
    console.error('getBoardMember error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Board of Directors are business-wide (shop-level) entities.
// Create asks for Investment (single memo claim — no Cash/Bank movement) and
// Current Cash / Current Bank (director wallets — also no Capital cash movement).
exports.create = async (req, res) => {
  const shopId = requireShopId(req, res);
  if (!shopId) return;

  const {
    name, phone, cnic, address,
    investment_amount, current_cash_amount, current_bank_amount,
    current_cash_name, current_bank_name,
  } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: 'Name is required' });

  const invAmt = Math.round((parseFloat(investment_amount) || 0) * 100) / 100;
  const curCash = Math.round((parseFloat(current_cash_amount) || 0) * 100) / 100;
  const curBank = Math.round((parseFloat(current_bank_amount) || 0) * 100) / 100;
  if (invAmt < 0 || curCash < 0 || curBank < 0) {
    return res.status(400).json({ message: 'Opening amounts cannot be negative' });
  }
  // Only the prefix is user-supplied — "Current Cash" / "Current Bank" is appended here.
  const cashName = composeWalletName(current_cash_name, 'cash', name);
  const bankName = composeWalletName(current_bank_name, 'bank', name);

  const transaction = await db.sequelize.transaction();
  try {
    const preparedCnic = await assertCnicAvailable(shopId, cnic, {}, transaction);
    const parent = await getOrCreateDirectorsParent(shopId, req.user.id, transaction);
    const account = await createAccount({
      shopId,
      accountName: `${name.trim()} — Investment`,
      // Equity, not liability — director capital belongs in equity, and all four
      // financial statements branch on account_type. Must stay in step with
      // ensureBodAccounts in utils/bodAccounts.js, which creates the same
      // account for members that predate this path.
      accountType: 'equity',
      parent,
      createdBy: req.user.id,
    }, transaction);

    let member = await db.BoardMember.create({
      shop_id: shopId,
      name: name.trim(),
      phone: phone || null,
      cnic: preparedCnic.cnic,
      cnic_normalized: preparedCnic.cnic_normalized,
      address: address || null,
      opening_balance: invAmt,
      investment_balance: invAmt,
      current_balance: invAmt,
      current_cash_balance: curCash,
      current_bank_balance: curBank,
      current_cash_name: cashName,
      current_bank_name: bankName,
      due_from_balance: 0,
      chart_of_account_id: account.id,
    }, { transaction });

    member = await ensureBodAccounts(member, req.user.id, transaction);

    // Investment opening: simple log only — does NOT touch Cash in Hand / Bank.
    // Investment liability on the books grows when money actually enters Capital
    // (manual receive, or Current → Capital transfer of personal funds).
    if (invAmt > 0) {
      await db.BoardMemberTransaction.create({
        shop_id: shopId,
        board_member_id: member.id,
        date: new Date(),
        type: 'opening_balance',
        amount: invAmt,
        method: null,
        notes: 'Opening Investment (memo — no Cash/Bank movement)',
        created_by: req.user.id,
        account_bucket: 'investment',
      }, { transaction });
    }

    // Current wallets opening: director-held only — no Capital cash, no Due-from.
    if (curCash > 0) {
      await db.BoardMemberTransaction.create({
        shop_id: shopId,
        board_member_id: member.id,
        date: new Date(),
        type: 'personal_deposit',
        amount: curCash,
        method: 'cash',
        notes: 'Opening Current Cash',
        created_by: req.user.id,
        account_bucket: 'current_cash',
        fund_origin: 'personal',
      }, { transaction });
    }
    if (curBank > 0) {
      await db.BoardMemberTransaction.create({
        shop_id: shopId,
        board_member_id: member.id,
        date: new Date(),
        type: 'personal_deposit',
        amount: curBank,
        method: 'bank',
        notes: 'Opening Current Bank',
        created_by: req.user.id,
        account_bucket: 'current_bank',
        fund_origin: 'personal',
      }, { transaction });
    }

    await transaction.commit();
    const fresh = await db.BoardMember.findByPk(member.id);
    return res.status(201).json({ member: fresh, account });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('createBoardMember error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'CNIC already registered for another person' });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const member = await db.BoardMember.findOne({
      where: { id: req.params.id, shop_id: shopId },
      transaction,
    });
    if (!member) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Board member not found' });
    }

    const fields = ['name', 'phone', 'address', 'current_cash_name', 'current_bank_name'];
    fields.forEach(f => {
      if (req.body[f] === undefined) return;
      if (f === 'current_cash_name' || f === 'current_bank_name') {
        const kind = f === 'current_bank_name' ? 'bank' : 'cash';
        const memberName = req.body.name !== undefined ? req.body.name : member.name;
        member[f] = composeWalletName(req.body[f], kind, memberName);
      } else {
        member[f] = req.body[f];
      }
    });

    if (req.body.cnic !== undefined) {
      const preparedCnic = await assertCnicAvailable(shopId, req.body.cnic, { boardMemberId: member.id }, transaction);
      member.cnic = preparedCnic.cnic;
      member.cnic_normalized = preparedCnic.cnic_normalized;
    }

    await member.save({ transaction });

    if (
      req.body.name !== undefined
      || req.body.current_cash_name !== undefined
      || req.body.current_bank_name !== undefined
    ) {
      await ensureBodAccounts(member, req.user.id, transaction);
    }

    await transaction.commit();
    const fresh = await db.BoardMember.findByPk(member.id);
    return res.json({ member: fresh });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('updateBoardMember error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'CNIC already registered for another person' });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const member = await db.BoardMember.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!member) return res.status(404).json({ message: 'Board member not found' });

    const { pending } = await requestOrAllowDelete({
      req, res, shopId, module: 'board_directors', entityId: member.id, entityLabel: member.name,
    });
    if (pending) return;

    const transaction = await db.sequelize.transaction();
    try {
      // Child rows block DELETE via FK — remove ledger history first.
      await db.BoardMemberTransaction.destroy({
        where: { board_member_id: member.id, shop_id: shopId },
        transaction,
      });

      const coaIds = [
        member.chart_of_account_id,
        member.due_from_coa_id,
        member.current_cash_coa_id,
        member.current_bank_coa_id,
      ].filter(Boolean);

      await member.destroy({ transaction });

      if (coaIds.length) {
        await db.ChartOfAccount.update(
          { is_active: false },
          { where: { id: { [Op.in]: coaIds } }, transaction },
        );
      }

      await transaction.commit();
    } catch (inner) {
      if (!transaction.finished) await transaction.rollback();
      throw inner;
    }

    return res.json({ message: 'Board member removed' });
  } catch (error) {
    console.error('removeBoardMember error:', error);
    return res.status(500).json({ message: error.message || 'Internal server error' });
  }
};
