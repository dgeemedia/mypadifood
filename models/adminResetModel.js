// models/adminResetModel.js
const { pool } = require('../database/database');

async function createToken(token, adminId, expiresAt = null, meta = {}) {
  const sql = `
    INSERT INTO admin_reset_tokens (token, admin_id, meta, expires_at, created_at)
    VALUES ($1, $2, $3, $4, NOW())
    RETURNING token, admin_id, meta, expires_at, created_at
  `;
  const { rows } = await pool.query(sql, [token, adminId, meta, expiresAt]);
  return rows[0] || null;
}

async function findToken(token) {
  const { rows } = await pool.query(
    'SELECT * FROM admin_reset_tokens WHERE token=$1',
    [token]
  );
  return rows[0] || null;
}

async function deleteToken(token) {
  await pool.query('DELETE FROM admin_reset_tokens WHERE token=$1', [token]);
  return true;
}

async function deleteTokensForAdmin(adminId) {
  await pool.query('DELETE FROM admin_reset_tokens WHERE admin_id=$1', [
    adminId,
  ]);
  return true;
}

module.exports = {
  createToken,
  findToken,
  deleteToken,
  deleteTokensForAdmin,
};
