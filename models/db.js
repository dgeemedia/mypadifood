// models/db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    // Render requires SSL. For local dev set rejectUnauthorized: false.
    rejectUnauthorized: false
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
