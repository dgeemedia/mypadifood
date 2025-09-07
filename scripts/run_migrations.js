// scripts/run_migrations.js
// Run: node scripts/run_migrations.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function run() {
  const sqlPath = path.join(__dirname, '..', 'migrations', 'init.sql');
  const seedPath = path.join(__dirname, '..', 'scripts', 'seed_vendors.sql');

  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL in .env');
    process.exit(1);
  }

  // Use SSL (Render requires SSL). For quick dev we set rejectUnauthorized: false.
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    if (!fs.existsSync(sqlPath)) {
      console.error('Migration file not found:', sqlPath);
      process.exit(1);
    }

    const sql = fs.readFileSync(sqlPath, { encoding: 'utf8' });
    console.log('Running migrations (init.sql)...');
    // Run the whole file. pg supports multi-statement through client.query.
    await client.query(sql);
    console.log('Migrations executed successfully.');

    if (fs.existsSync(seedPath)) {
      console.log('Found seed_vendors.sql — running seed...');
      const seedSql = fs.readFileSync(seedPath, { encoding: 'utf8' });
      await client.query(seedSql);
      console.log('Seed executed successfully.');
    } else {
      console.log('No seed_vendors.sql found — skipping seed step.');
    }

    console.log('All done. Closing DB connection.');
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('Error during migration:', err.message || err);
    try { await client.end(); } catch(e){/*ignore*/ }
    process.exit(1);
  }
}

run();
