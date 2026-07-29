'use strict';

/**
 * New employee_transactions type: 'advance_cleared', plus a data repair for the
 * balances the missing type corrupted.
 *
 * THE BUG
 * recordAdvance debits the employee (current_payable -= amount) when an advance
 * is paid out. giveSalary then recovers that advance by deducting it from net
 * pay — but never credited current_payable back, and logged the recovery only
 * inside a combined `deduction` row that the ledger replays with a NEGATIVE
 * sign. So the advance was subtracted twice and never added back: every advance
 * recovered through normal payroll left the employee permanently looking like
 * they still owed the company money.
 *
 * That phantom balance is what let a single debt be collected twice at
 * termination — it surfaced as "salary overpayment receivable" while the same
 * money was also tracked as an advance/loan receivable.
 *
 * WHY A NEW TYPE
 * 'receivable_collected' already exists, but reports treat it as cash coming in
 * (see controllers/moduleReportsController.js). Clearing an advance through
 * payroll moves no cash — the money left the drawer when the advance was paid.
 * 'advance_cleared' records the non-cash recovery so the ledger replay nets to
 * zero without inflating cash-recovery figures.
 *
 * THE REPAIR
 * For every payroll run that deducted an advance, insert the matching
 * advance_cleared row and add the amount back to the employee's current_payable.
 */

module.exports = {
  up: async (queryInterface) => {
    const dialect = queryInterface.sequelize.getDialect();

    if (dialect === 'postgres') {
      await queryInterface.sequelize.query(
        `DO $$ BEGIN
           ALTER TYPE enum_employee_transactions_type ADD VALUE IF NOT EXISTS 'advance_cleared';
         EXCEPTION WHEN duplicate_object THEN NULL;
         END $$;`,
      ).catch(async () => {
        try {
          await queryInterface.sequelize.query(
            `ALTER TYPE "enum_employee_transactions_type" ADD VALUE IF NOT EXISTS 'advance_cleared'`,
          );
        } catch (_) { /* already present */ }
      });
    } else {
      console.warn(`  skipped: 'advance_cleared' enum value not added on dialect '${dialect}'`);
    }

    // ── Repair historical payroll runs ──────────────────────────────────────
    // Adding the enum value and using it in the same transaction is not allowed
    // on older Postgres, so the backfill runs as its own statement batch.
    const [rows] = await queryInterface.sequelize.query(`
      SELECT p.id            AS payroll_id,
             p.employee_id   AS employee_id,
             p.month         AS month,
             p.advance_deduction AS advance_deduction,
             e.shop_id       AS shop_id,
             -- created_by is NOT NULL on employee_transactions, so attribute the
             -- backfilled row to whoever ran the payroll; fall back to any user
             -- in the same shop.
             COALESCE(
               (SELECT et.created_by FROM employee_transactions et
                 WHERE et.related_payroll_id = p.id AND et.created_by IS NOT NULL
                 ORDER BY et.id LIMIT 1),
               (SELECT u.id FROM users u WHERE u.shop_id = e.shop_id ORDER BY u.id LIMIT 1)
             ) AS created_by
      FROM payroll p
      JOIN employees e ON e.id = p.employee_id
      WHERE p.advance_deduction IS NOT NULL
        AND p.advance_deduction > 0
    `);

    if (!rows.length) return;

    // Skip any payroll run already repaired, so this is safe to re-run.
    const [already] = await queryInterface.sequelize.query(`
      SELECT related_payroll_id FROM employee_transactions
      WHERE type = 'advance_cleared' AND related_payroll_id IS NOT NULL
    `).catch(() => [[]]);
    const repaired = new Set((already || []).map(r => String(r.related_payroll_id)));

    let fixed = 0;
    let skippedNoUser = 0;
    for (const row of rows) {
      if (repaired.has(String(row.payroll_id))) continue;
      if (!row.created_by) {
        // No user to attribute the row to; leave this payroll alone rather than
        // fail the whole migration.
        skippedNoUser += 1;
        continue;
      }

      await queryInterface.sequelize.query(
        `INSERT INTO employee_transactions
           (shop_id, employee_id, date, type, amount, method, related_payroll_id, notes, created_by, created_at, updated_at)
         SELECT :shopId, :employeeId, COALESCE(p.created_at, CURRENT_TIMESTAMP), 'advance_cleared', :amount, NULL, :payrollId,
                :notes, :createdBy, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         FROM payroll p WHERE p.id = :payrollId`,
        {
          replacements: {
            shopId: row.shop_id,
            employeeId: row.employee_id,
            amount: row.advance_deduction,
            payrollId: row.payroll_id,
            createdBy: row.created_by,
            notes: `Advance cleared against salary ${row.month} (backfilled)`,
          },
        },
      );

      await queryInterface.sequelize.query(
        `UPDATE employees
            SET current_payable = ROUND(COALESCE(current_payable, 0) + :amount, 2)
          WHERE id = :employeeId`,
        { replacements: { amount: row.advance_deduction, employeeId: row.employee_id } },
      );
      fixed += 1;
    }

    if (fixed) {
      console.log(`  repaired ${fixed} payroll run(s): advance recovery credited back to current_payable`);
    }
    if (skippedNoUser) {
      console.warn(`  skipped ${skippedNoUser} payroll run(s) with no attributable user — re-run after users exist`);
    }
  },

  down: async (queryInterface) => {
    const [rows] = await queryInterface.sequelize.query(`
      SELECT employee_id, amount FROM employee_transactions WHERE type = 'advance_cleared'
    `).catch(() => [[]]);

    for (const row of rows || []) {
      await queryInterface.sequelize.query(
        `UPDATE employees SET current_payable = ROUND(COALESCE(current_payable, 0) - :amount, 2) WHERE id = :employeeId`,
        { replacements: { amount: row.amount, employeeId: row.employee_id } },
      );
    }
    await queryInterface.sequelize.query(`DELETE FROM employee_transactions WHERE type = 'advance_cleared'`);
  },
};
