'use strict';

function resolveShopId(req) {
  if (req.user.Role?.name === 'super_admin') {
    const raw = req.query.shop_id || req.body?.shop_id;
    return raw ? parseInt(raw, 10) : null;
  }
  return req.user.shop_id || null;
}

function requireShopId(req, res) {
  const shopId = resolveShopId(req);
  if (!shopId) {
    res.status(400).json({ message: 'shop_id is required for this operation' });
    return null;
  }
  return shopId;
}

function resolveBranchId(req) {
  const role = req.user.Role?.name;
  if (role === 'super_admin' || role === 'admin') {
    const raw = req.query.branch_id || req.body?.branch_id;
    return raw ? parseInt(raw, 10) : req.user.branch_id || null;
  }
  return req.user.branch_id || null;
}

module.exports = { resolveShopId, requireShopId, resolveBranchId };
