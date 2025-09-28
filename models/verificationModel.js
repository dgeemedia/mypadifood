// models/verificationModel.js
const { pool } = require("../database/database");

/**
 * Insert a verification token.
 */
async function createToken(token, clientId, expiresAt) {
  await pool.query(
    "INSERT INTO verification_tokens (token, client_id, expires_at) VALUES ($1,$2,$3)",
    [token, clientId, expiresAt]
  );
}

/**
 * Find token row.
 */
async function findToken(token) {
  const { rows } = await pool.query(
    "SELECT token, client_id, expires_at, created_at FROM verification_tokens WHERE token=$1",
    [token]
  );
  return rows[0] || null;
}

/**
 * Delete token (consume).
 */
async function deleteToken(token) {
  await pool.query("DELETE FROM verification_tokens WHERE token=$1", [token]);
}

/**
 * Get the latest verification token row for a client.
 * Returns { token, client_id, expires_at, created_at } or null.
 */
async function getLatestTokenForClient(clientId) {
  const { rows } = await pool.query(
    `SELECT token, client_id, expires_at, created_at
     FROM verification_tokens
     WHERE client_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [clientId]
  );
  return rows[0] || null;
}

module.exports = {
  createToken,
  findToken,
  deleteToken,
  getLatestTokenForClient,
};
