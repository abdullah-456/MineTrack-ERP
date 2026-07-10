const dotenvResult = require('dotenv').config({ override: true });
const path = require('path');

const dialect = dotenvResult.parsed && Object.prototype.hasOwnProperty.call(dotenvResult.parsed, 'DB_DIALECT')
  ? process.env.DB_DIALECT
  : 'sqlite';

module.exports = {
  development: {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || null,
    database: process.env.DB_NAME || 'esms_db',
    host: process.env.DB_HOST || '127.0.0.1',
    dialect: dialect,
    storage: dialect === 'sqlite' ? path.join(__dirname, '..', 'database.sqlite') : undefined,
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
    storage: dialect === 'sqlite' ? path.join(__dirname, '..', 'database.sqlite') : undefined,
    define: {
      underscored: true,
      timestamps: true
    },
    logging: false
  },
  production: {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || null,
    database: process.env.DB_NAME || 'esms_db',
    host: process.env.DB_HOST || '127.0.0.1',
    dialect: dialect,
    storage: dialect === 'sqlite' ? path.join(__dirname, '..', 'database.sqlite') : undefined,
    define: {
      underscored: true,
      timestamps: true
    },
    logging: false
  }
};
