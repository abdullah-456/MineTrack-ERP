'use strict';

/**
 * FRESH-INSTALL SCHEMA ALIGNMENT
 *
 * The original create-all-tables migration is missing a number of tables and
 * columns that the models define (the dev database only has them because
 * sequelize.sync() created them during early development). On a fresh install
 * from migrations, features like stock adjustments, purchase invoices from
 * stock receipts, and the customer_type field were broken.
 *
 * This migration reads the model definitions and creates ONLY what is missing:
 *   - any model table that doesn't exist          → created from the model
 *   - any model column missing from its table     → added from the model
 *
 * It is fully guarded: on databases that already have everything (like the
 * long-running dev DB), it is a no-op. It never drops or alters anything.
 */
module.exports = {
  async up(queryInterface) {
    const db = require('../models');

    for (const name of Object.keys(db)) {
      const model = db[name];
      if (!model || !model.tableName || !model.rawAttributes) continue;

      let table = null;
      try {
        table = await queryInterface.describeTable(model.tableName);
      } catch {
        table = null; // table missing
      }

      if (!table) {
        // Create the whole table from the model definition.
        await model.sync();
        continue;
      }

      // Table exists — add any missing columns.
      for (const [attr, def] of Object.entries(model.rawAttributes)) {
        const col = def.field || attr;
        if (table[col]) continue;
        if (def.type === undefined) continue; // virtual fields
        await queryInterface.addColumn(model.tableName, col, {
          type: def.type,
          allowNull: true, // additive & safe on populated tables
          defaultValue: def.defaultValue !== undefined ? def.defaultValue : null,
        });
      }
    }
  },

  async down() {
    // Intentionally irreversible: this migration only fills schema gaps that
    // the application requires to run. Rolling it back would break the app.
  },
};
