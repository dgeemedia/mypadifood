// scripts/create_admin.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

async function run() {
  const [,, name, email, password] = process.argv;
  if (!name || !email || !password) {
    console.log('Usage: node scripts/create_admin.js "Name" "email" "password"');
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const hashed = await bcrypt.hash(password, 10);
    const sql = `INSERT INTO users (name, email, phone, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING *`;
    const r = await client.query(sql, [name, email, null, hashed, 'admin']);
    console.log('Created admin:', r.rows[0]);
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('Error creating admin', err.message || err);
    try { await client.end(); } catch(e) {}
    process.exit(1);
  }
}

run();
// node scripts/create_or_update_admin.js "Display Name" "email@example.com" "NewPassword123!"