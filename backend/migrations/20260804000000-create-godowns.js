'use strict';

/**
 * Guarded because 20260709000004-align-schema-with-models.js walks every model
 * and adds columns the schema is missing — which includes branches.godown_id
 * from models/branch.js. On a fresh database that runs first, so the
 * unguarded addColumn below used to abort the whole migration chain with
 * `column "godown_id" of relation "branches" already exists`.
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
  up: async (queryInterface, Sequelize) => {
    if (!(await tableExists(queryInterface, 'godowns'))) {
    await queryInterface.createTable('godowns', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      shop_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'shops',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      code: {
        type: Sequelize.STRING,
        allowNull: true
      },
      address: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      phone: {
        type: Sequelize.STRING,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('active', 'disabled'),
        defaultValue: 'active'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });
    }

    const branchesDesc = await queryInterface.describeTable('branches');
    if (!branchesDesc.godown_id) {
      await queryInterface.addColumn('branches', 'godown_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'godowns',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const branchesDesc = await queryInterface.describeTable('branches');
    if (branchesDesc.godown_id) await queryInterface.removeColumn('branches', 'godown_id');
    if (await tableExists(queryInterface, 'godowns')) await queryInterface.dropTable('godowns');
  }
};
