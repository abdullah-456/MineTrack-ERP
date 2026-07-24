'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Create gate_passes table
    await queryInterface.createTable('gate_passes', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      shop_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      branch_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      gate_pass_number: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      sale_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      customer_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      customer_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      customer_phone: {
        type: Sequelize.STRING,
        allowNull: true
      },
      gate_pass_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      type: {
        type: Sequelize.ENUM('sale_dispatch', 'pre_sale', 'transfer', 'return', 'other'),
        defaultValue: 'sale_dispatch',
        allowNull: false
      },
      vehicle_no: {
        type: Sequelize.STRING,
        allowNull: true
      },
      driver_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      driver_phone: {
        type: Sequelize.STRING,
        allowNull: true
      },
      remarks: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('active', 'cancelled'),
        defaultValue: 'active',
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // 2. Create gate_pass_items table
    await queryInterface.createTable('gate_pass_items', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      gate_pass_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'gate_passes',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      product_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      quantity: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: false
      },
      unit: {
        type: Sequelize.STRING,
        defaultValue: 'kg'
      },
      notes: {
        type: Sequelize.STRING,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('gate_pass_items');
    await queryInterface.dropTable('gate_passes');
  }
};
