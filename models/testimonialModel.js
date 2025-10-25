// models/testimonialModel.js
const { pool } = require('../database/database');

/**
 * Generic create function (allows approved flag).
 * Returns created row.
 */
async function create({ name, photo_url = null, city = null, quote, approved = false }) {
  const sql = `
    INSERT INTO testimonials (name, photo_url, city, quote, approved, created_at)
    VALUES ($1,$2,$3,$4,$5,NOW())
    RETURNING *;
  `;
  const { rows } = await pool.query(sql, [name, photo_url, city, quote, approved]);
  return rows[0] || null;
}

/**
 * Backwards-compatible helper that mirrors your prior createTestimonial API
 * (returns inserted id for minimal callers).
 */
async function createTestimonial({ name, photo_url = null, city = null, quote }) {
  const row = await create({ name, photo_url, city, quote, approved: false });
  return row ? row.id : null;
}

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

async function getPending(limit = 100) {
  const { rows } = await pool.query(
    `SELECT id, name, COALESCE(photo_url,'') as photo_url, city, quote, created_at
     FROM testimonials
     WHERE approved = false
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function approveById(id) {
  const { rows } = await pool.query(
    `UPDATE testimonials SET approved = true WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

async function deleteById(id) {
  const { rows } = await pool.query(
    `DELETE FROM testimonials WHERE id = $1 RETURNING id`,
    [id]
  );
  return rows[0] || null;
}

module.exports = {
  create,
  createTestimonial,
  getApproved,
  getPending,
  approveById,
  deleteById,
};
