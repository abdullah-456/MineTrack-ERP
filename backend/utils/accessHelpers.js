const db = require('../models');

const ROLE_HIERARCHY = {
  super_admin: 4,
  admin:       3,
  accountant:  2,
  user:        1,
};

const getRoleLevel = (roleName) => ROLE_HIERARCHY[roleName] || 0;

const isSuperAdminRole = (roleName) => roleName === 'super_admin';

const isShopScopedRole = (roleName) => roleName !== 'super_admin';

const requiresBranch = (roleName) => roleName === 'accountant' || roleName === 'user';

// Caller can view/edit/delete a target user (hierarchy + shop scope)
const canManageTarget = (caller, targetUser) => {
  const callerRole = caller.Role?.name;
  const targetRole = targetUser.Role?.name || targetUser.role?.name;

  if (callerRole === 'super_admin') return true;
  if (isSuperAdminRole(targetRole)) return false;
  if (targetUser.shop_id !== caller.shop_id) return false;

  return getRoleLevel(targetRole) < getRoleLevel(callerRole);
};

// Caller can assign a role when creating/updating
const canAssignRole = (callerRole, targetRoleName) => {
  if (callerRole === 'super_admin') return true;
  if (isSuperAdminRole(targetRoleName)) return false;
  return getRoleLevel(targetRoleName) < getRoleLevel(callerRole);
};

const validateUserShopBranch = async ({ roleName, shopId, branchId }) => {
  if (isSuperAdminRole(roleName)) {
    if (shopId != null) return 'Super Admin accounts cannot be linked to a shop.';
    if (branchId != null) return 'Super Admin accounts cannot be linked to a branch.';
    return null;
  }

  if (!shopId) return 'A shop is required for this role.';

  const shop = await db.Shop.findByPk(shopId);
  if (!shop) return 'Shop not found.';
  if (shop.status !== 'active') return 'Cannot assign users to a suspended shop.';

  if (requiresBranch(roleName)) {
    if (!branchId) return 'A branch is required for this role.';
    const branch = await db.Branch.findOne({ where: { id: branchId, shop_id: shopId } });
    if (!branch) return 'Branch not found or does not belong to the selected shop.';
    if (branch.status !== 'active') return 'Cannot assign users to a disabled branch.';
  } else if (branchId) {
    const branch = await db.Branch.findOne({ where: { id: branchId, shop_id: shopId } });
    if (!branch) return 'Branch not found or does not belong to the selected shop.';
  }

  return null;
};

const checkShopAccess = async (user) => {
  if (!user.shop_id) return { allowed: true };

  const shop = user.Shop || await db.Shop.findByPk(user.shop_id);
  if (!shop || shop.status !== 'active') {
    return {
      allowed: false,
      message: 'Your shop is suspended. Please contact the platform administrator.',
    };
  }
  return { allowed: true };
};

module.exports = {
  ROLE_HIERARCHY,
  getRoleLevel,
  isSuperAdminRole,
  isShopScopedRole,
  requiresBranch,
  canManageTarget,
  canAssignRole,
  validateUserShopBranch,
  checkShopAccess,
};
