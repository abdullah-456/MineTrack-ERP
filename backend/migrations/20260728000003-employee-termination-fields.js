'use strict';

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
    if (!(await tableExists(queryInterface, 'employees'))) return;
    const { DataTypes } = Sequelize;
    const table = await queryInterface.describeTable('employees');
    if (!table.terminated_at) {
      await queryInterface.addColumn('employees', 'terminated_at', {
        type: DataTypes.DATE,
        allowNull: true,
      });
    }
    if (!table.termination_notes) {
      await queryInterface.addColumn('employees', 'termination_notes', {
        type: DataTypes.TEXT,
        allowNull: true,
      });
    }
  },

  down: async (queryInterface) => {
    if (!(await tableExists(queryInterface, 'employees'))) return;
    const table = await queryInterface.describeTable('employees');
    if (table.termination_notes) await queryInterface.removeColumn('employees', 'termination_notes');
    if (table.terminated_at) await queryInterface.removeColumn('employees', 'terminated_at');
  },
};
