// models/testimonialModel.js
const { pool } = require('../database/database');


async function createTestimonial({ name, photo_url = null, city = null, quote }) {
const sql = `
INSERT INTO testimonials (name, photo_url, city, quote, approved, created_at)
VALUES ($1,$2,$3,$4,false,NOW())
RETURNING id;
`;
const { rows } = await pool.query(sql, [name, photo_url, city, quote]);
return rows[0] || null;
}


async function getApproved(limit = 12) {
const { rows } = await pool.query(
`SELECT id, name, COALESCE(photo_url,'') AS photo_url, city, quote
FROM testimonials
WHERE approved = true
ORDER BY created_at DESC
LIMIT $1`,
[limit]
);
return rows;
}


module.exports = { createTestimonial, getApproved };