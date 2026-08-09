const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { postVoucher } = require('../utils/postVoucher');
const {
  debitBankAccount, debitCashPayment, creditBankAccount, creditCashPayment, paymentAccountCode,
} = require('../utils/cashHelpers');
const {
  createAccount, getOrCreateGainOnDisposalAccount,
  getOrCreateLossOnDisposalAccount, getOrCreateAccumulatedDepreciationAccount,
} = require('../utils/chartOfAccounts');
const { computeDepreciation } = require('../utils/assetDepreciation');
const { catchUpAssetDepreciation, catchUpOneAsset } = require('../utils/assetDepreciationRun');
const { requestOrAllowDelete } = require('../utils/deletionRequest');
const { guardWritableDates, handleFiscalYearError } = require('../utils/fiscalYear');

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Attaches live-computed depreciation/book value to a plain asset row.
// Depreciation is never stored — see utils/assetDepreciation.js.
function withComputed(asset) {
  const plain = asset.toJSON ? asset.toJSON() : asset;
  const asOf = plain.status === 'disposed' && plain.disposal_date ? plain.disposal_date : new Date();
  const dep = computeDepreciation({
    purchaseCost: plain.purchase_cost,
    salvageValue: plain.salvage_value,
    depreciationPercentage: plain.depreciation_percentage,
    usefulLifeYears: plain.useful_life_years,
    purchaseDate: plain.purchase_date,
    asOfDate: asOf,
  });
  return { ...plain, ...dep };
}

// ── GET /api/assets ──────────────────────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    await catchUpAssetDepreciation(shopId, req.user.id);

    const where = { shop_id: shopId, status: { [Op.ne]: 'deleted' } };
    if (req.query.status && req.query.status !== 'all') where.status = req.query.status;
    if (req.query.category && req.query.category !== 'all') where.category = req.query.category;
    if (req.query.branch_id) where.branch_id = parseInt(req.query.branch_id, 10);
    if (req.query.is_paid === 'true') where.is_paid = true;
    if (req.query.is_paid === 'false') where.is_paid = false;
    if (req.query.search) {
      where[Op.or] = [
        { asset_name: { [Op.iLike]: `%${req.query.search}%` } },
        { asset_code: { [Op.iLike]: `%${req.query.search}%` } },
        { category: { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    const assets = await db.Asset.findAll({
      where,
      include: [
        { model: db.Branch, attributes: ['id', 'name'] },
        { model: db.Voucher, as: 'Voucher', attributes: ['id', 'voucher_number'] },
      ],
      order: [['purchase_date', 'DESC'], ['id', 'DESC']],
    });

    return res.json({ assets: assets.map(withComputed) });
  } catch (error) {
    console.error('listAssets error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/assets/categories ───────────────────────────────────────────────
exports.listCategories = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const rows = await db.Asset.findAll({
      where: { shop_id: shopId },
      attributes: [[db.sequelize.fn('DISTINCT', db.sequelize.col('category')), 'category']],
      raw: true,
    });
    return res.json({ categories: rows.map(r => r.category).filter(Boolean) });
  } catch (error) {
    console.error('listAssetCategories error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/assets/:id ──────────────────────────────────────────────────────
exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    await catchUpAssetDepreciation(shopId, req.user.id);

    const asset = await db.Asset.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: [
        { model: db.Branch, attributes: ['id', 'name'] },
        { model: db.Voucher, as: 'Voucher', attributes: ['id', 'voucher_number'] },
        { model: db.Voucher, as: 'DisposalVoucher', attributes: ['id', 'voucher_number'] },
        { model: db.ChartOfAccount, as: 'FixedAssetAccount', attributes: ['id', 'account_code', 'account_name'] },
      ],
    });
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    return res.json({ asset: withComputed(asset) });
  } catch (error) {
    console.error('getAsset error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/assets ─────────────────────────────────────────────────────────
exports.create = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const {
      asset_name, category, branch_id, purchase_date, purchase_cost, salvage_value,
      useful_life_years, depreciation_percentage, is_paid, paid_via, bank_account_id,
      insurance_provider, insurance_policy_number, insurance_premium, insurance_expiry, notes,
    } = req.body;

    if (!asset_name?.trim()) { await transaction.rollback(); return res.status(400).json({ message: 'Asset name is required' }); }
    if (!category?.trim()) { await transaction.rollback(); return res.status(400).json({ message: 'Category is required' }); }
    if (!purchase_date) { await transaction.rollback(); return res.status(400).json({ message: 'Purchase date is required' }); }

    const cost = parseFloat(purchase_cost);
    if (!cost || cost <= 0) { await transaction.rollback(); return res.status(400).json({ message: 'Purchase cost must be greater than zero' }); }
    const usefulLife = parseFloat(useful_life_years);
    if (!usefulLife || usefulLife <= 0) { await transaction.rollback(); return res.status(400).json({ message: 'Useful life must be greater than zero' }); }
    const salvage = parseFloat(salvage_value) || 0;
    if (salvage < 0 || salvage > cost) { await transaction.rollback(); return res.status(400).json({ message: 'Salvage value must be between 0 and the purchase cost' }); }
    const depPct = depreciation_percentage !== undefined && depreciation_percentage !== ''
      ? parseFloat(depreciation_percentage) : null;
    if (depPct !== null && (depPct < 0 || depPct > 100)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Depreciation % must be between 0 and 100' });
    }

    const paid = is_paid !== false;
    if (paid && !['cash', 'bank'].includes(paid_via)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'paid_via must be cash or bank for a paid asset' });
    }

    let branchId = null;
    if (branch_id) {
      const branch = await db.Branch.findOne({ where: { id: branch_id, shop_id: shopId }, transaction });
      if (!branch) { await transaction.rollback(); return res.status(404).json({ message: 'Branch not found' }); }
      branchId = branch.id;
    }

    const date = new Date(purchase_date);
    if (paid) await guardWritableDates(shopId, date, transaction);

    let bankAcc = null;
    let voucher = null;
    let fixedAssetAccount = null;

    if (paid) {
      const ltAssetParent = await db.ChartOfAccount.findOne({
        where: { account_code: '04-LT-ASSET' }, transaction,
      });
      fixedAssetAccount = await createAccount({
        shopId, accountName: asset_name.trim(), accountType: 'asset',
        parent: ltAssetParent || null, createdBy: req.user.id,
      }, transaction);

      bankAcc = paid_via === 'cash'
        ? await debitCashPayment(shopId, cost, transaction, bank_account_id)
        : await debitBankAccount(shopId, cost, transaction, bank_account_id);

      voucher = await postVoucher(shopId, {
        type: 'payment',
        date,
        narration: `Asset purchase — ${asset_name.trim()}`,
        createdBy: req.user.id,
        branchId,
        lines: [
          { accountCode: fixedAssetAccount.account_code, debit: cost },
          { accountCode: paymentAccountCode(paid_via, bankAcc), credit: cost },
        ],
      }, transaction);
    }

    const asset = await db.Asset.create({
      shop_id: shopId,
      branch_id: branchId,
      asset_name: asset_name.trim(),
      category: category.trim(),
      purchase_date: date,
      purchase_cost: cost,
      salvage_value: salvage,
      useful_life_years: usefulLife,
      depreciation_percentage: depPct,
      is_paid: paid,
      paid_via: paid ? paid_via : null,
      bank_account_id: paid ? (bankAcc?.id || null) : null,
      fixed_asset_account_id: paid ? fixedAssetAccount.id : null,
      voucher_id: paid ? voucher.id : null,
      insurance_provider: insurance_provider || null,
      insurance_policy_number: insurance_policy_number || null,
      insurance_premium: insurance_premium ? parseFloat(insurance_premium) : null,
      insurance_expiry: insurance_expiry || null,
      notes: notes || null,
      created_by: req.user.id,
    }, { transaction });

    asset.asset_code = `AST-${String(asset.id).padStart(6, '0')}`;
    await asset.save({ transaction });

    await transaction.commit();
    return res.status(201).json({ asset });
  } catch (error) {
    await transaction.rollback();
    const handled = handleFiscalYearError(res, error);
    if (handled) return handled;
    console.error('createAsset error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── PUT /api/assets/:id ──────────────────────────────────────────────────────
// Mirrors expenseController.update: financial edits never mutate a posted
// voucher — they reverse the old one (if any) and post a fresh one.
exports.update = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const asset = await db.Asset.findOne({ where: { id: req.params.id, shop_id: shopId }, transaction });
    if (!asset) { await transaction.rollback(); return res.status(404).json({ message: 'Asset not found' }); }
    if (asset.status !== 'active') { await transaction.rollback(); return res.status(400).json({ message: 'Only active assets can be edited' }); }

    const {
      asset_name, category, branch_id, purchase_date, purchase_cost, salvage_value,
      useful_life_years, depreciation_percentage, is_paid, paid_via, bank_account_id,
      insurance_provider, insurance_policy_number, insurance_premium, insurance_expiry, notes,
    } = req.body;

    if (asset_name !== undefined && !asset_name.trim()) { await transaction.rollback(); return res.status(400).json({ message: 'Asset name is required' }); }
    if (category !== undefined && !category.trim()) { await transaction.rollback(); return res.status(400).json({ message: 'Category is required' }); }
    if (depreciation_percentage !== undefined && depreciation_percentage !== '' && depreciation_percentage !== null) {
      const p = parseFloat(depreciation_percentage);
      if (p < 0 || p > 100) { await transaction.rollback(); return res.status(400).json({ message: 'Depreciation % must be between 0 and 100' }); }
    }

    let branchId = asset.branch_id;
    if (branch_id !== undefined) {
      if (branch_id) {
        const branch = await db.Branch.findOne({ where: { id: branch_id, shop_id: shopId }, transaction });
        if (!branch) { await transaction.rollback(); return res.status(404).json({ message: 'Branch not found' }); }
        branchId = branch.id;
      } else {
        branchId = null;
      }
    }

    const newCost = purchase_cost !== undefined ? parseFloat(purchase_cost) : parseFloat(asset.purchase_cost);
    if (!newCost || newCost <= 0) { await transaction.rollback(); return res.status(400).json({ message: 'Purchase cost must be greater than zero' }); }
    const newDate = purchase_date !== undefined ? new Date(purchase_date) : new Date(asset.purchase_date);
    const newIsPaid = is_paid !== undefined ? !!is_paid : asset.is_paid;
    const newPaidVia = newIsPaid ? (paid_via !== undefined ? paid_via : asset.paid_via) : null;
    if (newIsPaid && !['cash', 'bank'].includes(newPaidVia)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'paid_via must be cash or bank for a paid asset' });
    }
    const newBankAccountId = newIsPaid ? (bank_account_id !== undefined ? bank_account_id : asset.bank_account_id) : null;

    const financialChanged = newIsPaid !== asset.is_paid
      || newCost !== parseFloat(asset.purchase_cost)
      || newPaidVia !== asset.paid_via
      || Number(newBankAccountId || 0) !== Number(asset.bank_account_id || 0)
      || newDate.getTime() !== new Date(asset.purchase_date).getTime();

    let fixedAssetAccountId = asset.fixed_asset_account_id;
    let voucherId = asset.voucher_id;
    let bankAccountIdToStore = asset.bank_account_id;

    let reusableFixedAssetAccountId = null;

    if (financialChanged) {
      await guardWritableDates(shopId, [asset.purchase_date, newDate], transaction);

      // Undo the old paid state, if any.
      if (asset.is_paid && asset.fixed_asset_account_id) {
        const oldAmt = parseFloat(asset.purchase_cost);
        let refundAcc = null;
        if (asset.paid_via === 'bank') {
          refundAcc = await creditBankAccount(shopId, oldAmt, transaction, asset.bank_account_id);
        } else if (asset.bank_account_id) {
          refundAcc = await creditCashPayment(shopId, oldAmt, transaction, asset.bank_account_id);
        }
        const oldAccount = await db.ChartOfAccount.findByPk(asset.fixed_asset_account_id, { transaction });
        await postVoucher(shopId, {
          type: 'journal',
          date: new Date(),
          narration: `Reversal: Asset #${asset.id} updated`,
          createdBy: req.user.id,
          branchId: asset.branch_id,
          lines: [
            { accountCode: oldAccount.account_code, credit: oldAmt },
            { accountCode: paymentAccountCode(asset.paid_via, refundAcc), debit: oldAmt },
          ],
        }, transaction);
        // The account's balance is now zero. Remembered separately (not
        // reassigned to fixedAssetAccountId, which must go null if the asset
        // ends up unpaid) so the apply-new step below can reuse it instead of
        // creating an orphaned replacement on every financial edit.
        reusableFixedAssetAccountId = asset.fixed_asset_account_id;
        fixedAssetAccountId = null;
        voucherId = null;
        bankAccountIdToStore = null;
      }

      // Apply the new paid state, if any.
      if (newIsPaid) {
        let fixedAssetAccount = reusableFixedAssetAccountId
          ? await db.ChartOfAccount.findByPk(reusableFixedAssetAccountId, { transaction })
          : null;
        if (!fixedAssetAccount) {
          const ltAssetParent = await db.ChartOfAccount.findOne({
            where: { account_code: '04-LT-ASSET' }, transaction,
          });
          fixedAssetAccount = await createAccount({
            shopId, accountName: (asset_name || asset.asset_name).trim(), accountType: 'asset',
            parent: ltAssetParent || null, createdBy: req.user.id,
          }, transaction);
        }

        const newBankAcc = newPaidVia === 'cash'
          ? await debitCashPayment(shopId, newCost, transaction, newBankAccountId)
          : await debitBankAccount(shopId, newCost, transaction, newBankAccountId);

        const voucher = await postVoucher(shopId, {
          type: 'payment',
          date: newDate,
          narration: `Asset purchase — ${(asset_name || asset.asset_name).trim()} (updated)`,
          createdBy: req.user.id,
          branchId,
          lines: [
            { accountCode: fixedAssetAccount.account_code, debit: newCost },
            { accountCode: paymentAccountCode(newPaidVia, newBankAcc), credit: newCost },
          ],
        }, transaction);

        fixedAssetAccountId = fixedAssetAccount.id;
        voucherId = voucher.id;
        bankAccountIdToStore = newBankAcc?.id || null;
      }
    }

    if (asset_name !== undefined) asset.asset_name = asset_name.trim();
    if (category !== undefined) asset.category = category.trim();
    asset.branch_id = branchId;
    asset.purchase_date = newDate;
    asset.purchase_cost = newCost;
    if (salvage_value !== undefined) asset.salvage_value = parseFloat(salvage_value) || 0;
    if (useful_life_years !== undefined) asset.useful_life_years = parseFloat(useful_life_years);
    if (depreciation_percentage !== undefined) {
      asset.depreciation_percentage = depreciation_percentage === '' || depreciation_percentage === null
        ? null : parseFloat(depreciation_percentage);
    }
    asset.is_paid = newIsPaid;
    asset.paid_via = newIsPaid ? newPaidVia : null;
    asset.bank_account_id = bankAccountIdToStore;
    asset.fixed_asset_account_id = fixedAssetAccountId;
    asset.voucher_id = voucherId;
    if (insurance_provider !== undefined) asset.insurance_provider = insurance_provider || null;
    if (insurance_policy_number !== undefined) asset.insurance_policy_number = insurance_policy_number || null;
    if (insurance_premium !== undefined) asset.insurance_premium = insurance_premium ? parseFloat(insurance_premium) : null;
    if (insurance_expiry !== undefined) asset.insurance_expiry = insurance_expiry || null;
    if (notes !== undefined) asset.notes = notes || null;

    await asset.save({ transaction });
    await transaction.commit();
    return res.json({ asset });
  } catch (error) {
    await transaction.rollback();
    const handled = handleFiscalYearError(res, error);
    if (handled) return handled;
    console.error('updateAsset error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// Reverses an asset's GL effect (if any) and marks it deleted. Shared by the
// direct-delete path below (admin) and deletionRequestController.approve.
async function performVoidAsset(asset, shopId, userId, transaction) {
  if (asset.is_paid && asset.fixed_asset_account_id) {
    const amt = parseFloat(asset.purchase_cost);
    let refundAcc = null;
    if (asset.paid_via === 'bank') {
      refundAcc = await creditBankAccount(shopId, amt, transaction, asset.bank_account_id);
    } else if (asset.bank_account_id) {
      refundAcc = await creditCashPayment(shopId, amt, transaction, asset.bank_account_id);
    }
    const account = await db.ChartOfAccount.findByPk(asset.fixed_asset_account_id, { transaction });
    await postVoucher(shopId, {
      type: 'journal',
      date: new Date(),
      narration: `Reversal: Asset #${asset.id} deleted`,
      createdBy: userId,
      branchId: asset.branch_id,
      lines: [
        { accountCode: account.account_code, credit: amt },
        { accountCode: paymentAccountCode(asset.paid_via, refundAcc), debit: amt },
      ],
    }, transaction);
  }
  asset.status = 'deleted';
  await asset.save({ transaction });
  return asset;
}
exports.performVoidAsset = performVoidAsset;

// ── DELETE /api/assets/:id ────────────────────────────────────────────────────
exports.remove = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const asset = await db.Asset.findOne({ where: { id: req.params.id, shop_id: shopId }, transaction });
    if (!asset) { await transaction.rollback(); return res.status(404).json({ message: 'Asset not found' }); }
    if (asset.status !== 'active') { await transaction.rollback(); return res.status(400).json({ message: 'Only active assets can be deleted' }); }

    if (asset.is_paid) await guardWritableDates(shopId, asset.purchase_date, transaction);

    const { pending } = await requestOrAllowDelete({
      req, res, shopId, module: 'assets', entityId: asset.id,
      entityLabel: `${asset.asset_name} — Rs. ${asset.purchase_cost}`, transaction,
    });
    if (pending) { await transaction.commit(); return; }

    await performVoidAsset(asset, shopId, req.user.id, transaction);

    await transaction.commit();
    return res.json({ message: 'Asset deleted', asset });
  } catch (error) {
    await transaction.rollback();
    console.error('removeAsset error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── POST /api/assets/:id/dispose ─────────────────────────────────────────────
// Depreciation is now posted year-by-year as it comes due (see
// assetDepreciationRun.js), so disposal first catches this one asset up to
// the disposal date, then removes it: the accumulated-depreciation contra
// balance already reflects everything posted, so the removal entry only
// needs to zero both it and the gross cost out, receive any proceeds, and
// book gain/loss vs the resulting net book value. Unpaid assets (no
// fixed_asset_account_id) never touch the GL — disposal is a pure status
// change for them.
exports.dispose = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const asset = await db.Asset.findOne({ where: { id: req.params.id, shop_id: shopId }, transaction });
    if (!asset) { await transaction.rollback(); return res.status(404).json({ message: 'Asset not found' }); }
    if (asset.status !== 'active') { await transaction.rollback(); return res.status(400).json({ message: 'Asset is not active' }); }

    const { disposal_date, disposal_value, disposal_via, bank_account_id, notes } = req.body;
    if (!disposal_date) { await transaction.rollback(); return res.status(400).json({ message: 'Disposal date is required' }); }
    const dispValue = parseFloat(disposal_value) || 0;
    if (dispValue < 0) { await transaction.rollback(); return res.status(400).json({ message: 'Disposal value cannot be negative' }); }
    if (dispValue > 0 && !['cash', 'bank'].includes(disposal_via)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'disposal_via must be cash or bank when disposal proceeds are received' });
    }

    const date = new Date(disposal_date);
    if (asset.is_paid) await guardWritableDates(shopId, date, transaction);

    if (asset.is_paid && asset.fixed_asset_account_id) {
      await catchUpOneAsset(asset, shopId, req.user.id, transaction, { asOfDate: date });
    }

    const dep = computeDepreciation({
      purchaseCost: asset.purchase_cost,
      salvageValue: asset.salvage_value,
      depreciationPercentage: asset.depreciation_percentage,
      usefulLifeYears: asset.useful_life_years,
      purchaseDate: asset.purchase_date,
      asOfDate: date,
    });
    const bookValue = dep.bookValue;

    let disposalVoucher = null;
    let disposalBankAcc = null;

    if (asset.is_paid && asset.fixed_asset_account_id) {
      const cost = parseFloat(asset.purchase_cost);
      const gain = Math.max(round2(dispValue - bookValue), 0);
      const loss = Math.max(round2(bookValue - dispValue), 0);

      if (dispValue > 0) {
        if (disposal_via === 'bank') {
          disposalBankAcc = await creditBankAccount(shopId, dispValue, transaction, bank_account_id);
        } else if (bank_account_id) {
          disposalBankAcc = await creditCashPayment(shopId, dispValue, transaction, bank_account_id);
        }
        // else: shared Cash in Hand drawer — no BankAccount row to update; the
        // GL line alone (paymentAccountCode falls back to '05-CASH') covers it.
      }

      const assetAccount = await db.ChartOfAccount.findByPk(asset.fixed_asset_account_id, { transaction });
      const lines = [];
      if (dep.accumulatedDepreciation > 0) {
        const accumDepAccount = await getOrCreateAccumulatedDepreciationAccount(shopId, req.user.id, transaction);
        lines.push({ accountCode: accumDepAccount.account_code, debit: dep.accumulatedDepreciation });
      }
      if (dispValue > 0) {
        lines.push({ accountCode: paymentAccountCode(disposal_via, disposalBankAcc), debit: dispValue });
      }
      if (loss > 0) {
        const lossAccount = await getOrCreateLossOnDisposalAccount(shopId, req.user.id, transaction);
        lines.push({ accountCode: lossAccount.account_code, debit: loss });
      }
      lines.push({ accountCode: assetAccount.account_code, credit: cost });
      if (gain > 0) {
        const gainAccount = await getOrCreateGainOnDisposalAccount(shopId, req.user.id, transaction);
        lines.push({ accountCode: gainAccount.account_code, credit: gain });
      }

      disposalVoucher = await postVoucher(shopId, {
        type: 'journal',
        date,
        narration: `Disposal — ${asset.asset_name}`,
        createdBy: req.user.id,
        branchId: asset.branch_id,
        lines,
      }, transaction);
    }

    asset.status = 'disposed';
    asset.disposal_date = date;
    asset.disposal_value = dispValue;
    asset.disposal_via = dispValue > 0 ? disposal_via : null;
    asset.disposal_bank_account_id = disposalBankAcc?.id || null;
    asset.disposal_voucher_id = disposalVoucher?.id || null;
    asset.disposal_notes = notes || null;
    await asset.save({ transaction });

    await transaction.commit();
    return res.json({
      asset: withComputed(asset),
      gain_loss: round2(dispValue - bookValue),
      book_value_at_disposal: bookValue,
    });
  } catch (error) {
    await transaction.rollback();
    const handled = handleFiscalYearError(res, error);
    if (handled) return handled;
    console.error('disposeAsset error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};
