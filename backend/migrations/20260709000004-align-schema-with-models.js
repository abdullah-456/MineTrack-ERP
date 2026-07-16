'use strict';

/**
 * FRESH-INSTALL SCHEMA ALIGNMENT (Postgres-safe, multi-pass)
 *
 * Creates any tables/columns the models define but the earlier migrations
 * didn't create. Postgres enforces foreign-key ordering (a child table can't
 * be created before its parent), so this runs in passes and tolerates
 * ordering errors until every parent exists. Guarded + idempotent: safe to
 * run more than once; never drops anything.
 */
module.exports = {
  async up(queryInterface) {
    const db = require('../models');

    const models = Object.keys(db)
      .map((n) => db[n])
      .filter((m) => m && m.tableName && m.rawAttributes);

    const tableExists = async (name) => {
      try {
        await queryInterface.describeTable(name);
        return true;
      } catch {
        return false;
      }
    };

    // ---- Create missing tables. Retry in passes so parents get created
    //      before children; swallow ordering errors until they resolve. ----
    let remaining = [];
    for (const model of models) {
      if (!(await tableExists(model.tableName))) remaining.push(model);
    }

    let lastCount = -1;
    while (remaining.length && remaining.length !== lastCount) {
      lastCount = remaining.length;
      const stillMissing = [];
      for (const model of remaining) {
        try {
          await model.sync();
        } catch (e) {
          // parent table not there yet — try again next pass
          stillMissing.push(model);
        }
      }
      remaining = [];
      for (const model of stillMissing) {
        if (!(await tableExists(model.tableName))) remaining.push(model);
      }
    }

    // Final attempt: surface a real error if something genuinely can't be made.
    for (const model of remaining) {
      await model.sync();
    }

    // ---- Add any missing columns to existing tables. ----
    for (const model of models) {
      let table;
      try {
        table = await queryInterface.describeTable(model.tableName);
      } catch {
        continue;
      }
      for (const [attr, def] of Object.entries(model.rawAttributes)) {
        const col = def.field || attr;
        if (table[col] || def.type === undefined) continue;
        try {
          await queryInterface.addColumn(model.tableName, col, {
            type: def.type,
            allowNull: true,
            defaultValue: def.defaultValue !== undefined ? def.defaultValue : null,
          });
        } catch (e) {
          console.log(`addColumn skipped ${model.tableName}.${col}: ${e.message}`);
        }
      }
    }
  },

  async down() {
    // Gap-filler only; nothing to reverse.
  },
};