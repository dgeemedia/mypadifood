// scripts/prune_sessions.js
require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected. Pruning sessions...');
    // connect-pg-simple stores expire as bigint epoch seconds (check your session table)
    await client.query('DELETE FROM "session" WHERE expire < extract(epoch from now())::bigint');
    console.log('Prune completed.');
    await client.end();
  } catch (err) {
    console.error('Prune error:', err);
    try { await client.end(); } catch(e){};
    process.exit(1);
  }
}

run();
// Usage: node scripts/prune_sessions.js