'use strict';

/** BOD Investment + Current Cash/Bank + Due-from-BOD tracking. */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('board_members');

    const addCol = async (name, spec) => {
      if (!table[name]) await queryInterface.addColumn('board_members', name, spec);
    };

    await addCol('investment_balance', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await addCol('current_cash_balance', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await addCol('current_bank_balance', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await addCol('due_from_balance', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await addCol('due_from_coa_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'chart_of_accounts', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await addCol('current_cash_coa_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'chart_of_accounts', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await addCol('current_bank_coa_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'chart_of_accounts', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // 8B: existing BOD balances → Current Cash; Investment starts at 0
    await queryInterface.sequelize.query(`
      UPDATE board_members
      SET
        current_cash_balance = COALESCE(current_balance, 0),
        investment_balance = 0,
        due_from_balance = 0
    `);

    const txnTable = await queryInterface.describeTable('board_member_transactions');
    if (!txnTable.voucher_id) {
      await queryInterface.addColumn('board_member_transactions', 'voucher_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'vouchers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
    if (!txnTable.account_bucket) {
      await queryInterface.addColumn('board_member_transactions', 'account_bucket', {
        type: Sequelize.STRING(32),
        allowNull: true,
      });
    }
    if (!txnTable.fund_origin) {
      await queryInterface.addColumn('board_member_transactions', 'fund_origin', {
        type: Sequelize.STRING(16),
        allowNull: true,
        comment: 'company | personal — tracks Current wallet funding for transfer posting',
      });
    }
    if (!txnTable.counterpart_method) {
      await queryInterface.addColumn('board_member_transactions', 'counterpart_method', {
        type: Sequelize.STRING(16),
        allowNull: true,
      });
    }
    if (!txnTable.counterpart_bank_account_id) {
      await queryInterface.addColumn('board_member_transactions', 'counterpart_bank_account_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'bank_accounts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }

    // Extend ENUM for new transaction types (PostgreSQL)
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === 'postgres') {
      const values = [
        'personal_deposit',
        'transfer_to_capital',
        'transfer_from_capital',
        'current_payment',
        'current_receipt',
      ];
      for (const v of values) {
        await queryInterface.sequelize.query(
          `DO $$ BEGIN
             ALTER TYPE enum_board_member_transactions_type ADD VALUE IF NOT EXISTS '${v}';
           EXCEPTION WHEN duplicate_object THEN NULL;
           END $$;`,
        ).catch(async () => {
          // Some PG versions / enum names differ — try raw add
          try {
            await queryInterface.sequelize.query(
              `ALTER TYPE "enum_board_member_transactions_type" ADD VALUE IF NOT EXISTS '${v}'`,
            );
          } catch (_) { /* ignore if already exists */ }
        });
      }
    }
  },

  async down(queryInterface) {
    const cols = [
      'investment_balance', 'current_cash_balance', 'current_bank_balance', 'due_from_balance',
      'due_from_coa_id', 'current_cash_coa_id', 'current_bank_coa_id',
    ];
    for (const c of cols) {
      try { await queryInterface.removeColumn('board_members', c); } catch (_) { /* */ }
    }
    const txnCols = [
      'voucher_id', 'account_bucket', 'fund_origin', 'counterpart_method', 'counterpart_bank_account_id',
    ];
    for (const c of txnCols) {
      try { await queryInterface.removeColumn('board_member_transactions', c); } catch (_) { /* */ }
    }
  },
};
