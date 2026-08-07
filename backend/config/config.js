const dotenvResult = require('dotenv').config({ override: true });
const path = require('path');

const dialect = dotenvResult.parsed && Object.prototype.hasOwnProperty.call(dotenvResult.parsed, 'DB_DIALECT')
  ? process.env.DB_DIALECT
  : 'sqlite';

// Defaults to a file next to the app (fine for local dev). Set DB_STORAGE_PATH
// to point at a mounted persistent volume instead (e.g. /data/database.sqlite)
// so the SQLite file survives container restarts.
const sqliteStorage = dialect === 'sqlite'
  ? (process.env.DB_STORAGE_PATH || path.join(__dirname, '..', 'database.sqlite'))
  : undefined;

// Local dev against a Postgres URL (e.g. a Neon branch) works the same way
// production does; falls back to individual DB_* vars for sqlite/local Postgres.
const devUsesUrl = dialect === 'postgres' && !!process.env.DATABASE_URL;

module.exports = {
  development: {
    ...(devUsesUrl
      ? {
        use_env_variable: 'DATABASE_URL',
        dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
      }
      : {
        username: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || null,
        database: process.env.DB_NAME || 'esms_db',
        host: process.env.DB_HOST || '127.0.0.1',
      }),
    dialect: dialect,
    storage: sqliteStorage,
    define: {
      underscored: true,
      timestamps: true
    },
    logging: false
  },
  test: {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || null,
    database: process.env.DB_NAME || 'esms_db_test',
    host: process.env.DB_HOST || '127.0.0.1',
    dialect: dialect,
    storage: sqliteStorage,
    define: {
      underscored: true,
      timestamps: true
    },
    logging: false
  },
  production: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    define: { underscored: true, timestamps: true },
    logging: false,
  }
};
