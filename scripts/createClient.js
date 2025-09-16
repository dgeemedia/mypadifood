// Usage: node scripts/createClient.js "Jane Doe" jane.doe@example.com "08012345678" "Ellaberry1@" "Lagos" "Ikeja" "10 Example St"
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

async function main() {
  const [ , , full_name, email, phone, password, state = null, lga = null, address = null ] = process.argv;
  if (!full_name || !email || !phone || !password) {
    console.error('Usage: node scripts/createClient.js "Full Name" email phone password [state] [lga] [address]');
    process.exit(2);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: (process.env.PGSSLMODE === 'require') ? { rejectUnauthorized: false } : false });
  try {
    const passwordHash = bcrypt.hashSync(password, 12);
    const sql = `
      INSERT INTO clients (full_name,email,phone,state,lga,address,password_hash,verified,wallet_balance,location_source)
      VALUES ($1,$2,$3,$4,$5,$6,$7,false,0,$8)
      RETURNING id;
    `;
    const { rows } = await pool.query(sql, [full_name, email, phone, state, lga, address, passwordHash, 'manual']);
    console.log('Created client id=', rows[0].id);
  } catch (err) {
    console.error('Error creating client:', err);
  } finally {
    await pool.end();
  }
}

main();
