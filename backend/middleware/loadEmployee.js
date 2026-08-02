'use strict';

const db = require('../models');
const { requireShopId } = require('../utils/shopScope');

// Resolves req.params.id to a shop-scoped Employee and attaches it as
// req.employee — shared by the photo/CNIC/document attachment routes, which
// need the record loaded (for its shop_id) before multer's disk storage runs.
module.exports = async function loadEmployee(req, res, next) {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const employee = await db.Employee.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    req.employee = employee;
    next();
  } catch (error) {
    console.error('loadEmployee error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
