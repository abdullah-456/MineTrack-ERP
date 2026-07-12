const db = require('../models');

// Only mutations are worth an audit trail — GETs are reads, not changes.
const LOGGED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const ACTION_FOR_METHOD = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

const SENSITIVE_KEYS = ['password', 'password_hash', 'token', 'secret'];

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return null;
  const clone = {};
  for (const [key, value] of Object.entries(body)) {
    clone[key] = SENSITIVE_KEYS.some(s => key.toLowerCase().includes(s)) ? '[REDACTED]' : value;
  }
  return clone;
}

// e.g. '/api/employees/3/give-salary' -> 'employees'
function deriveModule(originalUrl) {
  const withoutQuery = originalUrl.split('?')[0];
  const withoutApi = withoutQuery.replace(/^\/api\/?/, '');
  return withoutApi.split('/')[0] || 'unknown';
}

// ── auditLog ──────────────────────────────────────────────────────────────────
// Mount AFTER `authenticate` (and `tenantScope` where present) on any router.
// Fires on response finish so the real status code is captured; never blocks
// or fails the request — a logging error is swallowed and only console'd.
function auditLog(req, res, next) {
  if (!LOGGED_METHODS.has(req.method)) return next();

  res.on('finish', () => {
    if (!req.user) return; // no authenticated actor to attribute this to
    const entityId = req.params?.id ? parseInt(req.params.id, 10) : null;
    const details = JSON.stringify(sanitizeBody(req.body) ?? {}).slice(0, 2000);

    db.AuditLog.create({
      shop_id: req.user.shop_id || null,
      user_id: req.user.id,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      module: deriveModule(req.originalUrl),
      action: ACTION_FOR_METHOD[req.method] || req.method.toLowerCase(),
      entity_type: null,
      entity_id: Number.isInteger(entityId) ? entityId : null,
      status_code: res.statusCode,
      details,
      ip_address: req.ip,
    }).catch(err => console.error('auditLog write failed:', err.message));
  });

  next();
}

module.exports = auditLog;
