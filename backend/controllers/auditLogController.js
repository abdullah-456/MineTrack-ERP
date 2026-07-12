const db = require('../models');
const { Op } = require('sequelize');

// ── GET /admin/audit-log ──────────────────────────────────────────────────────
// Every authenticated mutating request across the app (see middleware/auditLog.js),
// paginated and filterable. Shop-scoped for regular users; super_admin may see
// any shop (or all, via no filter) — mirrors the tenantScope convention used
// throughout businessRoutes.js.
exports.list = async (req, res) => {
  try {
    const where = {};
    if (req.user.Role?.name !== 'super_admin') {
      if (!req.user.shop_id) return res.status(403).json({ message: 'No shop context found for your account.' });
      where.shop_id = req.user.shop_id;
    } else if (req.query.shop_id) {
      where.shop_id = parseInt(req.query.shop_id, 10);
    }

    if (req.query.user_id) where.user_id = parseInt(req.query.user_id, 10);
    if (req.query.module && req.query.module !== 'all') where.module = req.query.module;
    if (req.query.action && req.query.action !== 'all') where.action = req.query.action;
    if (req.query.method && req.query.method !== 'all') where.method = req.query.method;
    if (req.query.search) {
      where[Op.or] = [
        { path: { [Op.like]: `%${req.query.search}%` } },
        { details: { [Op.like]: `%${req.query.search}%` } },
      ];
    }
    if (req.query.from || req.query.to) {
      where.created_at = {};
      if (req.query.from) where.created_at[Op.gte] = new Date(req.query.from);
      if (req.query.to) where.created_at[Op.lte] = new Date(`${req.query.to}T23:59:59.999Z`);
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);

    const { rows, count } = await db.AuditLog.findAndCountAll({
      where,
      include: [{ model: db.User, attributes: ['id', 'name', 'email'] }],
      order: [['created_at', 'DESC'], ['id', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });

    const logs = rows.map(r => ({
      id: r.id,
      date: r.createdAt,
      user: r.User ? { id: r.User.id, name: r.User.name, email: r.User.email } : null,
      method: r.method,
      module: r.module,
      action: r.action,
      path: r.path,
      entity_id: r.entity_id,
      status_code: r.status_code,
      details: r.details,
      ip_address: r.ip_address,
    }));

    return res.json({
      logs,
      total: count,
      page,
      pages: Math.max(1, Math.ceil(count / limit)),
    });
  } catch (error) {
    console.error('listAuditLog error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /admin/audit-log/modules ─────────────────────────────────────────────
// Distinct module names seen so far, for the filter dropdown.
exports.listModules = async (req, res) => {
  try {
    const where = {};
    if (req.user.Role?.name !== 'super_admin') {
      if (!req.user.shop_id) return res.status(403).json({ message: 'No shop context found for your account.' });
      where.shop_id = req.user.shop_id;
    }

    const rows = await db.AuditLog.findAll({
      where,
      attributes: [[db.sequelize.fn('DISTINCT', db.sequelize.col('module')), 'module']],
      raw: true,
    });
    const modules = rows.map(r => r.module).filter(Boolean).sort();
    return res.json({ modules });
  } catch (error) {
    console.error('listAuditLogModules error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
