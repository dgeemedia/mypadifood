// models/adminModel.js
// Admins: lookup/create and simple counters used by dashboard.

const { pool } = require('../database/database');

/**
 * Find admin by email.
 */
async function findByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM admins WHERE email=$1', [
    email,
  ]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await pool.query(
    'SELECT id,name,email,role FROM admins WHERE id=$1',
    [id]
  );
  return rows[0] || null;
}

/**
 * Create admin record (used by createAdmin and createSuperAdmin script).
 */
async function createAdmin({
  name,
  email,
  password_hash,
  role = 'agent',
  region_state = null,
  region_lga = null,
}) {
  const sql = `
    INSERT INTO admins (name,email,password_hash,role,region_state,region_lga,active,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,TRUE,NOW())
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      password_hash = EXCLUDED.password_hash,
      role = EXCLUDED.role,
      active = TRUE
    RETURNING id,email,role,created_at;
  `;
  const { rows } = await pool.query(sql, [
    name,
    email,
    password_hash,
    role,
    region_state,
    region_lga,
  ]);
  return rows[0];
}

/**
 * Dashboard counters.
 */
async function countPendingVendors() {
  const { rows } = await pool.query(
    "SELECT count(*)::int AS count FROM vendors WHERE status='pending'"
  );
  return rows[0].count;
}
async function countPendingOrders() {
  const { rows } = await pool.query(
    "SELECT count(*)::int AS count FROM orders WHERE status IN ('pending','accepted')"
  );
  return rows[0].count;
}

async function countPendingRiders() {
  const { rows } = await pool.query(
    "SELECT count(*)::int AS count FROM riders WHERE status='pending'"
  );
  return rows[0].count;
}

async function updatePassword(adminId, password_hash) {
  const { rows } = await pool.query(
    'UPDATE admins SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email',
    [password_hash, adminId]
  );
  return rows[0] || null;
}

async function countPendingTestimonials() {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM testimonials WHERE approved = false'
  );
  return rows[0].count;
}

async function countPartners() {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM partners'
  );
  return rows[0].count;
}

module.exports = {
  findByEmail,
  findById,
  createAdmin,
  countPendingVendors,
  countPendingOrders,
  countPendingRiders,
  countPendingTestimonials,
  countPartners,
  updatePassword,
};
