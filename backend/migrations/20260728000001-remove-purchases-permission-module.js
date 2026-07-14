'use strict';

/**
 * Purchase Orders is being removed entirely — no route checks
 * authorize('purchases', ...) anymore (see businessRoutes.js). The 'purchases'
 * permission rows seeded by 20260705000000-roles-permissions-users-coa.js
 * (create/read/update/delete/approve) are now dead data that would otherwise
 * keep showing up as a toggleable module in the Roles & Permissions admin UI,
 * which reads its module list straight from the `permissions` table. This
 * deletes those rows (and their role_permissions links) from already-seeded
 * databases; the seeder itself was also updated to stop generating them for
 * fresh installs.
 */

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE module = 'purchases')`
    );
    await queryInterface.sequelize.query(`DELETE FROM permissions WHERE module = 'purchases'`);
  },

  down: async (queryInterface) => {
    // Not reversible in a meaningful way — the original create/read/update/
    // delete/approve rows (and which roles had them) aren't recoverable once
    // deleted. Re-seeding would be the way back if this module is ever needed
    // again.
    void queryInterface;
  },
};
