// models/testimonialModel.js
const { pool } = require('../database/database');

async function getApproved(limit = 12) {
  const { rows } = await pool.query(
    `SELECT id, name, COALESCE(photo_url,'') as photo_url, city, quote
     FROM testimonials
     WHERE approved = true
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

module.exports = { getApproved };
