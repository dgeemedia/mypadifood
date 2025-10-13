// scripts/createSuperAdmin.js
// Usage:
//   node scripts/createSuperAdmin.js <email> <password> [full name]
// Example:
//   node scripts/createSuperAdmin.js super@admin.local 'Ellaberry1@' 'Super Admin'

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

function makePool() {
  const connectionString = process.env.DATABASE_URL || null;

  const wantsSSL =
    (process.env.PGSSLMODE &&
      process.env.PGSSLMODE.toLowerCase() === 'require') ||
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

  if (!host || !user || typeof password === 'undefined' || !database) {
    return null;
  }

  const poolOpts = { host, user, password: String(password), database, port };
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
    process.exit(2);
  }

  const pool = makePool();
  if (!pool) {
    console.error(
      'No Postgres connection configuration found. Ensure DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE are set.'
    );
    process.exit(3);
  }

  try {
    await pool.query('SELECT 1');

    // enforce same password policy used in app
    const pwPattern =
      /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9])(?!.*\s).{8,}$/;
    if (!pwPattern.test(password)) {
      console.error(
        'Password does not meet complexity requirements. Use at least 8 chars, one uppercase, one number and one special char.'
      );
      process.exit(4);
    }

    const saltRounds = Number(process.env.SALT_ROUNDS || 12);
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

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error(
      'Failed to create/update super admin:',
      err && err.message ? err.message : err
    );
    if (err && /password/i.test(err.message || '')) {
      console.error(
        'Hint: check DATABASE_URL / PGPASSWORD in your .env and ensure password is correct.'
      );
    }
    if (err && /SSL/i.test(err.message || '')) {
      console.error(
        'Hint: if your DB requires SSL, set PGSSLMODE=require in .env.'
      );
    }
    try {
      await pool.end();
    } catch (_) {}
    process.exit(1);
  }
}

main();

/*
node scripts/createSuperAdmin.js super@admin.local 'Superadmin1@' 'George Olumah'
*/
