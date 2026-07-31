'use strict';

const db = require('../models');
const { requireShopId } = require('../utils/shopScope');
const {
  getCurrentFiscalYear,
  getYearEndPromptState,
  ensureFiscalYearForShop,
  handleFiscalYearError,
} = require('../utils/fiscalYear');
const { buildPreCloseChecklist, closeFiscalYear } = require('../services/fiscalYearClose');

function hasClosePermission(req) {
  if (req.user?.Role?.name === 'super_admin') return true;
  return req.user?.Role?.Permissions?.some(
    p => p.module === 'accounting' && p.action === 'fiscal_year.close',
  );
}

exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    await ensureFiscalYearForShop(shopId);

    const years = await db.FiscalYear.findAll({
      where: { shop_id: shopId },
      order: [['start_date', 'DESC']],
      include: [
        { model: db.User, as: 'ClosedBy', attributes: ['id', 'name'] },
      ],
    });

    return res.json({ fiscal_years: years });
  } catch (error) {
    console.error('listFiscalYears error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.current = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    await ensureFiscalYearForShop(shopId);
    const fy = await getCurrentFiscalYear(shopId);
    const prompt = await getYearEndPromptState(shopId);

    if (!fy) {
      return res.json({
        fiscal_year: null,
        year_end_prompt: false,
        year_end_overdue: false,
        year_end_approaching: false,
      });
    }

    return res.json({
      fiscal_year: fy,
      close_target_fiscal_year: prompt.close_target,
      year_end_prompt: prompt.prompt,
      year_end_overdue: prompt.overdue,
      year_end_approaching: prompt.approaching,
      days_until_end: prompt.days_until_end,
      // backward compat
      year_end_due: prompt.overdue,
      can_close: hasClosePermission(req),
    });
  } catch (error) {
    console.error('currentFiscalYear error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.preCloseChecklist = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const checklist = await buildPreCloseChecklist(shopId, parseInt(req.params.id, 10));
    return res.json(checklist);
  } catch (error) {
    const handled = handleFiscalYearError(res, error);
    if (handled) return handled;
    if (error.statusCode === 404) return res.status(404).json({ message: error.message });
    console.error('preCloseChecklist error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.close = async (req, res) => {
  try {
    if (!hasClosePermission(req)) {
      return res.status(403).json({ message: 'Forbidden: fiscal year close permission required.' });
    }

    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const result = await closeFiscalYear(shopId, parseInt(req.params.id, 10), req.user.id);
    return res.json(result);
  } catch (error) {
    const handled = handleFiscalYearError(res, error);
    if (handled) return handled;
    if (error.statusCode === 400 || error.statusCode === 404) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('closeFiscalYear error:', error);
    return res.status(500).json({ message: error.message || 'Internal server error' });
  }
};
