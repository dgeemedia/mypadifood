// createSuperAdmin.js
// Usage:
//   node createSuperAdmin.js <email> <password> [full name]
// Example:
//   node scripts/createSuperAdmin.js super@admin.local 'Ellaberry1@' 'Super Admin'
//
// This script reads DATABASE_URL (or PG env vars) from .env via dotenv and
// connects with SSL when PGSSLMODE=require. It upserts the admin using bcryptjs.

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

function makePool() {
  // Prefer DATABASE_URL
  const connectionString = process.env.DATABASE_URL || null;

  // Determine ssl settings
  // If PGSSLMODE=require or FORCE_SSL set, enable ssl with rejectUnauthorized=false (common for hosted DBs)
  const wantsSSL =
    (process.env.PGSSLMODE &&
      process.env.PGSSLMODE.toLowerCase() === 'require') ||
    (process.env.FORCE_SSL && process.env.FORCE_SSL.toLowerCase() === 'true');

  if (connectionString) {
    const poolOpts = { connectionString };
    if (wantsSSL) {
      poolOpts.ssl = { rejectUnauthorized: false };
    }
    return new Pool(poolOpts);
  }

  // fallback to individual PG_* env vars
  const host = process.env.PGHOST;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE;
  const port = process.env.PGPORT ? Number(process.env.PGPORT) : undefined;

  if (!host || !user || typeof password === 'undefined' || !database) {
    return null;
  }

  const poolOpts = {
    host,
    user,
    password: String(password),
    database,
    port,
  };
  if (wantsSSL) poolOpts.ssl = { rejectUnauthorized: false };
  return new Pool(poolOpts);
}

async function main() {
  const argv = process.argv.slice(2);
  const email = argv[0] || process.env.SUPER_ADMIN_EMAIL || 'super@admin.local';
  const password = argv[1] || process.env.SUPER_ADMIN_PASSWORD;
  const name = argv[2] || 'Super Admin';

  if (!password) {
    console.error(
      'ERROR: No password provided. Pass as CLI arg or set SUPER_ADMIN_PASSWORD env var.'
    );
    console.error(
      'Example: node createSuperAdmin.js super@admin.local "Ellaberry1@" "Super Admin"'
    );
    process.exit(2);
  }

  const pool = makePool();
  if (!pool) {
    console.error('No Postgres connection configuration found.');
    console.error(
      'Make sure .env has DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE set.'
    );
    process.exit(3);
  }

  try {
    // Quick connectivity test
    await pool.query('SELECT 1');

    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const sql = `
      INSERT INTO admins (name, email, password_hash, role, active, created_at)
      VALUES ($1,$2,$3,'super', TRUE, NOW())
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        active = TRUE
      RETURNING id, email, role, created_at;
    `;

    const { rows } = await pool.query(sql, [name, email, passwordHash]);

    if (rows && rows.length) {
      console.log('Super admin created/updated:');
      console.log({
        id: rows[0].id,
        email: rows[0].email,
        role: rows[0].role,
        created_at: rows[0].created_at,
      });
    } else {
      console.log('Super admin upsert completed (no rows returned).');
    }

    // close pool
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error(
      'Failed to create/update super admin:',
      err && err.message ? err.message : err
    );
    // helpful hint on common SSL/auth errors
    if (err && /password/i.test(err.message || '')) {
      console.error(
        'Hint: check DATABASE_URL / PGPASSWORD in your .env and ensure password is a string.'
      );
    }
    if (err && /SSL/i.test(err.message || '')) {
      console.error(
        'Hint: if your DB requires SSL, ensure PGSSLMODE=require in .env (already set in your .env).'
      );
    }
    try {
      await pool.end();
    } catch (_) {}
    process.exit(1);
  }
}

main();
