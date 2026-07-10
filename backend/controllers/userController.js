const bcrypt = require('bcryptjs');
const db = require('../models');
const { Op } = require('sequelize');
const {
  canManageTarget,
  canAssignRole,
  validateUserShopBranch,
  isSuperAdminRole,
} = require('../utils/accessHelpers');

const userIncludes = [
  { model: db.Role, attributes: ['id', 'name'] },
  { model: db.Branch, attributes: ['id', 'name'], required: false },
  { model: db.Shop, attributes: ['id', 'name'], required: false },
];

const loadUserWithRole = async (id) => db.User.findByPk(id, {
  include: [{ model: db.Role }],
});

// ── GET /api/users — List users
exports.listUsers = async (req, res) => {
  try {
    const where = {};

    if (req.user.Role.name === 'super_admin') {
      if (req.query.shop_id) where.shop_id = req.query.shop_id;
    } else {
      where.shop_id = req.user.shop_id;
    }

    const users = await db.User.findAll({
      where,
      include: userIncludes,
      attributes: { exclude: ['password_hash'] },
      order: [['created_at', 'DESC']],
    });

    const filtered = req.user.Role.name === 'super_admin'
      ? users
      : users.filter(u => u.Role?.name !== 'super_admin');

    return res.json({ users: filtered });
  } catch (error) {
    console.error('listUsers error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/users/:id — Get single user
exports.getUser = async (req, res) => {
  try {
    const user = await db.User.findByPk(req.params.id, {
      include: userIncludes,
      attributes: { exclude: ['password_hash'] },
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!canManageTarget(req.user, user)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    return res.json({ user });
  } catch (error) {
    console.error('getUser error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/users — Create a new user
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role_id, branch_id, shop_id } = req.body;

    if (!name || !email || !password || !role_id) {
      return res.status(400).json({ message: 'Name, email, password, and role are required' });
    }

    const targetRole = await db.Role.findByPk(role_id);
    if (!targetRole) return res.status(404).json({ message: 'Role not found' });

    if (!canAssignRole(req.user.Role.name, targetRole.name)) {
      return res.status(403).json({ message: 'You cannot assign this role.' });
    }

    let targetShopId;
    let targetBranchId = branch_id || null;

    if (req.user.Role.name === 'super_admin') {
      targetShopId = isSuperAdminRole(targetRole.name) ? null : (shop_id || null);
    } else {
      targetShopId = req.user.shop_id;
    }

    const validationError = await validateUserShopBranch({
      roleName: targetRole.name,
      shopId: targetShopId,
      branchId: targetBranchId,
    });
    if (validationError) return res.status(400).json({ message: validationError });

    const existing = await db.User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ message: 'Email already in use' });

    const hashedPw = await bcrypt.hash(password, 12);
    const user = await db.User.create({
      name,
      email,
      password_hash: hashedPw,
      role_id,
      shop_id: targetShopId,
      branch_id: isSuperAdminRole(targetRole.name) ? null : targetBranchId,
      status: 'active',
    });

    const created = await db.User.findByPk(user.id, {
      include: userIncludes,
      attributes: { exclude: ['password_hash'] },
    });

    return res.status(201).json({ message: 'User created successfully', user: created });
  } catch (error) {
    console.error('createUser error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PUT /api/users/:id — Update user
exports.updateUser = async (req, res) => {
  try {
    const user = await loadUserWithRole(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!canManageTarget(req.user, user)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { name, email, role_id, branch_id, status, shop_id } = req.body;

    let targetRole = user.Role;
    if (role_id && role_id !== user.role_id) {
      targetRole = await db.Role.findByPk(role_id);
      if (!targetRole) return res.status(404).json({ message: 'Role not found' });
      if (!canAssignRole(req.user.Role.name, targetRole.name)) {
        return res.status(403).json({ message: 'You cannot assign this role.' });
      }
    }

    let targetShopId = user.shop_id;
    let targetBranchId = branch_id !== undefined ? (branch_id || null) : user.branch_id;

    if (req.user.Role.name === 'super_admin') {
      if (shop_id !== undefined) targetShopId = isSuperAdminRole(targetRole.name) ? null : (shop_id || null);
      if (isSuperAdminRole(targetRole.name)) {
        targetShopId = null;
        targetBranchId = null;
      }
    }

    if (status === 'active' && isSuperAdminRole(targetRole.name) === false && targetShopId) {
      const shop = await db.Shop.findByPk(targetShopId);
      if (!shop || shop.status !== 'active') {
        return res.status(400).json({ message: 'Cannot activate user while their shop is suspended.' });
      }
    }

    const validationError = await validateUserShopBranch({
      roleName: targetRole.name,
      shopId: targetShopId,
      branchId: targetBranchId,
    });
    if (validationError) return res.status(400).json({ message: validationError });

    await user.update({
      name: name ?? user.name,
      email: email ?? user.email,
      role_id: targetRole.id,
      shop_id: targetShopId,
      branch_id: targetBranchId,
      status: status ?? user.status,
    });

    const updated = await db.User.findByPk(user.id, {
      include: userIncludes,
      attributes: { exclude: ['password_hash'] },
    });

    return res.json({ message: 'User updated successfully', user: updated });
  } catch (error) {
    console.error('updateUser error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/users/:id/suspend — Suspend user (disable login)
exports.suspendUser = async (req, res) => {
  try {
    const user = await loadUserWithRole(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!canManageTarget(req.user, user)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (user.id === req.user.id) {
      return res.status(400).json({ message: 'You cannot suspend your own account' });
    }

    await user.update({ status: 'disabled' });
    return res.json({ message: 'User suspended successfully' });
  } catch (error) {
    console.error('suspendUser error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/users/:id/activate — Reactivate user
exports.activateUser = async (req, res) => {
  try {
    const user = await loadUserWithRole(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!canManageTarget(req.user, user)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (user.shop_id) {
      const shop = await db.Shop.findByPk(user.shop_id);
      if (!shop || shop.status !== 'active') {
        return res.status(400).json({ message: 'Cannot activate user while their shop is suspended.' });
      }
    }

    await user.update({ status: 'active' });
    return res.json({ message: 'User activated successfully' });
  } catch (error) {
    console.error('activateUser error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── DELETE /api/users/:id — Permanently delete user
exports.deleteUser = async (req, res) => {
  try {
    const user = await loadUserWithRole(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!canManageTarget(req.user, user)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (user.id === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    await user.destroy();
    return res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('deleteUser error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/users/:id/reset-password — Reset password
exports.resetPassword = async (req, res) => {
  try {
    const user = await loadUserWithRole(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!canManageTarget(req.user, user)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const hashedPw = await bcrypt.hash(new_password, 12);
    await user.update({ password_hash: hashedPw });

    return res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('resetPassword error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/users/roles — List available roles
exports.listRoles = async (req, res) => {
  try {
    const roles = await db.Role.findAll({ order: [['id', 'ASC']] });

    const filtered = req.user.Role.name === 'super_admin'
      ? roles
      : roles.filter(r => canAssignRole(req.user.Role.name, r.name));

    return res.json({ roles: filtered });
  } catch (error) {
    console.error('listRoles error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
