const mysql = require('mysql2/promise');
require('dotenv').config();
const db = require('../../models');

async function syncDatabase() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'esms_db';
  const dialect = process.env.DB_DIALECT || 'mysql';

  try {
    if (dialect === 'sqlite') {
      console.log('Using SQLite database. Skipping MySQL database creation step...');
    } else {
      console.log(`Connecting to MySQL server at ${host}...`);
      // Create connection without database to run CREATE DATABASE
      const connection = await mysql.createConnection({ host, user, password });
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\`;`);
      console.log(`Database "${database}" verified/created successfully.`);
      await connection.end();
    }

    // Sync models using Sequelize
    console.log('Synchronizing database models with Sequelize...');
    await db.sequelize.sync({ alter: true });
    console.log('Database synchronization completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error synchronizing database:', error);
    process.exit(1);
  }
}

syncDatabase();
