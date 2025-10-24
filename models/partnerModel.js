// models/partnerModel.js
const { pool } = require('../database/database');

async function getApproved(limit = 12) {
  const { rows } = await pool.query(
    `SELECT id, name, COALESCE(logo_url,'') as logo_url, COALESCE(website,'') as website
     FROM partners
     ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

module.exports = { getApproved };
