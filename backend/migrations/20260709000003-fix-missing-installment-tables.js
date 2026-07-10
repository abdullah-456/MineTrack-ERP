'use strict';

/**
 * FIX for a pre-existing deployment bug: the original create-all-tables
 * migration never created `installment_schedule` or `installment_payments`.
 * Existing dev databases have them only because they were created by
 * sequelize.sync() during early development — a FRESH install from
 * migrations alone had broken installments.
 *
 * Guarded: only creates the tables when missing, so it is a no-op on
 * databases that already have them.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('installment_schedule')) {
      await queryInterface.createTable('installment_schedule', {
        id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        plan_id:        { type: DataTypes.INTEGER, allowNull: false, references: { model: 'installment_plans', key: 'id' } },
        installment_no: { type: DataTypes.INTEGER, allowNull: false },
        due_date:       { type: DataTypes.DATE,    allowNull: false },
        due_amount:     { type: DataTypes.DECIMAL(15, 2), allowNull: false },
        status:         { type: DataTypes.STRING,  allowNull: false, defaultValue: 'pending' }, // pending|paid|overdue
        late_fee:       { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        created_at:     { type: DataTypes.DATE, allowNull: false },
        updated_at:     { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex('installment_schedule', ['plan_id', 'status'], { name: 'inst_sched_plan_status_idx' });
    }

    if (!tables.includes('installment_payments')) {
      await queryInterface.createTable('installment_payments', {
        id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        schedule_id:      { type: DataTypes.INTEGER, allowNull: false, references: { model: 'installment_schedule', key: 'id' } },
        amount_paid:      { type: DataTypes.DECIMAL(15, 2), allowNull: false },
        payment_date:     { type: DataTypes.DATE, allowNull: false },
        method:           { type: DataTypes.STRING, allowNull: false, defaultValue: 'cash' },
        late_fee_charged: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        voucher_id:       { type: DataTypes.INTEGER, allowNull: true },
        created_at:       { type: DataTypes.DATE, allowNull: false },
        updated_at:       { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex('installment_payments', ['schedule_id'], { name: 'inst_pay_schedule_idx' });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('installment_payments').catch(() => {});
    await queryInterface.dropTable('installment_schedule').catch(() => {});
  },
};
