'use strict';

/** Expanded employee profile fields for full create form. */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('employees');
    const add = async (name, spec) => {
      if (!table[name]) await queryInterface.addColumn('employees', name, spec);
    };

    await add('employment_id', { type: Sequelize.STRING(40), allowNull: true });
    await add('father_name', { type: Sequelize.STRING(120), allowNull: true });
    await add('gender', { type: Sequelize.STRING(20), allowNull: true });
    await add('city', { type: Sequelize.STRING(100), allowNull: true });
    await add('cnic_expiry', { type: Sequelize.DATEONLY, allowNull: true });
    await add('date_of_birth', { type: Sequelize.DATEONLY, allowNull: true });
    await add('age', { type: Sequelize.INTEGER, allowNull: true });
    await add('place_of_birth', { type: Sequelize.STRING(120), allowNull: true });
    await add('marital_status', { type: Sequelize.STRING(20), allowNull: true });
    await add('religion', { type: Sequelize.STRING(60), allowNull: true });
    await add('language', { type: Sequelize.STRING(60), allowNull: true });
    await add('home_tel', { type: Sequelize.STRING(40), allowNull: true });
    await add('emergency_name', { type: Sequelize.STRING(120), allowNull: true });
    await add('emergency_relation', { type: Sequelize.STRING(60), allowNull: true });
    await add('emergency_cell', { type: Sequelize.STRING(40), allowNull: true });
    await add('emergency_residence', { type: Sequelize.STRING(40), allowNull: true });
    await add('education_institute', { type: Sequelize.STRING(160), allowNull: true });
    await add('education_degree', { type: Sequelize.STRING(120), allowNull: true });
    await add('education_specialization', { type: Sequelize.STRING(120), allowNull: true });
    await add('education_grade', { type: Sequelize.STRING(60), allowNull: true });
    await add('education_year', { type: Sequelize.STRING(10), allowNull: true });
    await add('experience', { type: Sequelize.JSONB, allowNull: true, defaultValue: [] });
    await add('dependants', { type: Sequelize.JSONB, allowNull: true, defaultValue: [] });
    await add('remarks', { type: Sequelize.TEXT, allowNull: true });
    await add('hr_remarks', { type: Sequelize.TEXT, allowNull: true });

    // Backfill employment_id for existing rows
    await queryInterface.sequelize.query(`
      UPDATE employees e
      SET employment_id = 'EMP-' || e.shop_id || '-' || LPAD(e.id::text, 4, '0')
      WHERE employment_id IS NULL
    `);

    try {
      await queryInterface.addIndex('employees', ['shop_id', 'employment_id'], {
        unique: true,
        name: 'employees_shop_employment_id_unique',
      });
    } catch (_) { /* already exists */ }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeIndex('employees', 'employees_shop_employment_id_unique');
    } catch (_) { /* */ }
    const cols = [
      'employment_id', 'father_name', 'gender', 'city', 'cnic_expiry', 'date_of_birth', 'age',
      'place_of_birth', 'marital_status', 'religion', 'language', 'home_tel',
      'emergency_name', 'emergency_relation', 'emergency_cell', 'emergency_residence',
      'education_institute', 'education_degree', 'education_specialization', 'education_grade', 'education_year',
      'experience', 'dependants', 'remarks', 'hr_remarks',
    ];
    for (const c of cols) {
      try { await queryInterface.removeColumn('employees', c); } catch (_) { /* */ }
    }
  },
};
