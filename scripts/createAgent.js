// scripts/createAgent.js
// Usage:
//   node scripts/createAgent.js <email> <password> [full name] [state] [lga]
// Example:
//   node scripts/createAgent.js agent@example.com 'AgentP@ss1' 'Agent Name' 'Lagos' 'Ikeja'

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

function makePool() {
  const connectionString = process.env.DATABASE_URL || null;
  const wantsSSL =
    (process.env.PGSSLMODE && process.env.PGSSLMODE.toLowerCase() === 'require') ||
    (process.env.FORCE_SSL && process.env.FORCE_SSL.toLowerCase() === 'true');

  if (connectionString) {
    const poolOpts = { connectionString };
    if (wantsSSL) poolOpts.ssl = { rejectUnauthorized: false };
    return new Pool(poolOpts);
  }

  const host = process.env.PGHOST;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE;
  const port = process.env.PGPORT ? Number(process.env.PGPORT) : undefined;

  if (!host || !user || typeof password === 'undefined' || !database) return null;
  const poolOpts = { host, user, password: String(password), database, port };
  if (wantsSSL) poolOpts.ssl = { rejectUnauthorized: false };
  return new Pool(poolOpts);
}

async function main() {
  const argv = process.argv.slice(2);
  const email = argv[0];
  const password = argv[1];
  const name = argv[2] || 'Agent';
  const region_state = argv[3] || null;
  const region_lga = argv[4] || null;

  if (!email || !password) {
    console.error('Usage: node createAgent.js <email> <password> [full name] [state] [lga]');
    process.exit(2);
  }

  const pool = makePool();
  if (!pool) {
    console.error('No Postgres connection configuration found. Ensure DATABASE_URL or PG env vars are set.');
    process.exit(3);
  }

  try {
    await pool.query('SELECT 1');

    const pwPattern = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9])(?!.*\s).{8,}$/;
    if (!pwPattern.test(password)) {
      console.error('Password does not meet complexity requirements. Use at least 8 chars, one uppercase, one number and one special char.');
      process.exit(4);
    }

    const saltRounds = Number(process.env.SALT_ROUNDS || 12);
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const sql = `
      INSERT INTO admins (name, email, password_hash, role, region_state, region_lga, active, created_at)
      VALUES ($1,$2,$3,'agent',$4,$5, TRUE, NOW())
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        region_state = EXCLUDED.region_state,
        region_lga = EXCLUDED.region_lga,
        active = TRUE
      RETURNING id, email, role, region_state, region_lga, created_at;
    `;
    const params = [name, email, passwordHash, region_state, region_lga];
    const { rows } = await pool.query(sql, params);

    if (rows && rows.length) {
      console.log('Agent created/updated:');
      console.log({
        id: rows[0].id,
        email: rows[0].email,
        role: rows[0].role,
        region_state: rows[0].region_state,
        region_lga: rows[0].region_lga,
        created_at: rows[0].created_at,
      });
    } else {
      console.log('Agent upsert completed (no rows returned).');
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Failed to create/update agent:', err && err.message ? err.message : err);
    try { await pool.end(); } catch (_) {}
    process.exit(1);
  }
}

main();

/*
node scripts/createAgent.js agent@example.com 'AgentP@ss1' 'Agent Name' 'Lagos' 'Ikeja'
*/