'use strict';

/**
 * Phase 7: extends the Chart of Accounts seeded by
 * 20260705000000-roles-permissions-users-coa.js with the accounts needed to
 * post supplier/employee/sales double-entry vouchers. Idempotent — guarded by
 * account_code existence so it's safe to re-run.
 */

async function tableExists(queryInterface, table) {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  up: async (queryInterface) => {
    if (!(await tableExists(queryInterface, 'chart_of_accounts'))) return;

    const [existing] = await queryInterface.sequelize.query(`SELECT account_code FROM chart_of_accounts;`);
    const existingCodes = new Set(existing.map(r => r.account_code));

    const [parents] = await queryInterface.sequelize.query(`SELECT id, account_code FROM chart_of_accounts;`);
    const coaMap = {};
    parents.forEach(a => { coaMap[a.account_code] = a.id; });

    const newAccounts = [
      { account_code: '05-SUPCREDIT',  account_name: 'Supplier Credit',              account_type: 'asset',     parent_account_id: coaMap['05-CUR-ASSET'] },
      { account_code: '05-EMPADVLOAN', account_name: 'Employee Advances & Loans',    account_type: 'asset',     parent_account_id: coaMap['05-CUR-ASSET'] },
      { account_code: '03-SALPAY',     account_name: 'Salary Payable',               account_type: 'liability', parent_account_id: coaMap['03-CUR-LIAB'] },
      { account_code: '06-RETURNS',    account_name: 'Sales Returns & Allowances',   account_type: 'income',    parent_account_id: coaMap['06-INCOME'] },
      { account_code: '06-LATEFEE',    account_name: 'Late Fee Income',              account_type: 'income',    parent_account_id: coaMap['06-INCOME'] },
      { account_code: '07-WRITEOFF',   account_name: 'Write-off Expense',            account_type: 'expense',   parent_account_id: coaMap['07-EXPENSE'] },
    ]
      .filter(a => !existingCodes.has(a.account_code))
      .map(a => ({ ...a, created_at: new Date(), updated_at: new Date() }));

    if (newAccounts.length) {
      await queryInterface.bulkInsert('chart_of_accounts', newAccounts);
    }
  },

  down: async (queryInterface) => {
    if (!(await tableExists(queryInterface, 'chart_of_accounts'))) return;
    await queryInterface.bulkDelete('chart_of_accounts', {
      account_code: ['05-SUPCREDIT', '05-EMPADVLOAN', '03-SALPAY', '06-RETURNS', '06-LATEFEE', '07-WRITEOFF'],
    });
  },
};
