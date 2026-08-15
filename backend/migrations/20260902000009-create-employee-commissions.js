'use strict';

/**
 * Deferred (postponed) truck-loading commission.
 *
 * calculateCommissionForMonth (utils/commissionHelpers.js) has always been
 * purely a live calculation — trucks/tons logged for a given month, re-derived
 * fresh every time, with nothing remembering whether a month's commission was
 * ever actually paid. That was fine while commission was always paid the same
 * month it was earned. It breaks the moment a shop wants to skip a month
 * (out of budget) and pay it later: with nothing persisted, the skipped
 * month's commission was simply never seen again — the NEXT run only ever
 * looked at ITS OWN month's truck-loading data, with no memory of the
 * one before it.
 *
 * This table is exclusively that memory, and exclusively for commission that
 * was explicitly postponed (a normal same-month payment never creates a row
 * here — Payroll.commission already records that). One row per employee per
 * EARNED month, frozen at the moment it was deferred so a later change to
 * truck-loading data can't silently move a figure the deferral already
 * promised. Stays 'deferred' until some later payroll run pays it off, at
 * which point it's linked to that run and marked 'paid' — never deleted, so
 * "which month funded this line on this payslip" stays answerable.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('employee_commissions', {
      id:               { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      shop_id:          { type: Sequelize.INTEGER, allowNull: false, references: { model: 'shops', key: 'id' }, onDelete: 'CASCADE' },
      employee_id:      { type: Sequelize.INTEGER, allowNull: false, references: { model: 'employees', key: 'id' }, onDelete: 'CASCADE' },
      // The month the commission was EARNED (truck-loading data it was
      // computed from) — not necessarily the month it eventually gets paid in.
      earned_month:     { type: Sequelize.STRING(7), allowNull: false }, // 'YYYY-MM'
      amount:           { type: Sequelize.DECIMAL(15, 2), allowNull: false },
      // Same compact breakdown text Payroll.commission_note stores, frozen at
      // defer time for the same reason the amount is.
      note:             { type: Sequelize.STRING(255), allowNull: true },
      status:           { type: Sequelize.ENUM('deferred', 'paid'), allowNull: false, defaultValue: 'deferred' },
      // Set together once a later payroll run folds this row's amount in.
      paid_payroll_id:  { type: Sequelize.INTEGER, allowNull: true, references: { model: 'payroll', key: 'id' }, onDelete: 'SET NULL' },
      paid_month:       { type: Sequelize.STRING(7), allowNull: true },
      created_by:       { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      created_at:       { type: Sequelize.DATE, allowNull: false },
      updated_at:       { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('employee_commissions', ['shop_id']);
    // The lookup every payroll run and every commission preview does: "what is
    // this employee still owed". Partial (status = 'deferred') so it stays
    // small and fast even after years of paid history accumulate.
    await queryInterface.addIndex('employee_commissions', ['employee_id', 'status'], {
      name: 'employee_commissions_employee_status_idx',
    });
    // One row per employee per earned month — re-deferring the same month must
    // update the existing row, never create a second one that would double it
    // when it's eventually paid off.
    await queryInterface.addIndex('employee_commissions', ['employee_id', 'earned_month'], {
      unique: true, name: 'employee_commissions_employee_month_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('employee_commissions');
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === 'postgres') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_employee_commissions_status";');
    }
  },
};
