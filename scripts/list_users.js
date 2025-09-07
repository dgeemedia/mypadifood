// scripts/list_users.js
require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    const r = await client.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 50');
    console.table(r.rows);
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('Error listing users:', err.message || err);
    try { await client.end(); } catch(e) {}
    process.exit(1);
  }
}

run();
// Usage: node scripts/list_users.js