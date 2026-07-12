const db = require('../models');

// Only these two roles delete instantly — everyone else (even with an
// authorize('<module>','delete') grant) submits a request that shows up on
// the admin's Deletion Requests screen for approval instead of mutating the
// record right away.
function isAdminRole(roleName) {
  return roleName === 'super_admin' || roleName === 'admin';
}

// Call from inside a controller's remove()/void() handler, AFTER loading the
// target entity but BEFORE mutating it. If the caller isn't an admin, this
// creates the pending request and returns `{ pending: true }` — the caller
// should respond 202 and stop. If the caller IS an admin, returns
// `{ pending: false }` and the caller proceeds with its normal delete logic.
async function requestOrAllowDelete({ req, res, shopId, module, entityId, entityLabel, transaction }) {
  if (isAdminRole(req.user.Role.name)) {
    return { pending: false };
  }

  const existing = await db.DeletionRequest.findOne({
    where: { shop_id: shopId, module, entity_id: entityId, status: 'pending' },
    transaction,
  });
  if (existing) {
    res.status(409).json({ message: 'A deletion request for this record is already pending admin approval.' });
    return { pending: true, alreadyHandled: true };
  }

  await db.DeletionRequest.create({
    shop_id: shopId,
    module,
    entity_id: entityId,
    entity_label: entityLabel || null,
    requested_by: req.user.id,
    request_reason: req.body?.reason || null,
    status: 'pending',
  }, { transaction });

  res.status(202).json({ message: 'Deletion request submitted for admin approval.' });
  return { pending: true, alreadyHandled: true };
}

module.exports = { isAdminRole, requestOrAllowDelete };
