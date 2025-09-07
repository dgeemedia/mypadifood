// scripts/delete_user_by_email.js
require('dotenv').config();
const { Client } = require('pg');

(async function() {
  const email = process.argv[2];
  if (!email) {
    console.log('Usage: node scripts/delete_user_by_email.js email@example.com');
    process.exit(1);
  }
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    await client.query('DELETE FROM users WHERE email=$1', [email]);
    console.log('Deleted user with email', email);
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error(err);
    try { await client.end(); } catch(e) {}
    process.exit(1);
  }
})();

// Usage: node scripts/delete_user_by_email.js "email@example.com"