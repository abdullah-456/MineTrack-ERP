const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { requestOrAllowDelete } = require('../utils/deletionRequest');
const { createAccount, getOrCreateDirectorsParent } = require('../utils/chartOfAccounts');
const { postVoucher } = require('../utils/postVoucher');
const { creditBankAccount, creditCashPayment, bankAccountCode, paymentAccountCode } = require('../utils/cashHelpers');
const { assertCnicAvailable } = require('../utils/cnic');

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
// Every board member gets a liability sub-account under the global
// "03-BOD" ("Directors & Investors") parent in the COA.
exports.create = async (req, res) => {
  const shopId = requireShopId(req, res);
  if (!shopId) return;

  const {
    name, phone, cnic, address,
    opening_cash_amount, opening_bank_amount, opening_bank_account_id, opening_cash_account_id,
  } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: 'Name is required' });

  const cashAmt = Math.round((parseFloat(opening_cash_amount) || 0) * 100) / 100;
  const bankAmt = Math.round((parseFloat(opening_bank_amount) || 0) * 100) / 100;
  if (cashAmt < 0 || bankAmt < 0) return res.status(400).json({ message: 'Opening balance amounts cannot be negative' });
  if (bankAmt > 0 && !opening_bank_account_id) {
    return res.status(400).json({ message: 'Select which bank account received the bank portion of the opening balance' });
  }

  const transaction = await db.sequelize.transaction();
  try {
    const preparedCnic = await assertCnicAvailable(shopId, cnic, {}, transaction);
    const parent = await getOrCreateDirectorsParent(shopId, req.user.id, transaction);
    const account = await createAccount({
      shopId,
      accountName: `${name.trim()} — Director Account`,
      accountType: 'liability',
      parent,
      createdBy: req.user.id,
    }, transaction);

    const totalOpening = Math.round((cashAmt + bankAmt) * 100) / 100;

    const member = await db.BoardMember.create({
      shop_id: shopId,
      name: name.trim(),
      phone: phone || null,
      cnic: preparedCnic.cnic,
      cnic_normalized: preparedCnic.cnic_normalized,
      address: address || null,
      opening_balance: totalOpening,
      current_balance: totalOpening,
      chart_of_account_id: account.id,
    }, { transaction });

    if (totalOpening > 0) {
      let bankAcc = null;
      let cashAcc = null;
      if (bankAmt > 0) {
        bankAcc = await creditBankAccount(shopId, bankAmt, transaction, opening_bank_account_id);
      }
      if (cashAmt > 0 && opening_cash_account_id) {
        cashAcc = await creditCashPayment(shopId, cashAmt, transaction, opening_cash_account_id);
      }

      const lines = [];
      if (cashAmt > 0) lines.push({ accountCode: paymentAccountCode('cash', cashAcc), debit: cashAmt });
      if (bankAmt > 0) lines.push({ accountCode: bankAccountCode(bankAcc), debit: bankAmt });
      lines.push({ accountCode: account.account_code, credit: totalOpening });

      await postVoucher(shopId, {
        type: 'receipt',
        date: new Date(),
        narration: `Opening balance received from ${member.name}`,
        createdBy: req.user.id,
        branchId: null,
        lines,
      }, transaction);

      if (cashAmt > 0) {
        await db.BoardMemberTransaction.create({
          shop_id: shopId, board_member_id: member.id, date: new Date(),
          type: 'opening_balance', amount: cashAmt, method: 'cash',
          bank_account_id: cashAcc?.id || null,
          notes: cashAcc ? `Opening balance — ${cashAcc.account_name}` : 'Opening balance — Cash in Hand',
          created_by: req.user.id,
        }, { transaction });
      }
      if (bankAmt > 0) {
        await db.BoardMemberTransaction.create({
          shop_id: shopId, board_member_id: member.id, date: new Date(),
          type: 'opening_balance', amount: bankAmt, method: 'bank', bank_account_id: bankAcc?.id || null,
          notes: `Opening balance — ${bankAcc?.account_name || 'bank'}`, created_by: req.user.id,
        }, { transaction });
      }
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

    const fields = ['name', 'phone', 'address'];
    fields.forEach(f => { if (req.body[f] !== undefined) member[f] = req.body[f]; });

    if (req.body.cnic !== undefined) {
      const preparedCnic = await assertCnicAvailable(shopId, req.body.cnic, { boardMemberId: member.id }, transaction);
      member.cnic = preparedCnic.cnic;
      member.cnic_normalized = preparedCnic.cnic_normalized;
    }

    await member.save({ transaction });

    if (req.body.name !== undefined && member.chart_of_account_id) {
      await db.ChartOfAccount.update(
        { account_name: `${member.name} — Director Account` },
        { where: { id: member.chart_of_account_id }, transaction },
      );
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

    await member.destroy();

    if (member.chart_of_account_id) {
      await db.ChartOfAccount.update({ is_active: false }, { where: { id: member.chart_of_account_id } });
    }

    return res.json({ message: 'Board member removed' });
  } catch (error) {
    console.error('removeBoardMember error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
