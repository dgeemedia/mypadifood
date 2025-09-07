// models/db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },

  // Tune pool for managed DBs (Render limits connections)
  max: 4,                     // keep this small (4 clients)
  min: 0,
  idleTimeoutMillis: 30000,   // close idle clients after 30s
  connectionTimeoutMillis: 20000, // wait up to 20s for a client
  keepAlive: true
});

pool.on('error', (err) => {
  console.error('Unexpected pg pool error', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
