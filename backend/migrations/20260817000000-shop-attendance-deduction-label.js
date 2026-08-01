'use strict';

/**
 * shops.attendance_deduction_label — lets a shop rename the "Deduct for
 * absences" checkbox and payslip line to whatever term they already use
 * internally (e.g. "LOP Deduction", "Absence Cut"). Nullable: no value means
 * "use the translated default", exactly like books_start_date's fallback in
 * utils/fiscalYear.js. Edited via the existing PUT /company endpoint
 * (frontend/src/pages/admin/CompanyProfile.jsx) rather than a new settings
 * surface — that endpoint is already the shop's general profile/settings form.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('shops', 'attendance_deduction_label', {
      type: Sequelize.STRING(60),
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('shops', 'attendance_deduction_label');
  },
};
