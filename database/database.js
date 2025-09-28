// database/database.js
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

// Render/Heroku style: require SSL (but disable strict cert check for convenience)
const useSSL =
  process.env.PGSSLMODE === "require" ||
  (connectionString && connectionString.includes("render.com"));

const pool = new Pool({
  connectionString,
  // only pass ssl when needed; disable rejectUnauthorized to avoid CA issues on Render
  ...(useSSL ? { ssl: { rejectUnauthorized: false } } : {}),
});

module.exports = { pool };
