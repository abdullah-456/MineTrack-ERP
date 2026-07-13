'use strict';
const bcrypt = require('bcryptjs');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const saltRounds = 12;

    // ──────────────────────────────────────────────────────────────
    // 1. Create Shops table if not exists (handled by sync)
    //    Insert the Demo Shop
    // ──────────────────────────────────────────────────────────────
    await queryInterface.bulkInsert('shops', [
      {
        name: 'Demo Electronics',
        owner_name: 'Ahmed Khan',
        email: 'admin@demo.esms.local',
        phone: '03001234567',
        address: 'Main Market, Lahore, Pakistan',
        status: 'active',
        plan: 'pro',
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

    const [insertedShops] = await queryInterface.sequelize.query(`SELECT id FROM shops LIMIT 1;`);
    const demoShopId = insertedShops[0].id;

    // ──────────────────────────────────────────────────────────────
    // 2. Seed Roles (global — not per-shop)
    // ──────────────────────────────────────────────────────────────
    const roles = [
      { name: 'super_admin', description: 'Platform owner — full access to all shops and system settings', created_at: new Date(), updated_at: new Date() },
      { name: 'admin',       description: 'Shop admin — manage all operations within their shop', created_at: new Date(), updated_at: new Date() },
      { name: 'accountant',  description: 'Full read/write to accounting; read-only on other modules (branch-scoped)', created_at: new Date(), updated_at: new Date() },
      { name: 'user',        description: 'POS/Sales Cashier — create sales, view own stock/sales (branch-scoped)', created_at: new Date(), updated_at: new Date() }
    ];
    await queryInterface.bulkInsert('roles', roles);

    const [insertedRoles] = await queryInterface.sequelize.query(`SELECT id, name FROM roles;`);
    const roleMap = {};
    insertedRoles.forEach(r => { roleMap[r.name] = r.id; });

    // ──────────────────────────────────────────────────────────────
    // 3. Seed Permissions
    // ──────────────────────────────────────────────────────────────
    const modules = [
      'users', 'shops', 'suppliers', 'products', 'inventory', 'purchases',
      'sales', 'customers', 'employees', 'accounting', 'reports',
      'returns'
    ];
    const actions = ['create', 'read', 'update', 'delete', 'approve'];

    const permissions = [];
    modules.forEach(moduleName => {
      actions.forEach(actionName => {
        permissions.push({
          module: moduleName,
          action: actionName,
          created_at: new Date(),
          updated_at: new Date()
        });
      });
    });
    // Special permission: allows a user to override the server-side sale price at POS
    permissions.push({ module: 'sales', action: 'override_price', created_at: new Date(), updated_at: new Date() });
    await queryInterface.bulkInsert('permissions', permissions);

    const [insertedPerms] = await queryInterface.sequelize.query(`SELECT id, module, action FROM permissions;`);

    // ──────────────────────────────────────────────────────────────
    // 4. Map Permissions to Roles
    // ──────────────────────────────────────────────────────────────
    const rolePermissions = [];
    insertedPerms.forEach(p => {
      // Super Admin — everything
      rolePermissions.push({ role_id: roleMap['super_admin'], permission_id: p.id });

      // Admin — all except shops management (they can't create shops)
      if (p.module !== 'shops') {
        if (p.module === 'accounting') {
          if (p.action === 'read') rolePermissions.push({ role_id: roleMap['admin'], permission_id: p.id });
        } else if (p.module === 'sales' && p.action === 'override_price') {
          rolePermissions.push({ role_id: roleMap['admin'], permission_id: p.id });
        } else {
          rolePermissions.push({ role_id: roleMap['admin'], permission_id: p.id });
        }
      }

      // Accountant — full accounting/reports, read-only on others
      if (p.module === 'accounting' || p.module === 'reports') {
        rolePermissions.push({ role_id: roleMap['accountant'], permission_id: p.id });
      } else if (!['users', 'shops'].includes(p.module) && p.action === 'read') {
        rolePermissions.push({ role_id: roleMap['accountant'], permission_id: p.id });
      }

      // Cashier — sales + basic access
      if (p.module === 'sales'        && ['create', 'read'].includes(p.action)) rolePermissions.push({ role_id: roleMap['user'], permission_id: p.id });
      if (p.module === 'returns'      && ['create', 'read'].includes(p.action)) rolePermissions.push({ role_id: roleMap['user'], permission_id: p.id });
      if (p.module === 'customers'    && ['create', 'read'].includes(p.action)) rolePermissions.push({ role_id: roleMap['user'], permission_id: p.id });
      if (['products', 'inventory'].includes(p.module) && p.action === 'read')   rolePermissions.push({ role_id: roleMap['user'], permission_id: p.id });
      if (p.module === 'reports'      && p.action === 'read')                    rolePermissions.push({ role_id: roleMap['user'], permission_id: p.id });
    });

    await queryInterface.bulkInsert('role_permissions', rolePermissions);

    // ──────────────────────────────────────────────────────────────
    // 5. Seed Default Branch for Demo Shop
    // ──────────────────────────────────────────────────────────────
    await queryInterface.bulkInsert('branches', [
      {
        shop_id: demoShopId,
        name: 'Main Branch',
        address: 'Main Market, Lahore',
        is_default: true,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

    const [insertedBranches] = await queryInterface.sequelize.query(`SELECT id FROM branches LIMIT 1;`);
    const defaultBranchId = insertedBranches[0].id;

    // ──────────────────────────────────────────────────────────────
    // 6. Seed Users
    // ──────────────────────────────────────────────────────────────
    const users = [
      // Super Admin — NO shop_id (platform owner)
      {
        name: 'Super Admin',
        email: 'superadmin@esms.local',
        password_hash: await bcrypt.hash('SuperAdmin@123', saltRounds),
        role_id: roleMap['super_admin'],
        shop_id: null,
        branch_id: null,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      },
      // Demo Shop Admin
      {
        name: 'Demo Admin',
        email: 'admin@demo.esms.local',
        password_hash: await bcrypt.hash('Admin@123', saltRounds),
        role_id: roleMap['admin'],
        shop_id: demoShopId,
        branch_id: null, // Admin manages all branches
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      },
      // Demo Shop Accountant
      {
        name: 'Head Accountant',
        email: 'accountant@demo.esms.local',
        password_hash: await bcrypt.hash('Accountant@123', saltRounds),
        role_id: roleMap['accountant'],
        shop_id: demoShopId,
        branch_id: defaultBranchId,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      },
      // Demo Shop Cashier
      {
        name: 'Cashier One',
        email: 'cashier@demo.esms.local',
        password_hash: await bcrypt.hash('User@123', saltRounds),
        role_id: roleMap['user'],
        shop_id: demoShopId,
        branch_id: defaultBranchId,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      }
    ];
    await queryInterface.bulkInsert('users', users);

    console.log('\n==================================================');
    console.log('ESMS Multi-Tenant Seed Users Created Successfully:');
    console.log('');
    console.log('--- PLATFORM LEVEL ---');
    console.log('1. Super Admin:  superadmin@esms.local / SuperAdmin@123  (role: super_admin, no shop)');
    console.log('');
    console.log('--- DEMO SHOP (Demo Electronics) ---');
    console.log('2. Shop Admin:   admin@demo.esms.local / Admin@123        (role: admin)');
    console.log('3. Accountant:   accountant@demo.esms.local / Accountant@123 (role: accountant)');
    console.log('4. Cashier:      cashier@demo.esms.local / User@123       (role: user)');
    console.log('==================================================\n');

    // ──────────────────────────────────────────────────────────────
    // 7. Seed Chart of Accounts (scoped to demo shop)
    // ──────────────────────────────────────────────────────────────
    const baseAccounts = [
      { account_code: '01-CAPITAL',  account_name: 'Capital & Equity',       account_type: 'equity' },
      { account_code: '02-LT-LIAB',  account_name: 'Long Term Liabilities',  account_type: 'liability' },
      { account_code: '03-CUR-LIAB', account_name: 'Current Liabilities',    account_type: 'liability' },
      { account_code: '04-LT-ASSET', account_name: 'Long Term Assets',       account_type: 'asset' },
      { account_code: '05-CUR-ASSET',account_name: 'Current Assets',         account_type: 'asset' },
      { account_code: '06-INCOME',   account_name: 'Income & Revenue',       account_type: 'income' },
      { account_code: '07-EXPENSE',  account_name: 'Expenses',               account_type: 'expense' }
    ].map(act => ({ ...act, created_at: new Date(), updated_at: new Date() }));

    await queryInterface.bulkInsert('chart_of_accounts', baseAccounts);

    const [insertedAccounts] = await queryInterface.sequelize.query(`SELECT id, account_code FROM chart_of_accounts;`);
    const coaMap = {};
    insertedAccounts.forEach(a => { coaMap[a.account_code] = a.id; });

    const childAccounts = [
      { account_code: '03-AP',      account_name: 'Accounts Payable',    account_type: 'liability', parent_account_id: coaMap['03-CUR-LIAB'] },
      { account_code: '05-CASH',    account_name: 'Cash in Hand',        account_type: 'asset',     parent_account_id: coaMap['05-CUR-ASSET'] },
      { account_code: '05-BANK',    account_name: 'Bank Account',        account_type: 'asset',     parent_account_id: coaMap['05-CUR-ASSET'] },
      { account_code: '05-AR',      account_name: 'Accounts Receivable', account_type: 'asset',     parent_account_id: coaMap['05-CUR-ASSET'] },
      { account_code: '05-STOCK',   account_name: 'Stock/Inventory',     account_type: 'asset',     parent_account_id: coaMap['05-CUR-ASSET'] },
      { account_code: '06-SALES',   account_name: 'Sales Revenue',       account_type: 'income',    parent_account_id: coaMap['06-INCOME'] },
      { account_code: '07-COGS',    account_name: 'Cost of Goods Sold',  account_type: 'expense',   parent_account_id: coaMap['07-EXPENSE'] },
      { account_code: '07-SALARIES',account_name: 'Salaries Expense',    account_type: 'expense',   parent_account_id: coaMap['07-EXPENSE'] },
      { account_code: '07-RENT',    account_name: 'Rent Expense',        account_type: 'expense',   parent_account_id: coaMap['07-EXPENSE'] }
    ].map(act => ({ ...act, created_at: new Date(), updated_at: new Date() }));

    await queryInterface.bulkInsert('chart_of_accounts', childAccounts);
    console.log('Base Chart of Accounts seeded successfully.');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('chart_of_accounts', null, {});
    await queryInterface.bulkDelete('users', null, {});
    await queryInterface.bulkDelete('role_permissions', null, {});
    await queryInterface.bulkDelete('permissions', null, {});
    await queryInterface.bulkDelete('roles', null, {});
    await queryInterface.bulkDelete('branches', null, {});
    await queryInterface.bulkDelete('shops', null, {});
  }
};
