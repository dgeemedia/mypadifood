// models/verificationModel.js
const { pool } = require('../database/database');

// cached flag: whether modern "verifications" table exists
let hasVerificationsTable = null;

async function detectVerificationsTable() {
  if (hasVerificationsTable !== null) return hasVerificationsTable;
  try {
    // PostgreSQL: to_regclass returns null if object doesn't exist
    const { rows } = await pool.query(
      `SELECT to_regclass('public.verifications') as r`
    );
    hasVerificationsTable = !!(rows && rows[0] && rows[0].r);
  } catch (e) {
    // fallback: try checking information_schema
    try {
      const { rows } = await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('verifications','verification_tokens')`
      );
      hasVerificationsTable = rows.some((r) => r.table_name === 'verifications');
    } catch (e2) {
      // if detection fails, assume legacy table (safer not to require schema migration)
      console.warn('verificationModel: table detection failed, assuming legacy verification_tokens table', e2);
      hasVerificationsTable = false;
    }
  }
  return hasVerificationsTable;
}

/**
 * createToken(token, clientId, expiresAt, type = 'verify')
 * - If 'verifications' exists, insert (token, user_id, type, expires_at, consumed=false)
 * - Else insert into legacy 'verification_tokens' (token, client_id, expires_at)
 */
async function createToken(token, clientId, expiresAt, type = 'verify') {
  const useNew = await detectVerificationsTable();
  if (useNew) {
    const sql = `
      INSERT INTO verifications (token, user_id, type, expires_at, consumed)
      VALUES ($1, $2, $3, $4, false)
      ON CONFLICT (token) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            type = EXCLUDED.type,
            expires_at = EXCLUDED.expires_at,
            consumed = false
    `;
    await pool.query(sql, [token, clientId, type, expiresAt]);
    return true;
  } else {
    const sql = `
      INSERT INTO verification_tokens (token, client_id, expires_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (token) DO UPDATE
        SET client_id = EXCLUDED.client_id,
            expires_at = EXCLUDED.expires_at
    `;
    await pool.query(sql, [token, clientId, expiresAt]);
    return true;
  }
}

/**
 * findToken(token)
 * Returns a unified row:
 * { token, client_id, expires_at, created_at, consumed: boolean, type: string|null }
 */
async function findToken(token) {
  if (!token) return null;
  const useNew = await detectVerificationsTable();
  if (useNew) {
    const { rows } = await pool.query(
      `SELECT token, user_id, type, expires_at, consumed, created_at FROM verifications WHERE token = $1 LIMIT 1`,
      [token]
    );
    const r = rows[0] || null;
    if (!r) return null;
    // unify column name to client_id for compatibility
    return {
      token: r.token,
      client_id: r.user_id,
      expires_at: r.expires_at,
      created_at: r.created_at,
      consumed: !!r.consumed,
      type: r.type || 'verify',
    };
  } else {
    const { rows } = await pool.query(
      `SELECT token, client_id, expires_at, created_at FROM verification_tokens WHERE token = $1 LIMIT 1`,
      [token]
    );
    const r = rows[0] || null;
    if (!r) return null;
    return {
      token: r.token,
      client_id: r.client_id,
      expires_at: r.expires_at,
      created_at: r.created_at,
      consumed: false, // legacy table has no consumed column
      type: null,
    };
  }
}

/**
 * deleteToken(token)
 * - For both legacy and new table: delete row(s) for the given token.
 * - Returns the deleted/unified row when possible, or true if deleted but no row returned.
 */
async function deleteToken(token) {
  if (!token) return false;
  const useNew = await detectVerificationsTable();
  if (useNew) {
    // return deleted row if any
    const { rows } = await pool.query(
      `DELETE FROM verifications WHERE token = $1 RETURNING token, user_id, type, expires_at, consumed, created_at`,
      [token]
    );
    const r = rows[0] || null;
    if (!r) return false;
    return {
      token: r.token,
      client_id: r.user_id,
      expires_at: r.expires_at,
      created_at: r.created_at,
      consumed: !!r.consumed,
      type: r.type || 'verify',
    };
  } else {
    const { rows } = await pool.query(
      `DELETE FROM verification_tokens WHERE token = $1 RETURNING token, client_id, expires_at, created_at`,
      [token]
    );
    const r = rows[0] || null;
    if (!r) return false;
    return {
      token: r.token,
      client_id: r.client_id,
      expires_at: r.expires_at,
      created_at: r.created_at,
      consumed: false,
      type: null,
    };
  }
}

/**
 * consumeToken(token)
 * - New-table: mark consumed = true and return the unified row
 * - Legacy: delete the token (legacy behavior) and return the deleted row if possible
 */
async function consumeToken(token) {
  if (!token) return null;
  const useNew = await detectVerificationsTable();
  if (useNew) {
    const { rows } = await pool.query(
      `UPDATE verifications SET consumed = true WHERE token = $1 RETURNING token, user_id, type, expires_at, consumed, created_at`,
      [token]
    );
    const r = rows[0] || null;
    if (!r) return null;
    return {
      token: r.token,
      client_id: r.user_id,
      expires_at: r.expires_at,
      created_at: r.created_at,
      consumed: !!r.consumed,
      type: r.type || 'verify',
    };
  } else {
    // legacy: remove the token (consume == delete)
    const { rows } = await pool.query(
      `DELETE FROM verification_tokens WHERE token = $1 RETURNING token, client_id, expires_at, created_at`,
      [token]
    );
    const r = rows[0] || null;
    if (!r) return null;
    return {
      token: r.token,
      client_id: r.client_id,
      expires_at: r.expires_at,
      created_at: r.created_at,
      consumed: true, // treat deletion as consumed
      type: null,
    };
  }
}

/**
 * getLatestTokenForClient(clientId)
 * - Attempts to return the most relevant token for the client:
 *   * Prefer unconsumed, unexpired tokens (new table).
 *   * Fallback to latest token regardless of consumed/expiry if none found.
 * - Returns unified row or null.
 */
async function getLatestTokenForClient(clientId) {
  if (!clientId) return null;
  const useNew = await detectVerificationsTable();

  if (useNew) {
    // 1) Prefer unconsumed and unexpired
    const q1 = `
      SELECT token, user_id, type, expires_at, consumed, created_at
      FROM verifications
      WHERE user_id = $1
        AND (consumed = false)
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY created_at DESC
      LIMIT 1
    `;
    let res = await pool.query(q1, [clientId]);
    if (res.rows && res.rows[0]) {
      const r = res.rows[0];
      return {
        token: r.token,
        client_id: r.user_id,
        expires_at: r.expires_at,
        created_at: r.created_at,
        consumed: !!r.consumed,
        type: r.type || 'verify',
      };
    }

    // 2) Fallback: latest token (any state)
    const q2 = `
      SELECT token, user_id, type, expires_at, consumed, created_at
      FROM verifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;
    res = await pool.query(q2, [clientId]);
    if (res.rows && res.rows[0]) {
      const r = res.rows[0];
      return {
        token: r.token,
        client_id: r.user_id,
        expires_at: r.expires_at,
        created_at: r.created_at,
        consumed: !!r.consumed,
        type: r.type || 'verify',
      };
    }

    return null;
  } else {
    // Legacy table: prefer unexpired tokens
    const q1 = `
      SELECT token, client_id, expires_at, created_at
      FROM verification_tokens
      WHERE client_id = $1
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY created_at DESC
      LIMIT 1
    `;
    let res = await pool.query(q1, [clientId]);
    if (res.rows && res.rows[0]) {
      const r = res.rows[0];
      return {
        token: r.token,
        client_id: r.client_id,
        expires_at: r.expires_at,
        created_at: r.created_at,
        consumed: false,
        type: null,
      };
    }

    // Fallback: latest token regardless of expiry
    const q2 = `
      SELECT token, client_id, expires_at, created_at
      FROM verification_tokens
      WHERE client_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;
    res = await pool.query(q2, [clientId]);
    if (res.rows && res.rows[0]) {
      const r = res.rows[0];
      return {
        token: r.token,
        client_id: r.client_id,
        expires_at: r.expires_at,
        created_at: r.created_at,
        consumed: false,
        type: null,
      };
    }

    return null;
  }
}

module.exports = {
  detectVerificationsTable,
  createToken,
  findToken,
  deleteToken,
  consumeToken,
  getLatestTokenForClient,
};
