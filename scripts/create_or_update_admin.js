// scripts/create_or_update_admin.js
// Usage: node scripts/create_or_update_admin.js "Display Name" "email@example.com" "NewPassword123!"
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

async function run() {
  const [,, name, email, password] = process.argv;
  if (!name || !email || !password) {
    console.log('Usage: node scripts/create_or_update_admin.js "Name" "email" "password"');
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const hashed = await bcrypt.hash(password, 10);

    // Check if user exists
    const find = await client.query('SELECT id, email, role FROM users WHERE email = $1', [email]);
    if (find.rowCount > 0) {
      // Update existing user: set password_hash and role=admin
      const id = find.rows[0].id;
      await client.query(
        'UPDATE users SET name=$1, password_hash=$2, role=$3 WHERE id=$4',
        [name, hashed, 'admin', id]
      );
      console.log(`Updated existing user (${email}) to admin.`);
    } else {
      // Insert new admin
      const insertSql = `INSERT INTO users (name, email, phone, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING *`;
      const r = await client.query(insertSql, [name, email, null, hashed, 'admin']);
      console.log('Created admin:', r.rows[0]);
    }

    await client.end();
    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Error creating/updating admin:', err.message || err);
    try { await client.end(); } catch(e) {}
    process.exit(1);
  }
}

run();
// node scripts/create_or_update_admin.js "Display Name" "email@example.com" "NewPassword123!"