'use strict';

/**
 * One payroll row per employee per month.
 *
 * giveSalary (controllers/employeeLedgerController.js) checks for an existing
 * Payroll row for the month and relies on a `lock: transaction.LOCK.UPDATE` on
 * the Employee row to serialize concurrent calls. That closes the race today,
 * but it is the only thing standing between a retried request and paying the
 * same salary twice — and paying twice both double-books the salary expense and
 * double-credits cash. This is the schema-level backstop.
 *
 * models/payroll.js declares no index, so nothing created one.
 *
 * If an existing database already contains duplicates the index cannot be
 * created; rather than aborting the migration chain, this reports them and
 * skips, so the duplicates can be resolved deliberately.
 */

module.exports = {
  up: async (queryInterface) => {
    const [duplicates] = await queryInterface.sequelize.query(`
      SELECT employee_id, month, COUNT(*) AS n
      FROM payroll
      GROUP BY employee_id, month
      HAVING COUNT(*) > 1
    `);

    if (duplicates.length) {
      console.warn(
        `  skipped payroll unique index — ${duplicates.length} duplicate (employee_id, month) group(s) found. ` +
        'Resolve these rows, then re-run this migration:'
      );
      duplicates.forEach(d => console.warn(`    employee_id=${d.employee_id} month=${d.month} rows=${d.n}`));
      return;
    }

    const existing = await queryInterface.showIndex('payroll');
    if (existing.some(i => i.name === 'payroll_employee_id_month')) return;

    await queryInterface.addIndex('payroll', ['employee_id', 'month'], {
      unique: true,
      name: 'payroll_employee_id_month',
    });
  },

  down: async (queryInterface) => {
    const existing = await queryInterface.showIndex('payroll');
    if (existing.some(i => i.name === 'payroll_employee_id_month')) {
      await queryInterface.removeIndex('payroll', 'payroll_employee_id_month');
    }
  },
};
