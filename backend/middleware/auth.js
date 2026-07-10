const jwt = require('jsonwebtoken');
const db  = require('../models');
const { checkShopAccess } = require('../utils/accessHelpers');

// ── authenticate ─────────────────────────────────────────────────────────────
// Validates Bearer token, attaches user + role + permissions to req.user
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await db.User.findByPk(decoded.id, {
      include: [
        {
          model: db.Role,
          include: { model: db.Permission, through: { attributes: [] } }
        },
        { model: db.Shop, required: false }
      ]
    });

    if (!user || user.status !== 'active') {
      return res.status(403).json({ message: 'User is disabled or does not exist' });
    }

    const shopAccess = await checkShopAccess(user);
    if (!shopAccess.allowed) {
      return res.status(403).json({ message: shopAccess.message });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// ── authorize ─────────────────────────────────────────────────────────────────
// Checks that the authenticated user has a specific module:action permission
const authorize = (moduleName, actionName) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    // Super admin has absolute access
    if (req.user.Role && req.user.Role.name === 'super_admin') return next();

    const hasPermission = req.user.Role && req.user.Role.Permissions.some(
      p => p.module === moduleName && p.action === actionName
    );

    if (!hasPermission) {
      return res.status(403).json({
        message: `Forbidden: You do not have '${actionName}' permission on '${moduleName}'.`
      });
    }
    next();
  };
};

// ── requireSuperAdmin ─────────────────────────────────────────────────────────
// Guard that only allows super_admin through
const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.Role.name !== 'super_admin') {
    return res.status(403).json({ message: 'Forbidden: SuperAdmin access only.' });
  }
  next();
};

// ── tenantScope ───────────────────────────────────────────────────────────────
// Injects the tenant filter into req.tenantWhere
// Super admin can override by passing ?shop_id= in query
// All other users are locked to their shop
const tenantScope = (req, res, next) => {
  if (req.user.Role.name === 'super_admin') {
    // SuperAdmin can optionally filter by shop
    const shopId = req.query.shop_id ? parseInt(req.query.shop_id) : null;
    req.tenantWhere = shopId ? { shop_id: shopId } : {};
    req.isSuperAdmin = true;
  } else {
    if (!req.user.shop_id) {
      return res.status(403).json({ message: 'No shop context found for your account.' });
    }
    req.tenantWhere = { shop_id: req.user.shop_id };
    req.isSuperAdmin = false;
  }
  next();
};

// ── branchScope ──────────────────────────────────────────────────────────────
// Scopes non-admin users to their specific branch
const branchScope = (req, res, next) => {
  const role = req.user.Role.name;
  if (role === 'super_admin' || role === 'admin') {
    // Admin & SuperAdmin see all branches in their scope
    req.branchWhere = {};
  } else if (req.user.branch_id) {
    req.branchWhere = { branch_id: req.user.branch_id };
  } else {
    return res.status(403).json({ message: 'No branch context found for your account.' });
  }
  next();
};

module.exports = { authenticate, authorize, requireSuperAdmin, tenantScope, branchScope };
