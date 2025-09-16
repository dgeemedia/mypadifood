// scripts/check-db.js
// Simple DB check: reads DATABASE_URL from .env, connects with SSL if needed,
// and prints the list of public tables.

require('dotenv').config();
const { Pool } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Please set DATABASE_URL in .env');
    process.exit(1);
  }

  const useSSL = process.env.PGSSLMODE === 'require' || connectionString.includes('render.com');
  const pool = new Pool({
    connectionString,
    ...(useSSL ? { ssl: { rejectUnauthorized: false } } : {})
  });

  try {
    await pool.connect();
    console.log('Connected to DB. Listing public tables:');
    const res = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;`);
    console.table(res.rows);
  } catch (err) {
    console.error('DB ERR', err);
  } finally {
    await pool.end();
  }
}

main();
