// database/run-init.js
// Run the SQL file (init.sql) from Node using pg. Uses DATABASE_URL from .env
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function run() {
  const sqlPath = path.join(__dirname, 'init.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('init.sql not found at', sqlPath);
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Please set DATABASE_URL in .env');
    process.exit(1);
  }

  // SSL handling for Render
  const useSSL = process.env.PGSSLMODE === 'require' || (connectionString && connectionString.includes('render.com'));
  const client = new Client({
    connectionString,
    ...(useSSL ? { ssl: { rejectUnauthorized: false } } : {})
  });

  try {
    await client.connect();
    console.log('Connected to DB — running init.sql (this may take a few seconds)...');

    // Important: some SQL clients disallow multiple statements per query.
    // node-postgres supports sending the whole SQL string and will run it.
    await client.query(sql);
    console.log('init.sql executed successfully.');
  } catch (err) {
    console.error('Error running init.sql:', err);
  } finally {
    await client.end();
    process.exit(0);
  }
}

run();
