const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');

// These two are the platform's foundational roles — editing/deleting them
// from within a single shop's admin panel would either be meaningless
// (super_admin bypasses all permission checks anyway) or dangerous (admin
// editing its own role could lock every admin in every shop out at once,
// since the role row is currently global/shared). Everything else
// (accountant, user, and any custom role) is manageable.
const LOCKED_ROLE_NAMES = ['super_admin', 'admin'];

function serializeRole(role) {
  return {
    id: role.id,
    name: role.name,
    display_name: role.display_name || role.name,
    description: role.description,
    is_system: role.shop_id === null,
    locked: LOCKED_ROLE_NAMES.includes(role.name),
    permissions: (role.Permissions || []).map(p => ({ module: p.module, action: p.action })),
  };
}

async function loadRoleWithPerms(roleId) {
  return db.Role.findByPk(roleId, {
    include: [{ model: db.Permission, attributes: ['id', 'module', 'action'], through: { attributes: [] } }],
  });
}

// Bulk-grants a role the given [{module, action}] pairs. Silently ignores
// any pair that doesn't correspond to a real row in `permissions` (the
// frontend only ever sends pairs sourced from the catalog endpoint, so this
// is just a defensive guard, not the primary validation).
async function grantPermissions(roleId, permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) return;

  const allPerms = await db.Permission.findAll({ attributes: ['id', 'module', 'action'] });
  const key = (m, a) => `${m}::${a}`;
  const permMap = new Map(allPerms.map(p => [key(p.module, p.action), p.id]));

  const rows = [];
  const seen = new Set();
  permissions.forEach(({ module, action }) => {
    const id = permMap.get(key(module, action));
    if (id && !seen.has(id)) {
      seen.add(id);
      rows.push({ role_id: roleId, permission_id: id });
    }
  });
  if (rows.length > 0) await db.RolePermission.bulkCreate(rows);
}

// ── GET /api/roles ───────────────────────────────────────────────────────────
// Every role visible to this shop: the 4 global/system roles (shop_id NULL)
// plus any custom/forked roles scoped to this shop specifically.
exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const roles = await db.Role.findAll({
      where: { [Op.or]: [{ shop_id: null }, { shop_id: shopId }] },
      include: [{ model: db.Permission, attributes: ['id', 'module', 'action'], through: { attributes: [] } }],
      order: [['shop_id', 'ASC'], ['id', 'ASC']],
    });

    return res.json({ roles: roles.map(serializeRole) });
  } catch (error) {
    console.error('listRoles error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/roles/permissions-catalog ───────────────────────────────────────
// Every (module, action) pair that exists in the system, grouped by module —
// drives the permission-matrix checkboxes. Built from the live `permissions`
// table (not hardcoded), so it automatically includes whatever the latest
// migrations have added (board_directors, branches, expenses, roles, ...).
exports.permissionsCatalog = async (req, res) => {
  try {
    const rows = await db.Permission.findAll({ order: [['module', 'ASC'], ['action', 'ASC']] });
    const grouped = {};
    rows.forEach(p => {
      if (!grouped[p.module]) grouped[p.module] = [];
      grouped[p.module].push(p.action);
    });
    const modules = Object.keys(grouped).sort().map(module => ({ module, actions: grouped[module] }));
    return res.json({ modules });
  } catch (error) {
    console.error('permissionsCatalog error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/roles/:id ────────────────────────────────────────────────────────
exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const role = await loadRoleWithPerms(req.params.id);
    if (!role || (role.shop_id !== null && role.shop_id !== shopId)) {
      return res.status(404).json({ message: 'Role not found' });
    }
    return res.json({ role: serializeRole(role) });
  } catch (error) {
    console.error('getRole error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/roles — create a new custom role scoped to this shop ─────────
exports.create = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { name, description, permissions } = req.body;
    const trimmed = (name || '').trim();
    if (!trimmed) return res.status(400).json({ message: 'Role name is required' });

    const existing = await db.Role.findOne({ where: { name: trimmed } });
    if (existing) return res.status(409).json({ message: 'A role with this name already exists' });

    const role = await db.Role.create({
      name: trimmed,
      display_name: trimmed,
      description: description || null,
      shop_id: shopId,
    });
    await grantPermissions(role.id, permissions);

    return res.status(201).json({ role: serializeRole(await loadRoleWithPerms(role.id)) });
  } catch (error) {
    console.error('createRole error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PUT /api/roles/:id ────────────────────────────────────────────────────────
// Editing one of the two global/shared editable roles (accountant, user)
// "forks" it into a shop-scoped copy the first time — the shared row itself,
// and every OTHER shop's copy of it, is left untouched. Every user in THIS
// shop currently on the global role is reassigned to the new fork so the
// edit takes effect for them immediately.
exports.update = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const role = await db.Role.findByPk(req.params.id);
    if (!role || (role.shop_id !== null && role.shop_id !== shopId)) {
      return res.status(404).json({ message: 'Role not found' });
    }
    if (LOCKED_ROLE_NAMES.includes(role.name)) {
      return res.status(403).json({ message: 'This role cannot be edited' });
    }

    const { description, permissions } = req.body;
    let target = role;

    if (role.shop_id === null) {
      target = await db.Role.create({
        name: `${role.name}__shop${shopId}`,
        display_name: role.display_name || role.name,
        description: description !== undefined ? description : role.description,
        shop_id: shopId,
      });
      await grantPermissions(target.id, (await loadRoleWithPerms(role.id)).Permissions.map(p => ({ module: p.module, action: p.action })));
      await db.User.update({ role_id: target.id }, { where: { role_id: role.id, shop_id: shopId } });
    } else if (description !== undefined) {
      target.description = description;
      await target.save();
    }

    if (Array.isArray(permissions)) {
      await db.RolePermission.destroy({ where: { role_id: target.id } });
      await grantPermissions(target.id, permissions);
    }

    return res.json({ role: serializeRole(await loadRoleWithPerms(target.id)) });
  } catch (error) {
    console.error('updateRole error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── DELETE /api/roles/:id ─────────────────────────────────────────────────────
exports.remove = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const role = await db.Role.findByPk(req.params.id);
    if (!role) return res.status(404).json({ message: 'Role not found' });
    if (role.shop_id !== shopId) {
      return res.status(403).json({ message: 'Only custom roles created for this shop can be deleted' });
    }
    if (LOCKED_ROLE_NAMES.includes(role.name)) {
      return res.status(403).json({ message: 'This role cannot be deleted' });
    }

    const userCount = await db.User.count({ where: { role_id: role.id } });
    if (userCount > 0) {
      return res.status(400).json({ message: `Cannot delete: ${userCount} user(s) are currently assigned this role. Reassign them first.` });
    }

    await db.RolePermission.destroy({ where: { role_id: role.id } });
    await role.destroy();
    return res.json({ message: 'Role deleted' });
  } catch (error) {
    console.error('removeRole error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
