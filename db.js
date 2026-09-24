// db.js
const mysql = require('mysql2');
require('dotenv').config();

// Determine if connecting to SSL-required cloud host (like Aiven)
const isCloudDB = process.env.DB_HOST && !process.env.DB_HOST.includes('localhost');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'sumusa_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: isCloudDB ? { rejectUnauthorized: false } : false
});

module.exports = pool.promise();