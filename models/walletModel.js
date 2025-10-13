// models/walletModel.js
const { pool } = require('../database/database');
const uuid = require('uuid');

/**
 * Return wallet row by client id (or null)
 */
async function getByClientId(clientId) {
  const { rows } = await pool.query(
    `SELECT wallet_uuid AS id, client_id, balance, wallet_uuid, wallet_identifier,
            wallet_identifier_locked, created_at, updated_at
     FROM wallets
     WHERE client_id = $1
     LIMIT 1`,
    [clientId]
  );
  return rows[0] || null;
}

/**
 * Create wallet if missing. If walletIdentifier provided, set it (but only if no existing identifier).
 * If race on unique constraint occurs, it falls back to create without identifier.
 *
 * lockIdentifier: boolean - when true, sets wallet_identifier_locked = true for the inserted identifier
 */
async function createIfNotExists(clientId, walletIdentifier = null, lockIdentifier = true) {
  const existing = await getByClientId(clientId);
  if (existing) {
    // If existing has no identifier and we provided one, attempt to set it (only if not locked)
    if (!existing.wallet_identifier && walletIdentifier) {
      try {
        const { rows } = await pool.query(
          `UPDATE wallets
           SET wallet_identifier = $1, wallet_identifier_locked = $2, updated_at = now()
           WHERE wallet_uuid = $3
           RETURNING wallet_uuid AS id, client_id, balance, wallet_uuid, wallet_identifier, wallet_identifier_locked`,
          [walletIdentifier, lockIdentifier, existing.wallet_uuid]
        );
        return rows[0] || (await getByClientId(clientId));
      } catch (err) {
        // unique constraint could fail (another wallet claimed that identifier), return existing
        return existing;
      }
    }
    return existing;
  }

  // Insert new wallet row; include walletIdentifier if provided
  try {
    const sql = `
      INSERT INTO wallets (wallet_uuid, client_id, balance, wallet_identifier, wallet_identifier_locked, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, now(), now())
      RETURNING wallet_uuid AS id, client_id, balance, wallet_uuid, wallet_identifier, wallet_identifier_locked
    `;
    const walletUUID = uuid.v4();
    const values = [walletUUID, clientId, 0.0, walletIdentifier, walletIdentifier ? lockIdentifier : false];
    const { rows } = await pool.query(sql, values);
    return rows[0];
  } catch (err) {
    if (err && err.code === '23505') {
      try {
        const fallbackUUID = uuid.v4();
        const { rows } = await pool.query(
          `INSERT INTO wallets (wallet_uuid, client_id, balance, created_at, updated_at)
           VALUES ($1, $2, $3, now(), now())
           RETURNING wallet_uuid AS id, client_id, balance, wallet_uuid, wallet_identifier, wallet_identifier_locked`,
          [fallbackUUID, clientId, 0.0]
        );
        return rows[0];
      } catch (e2) {
        return await getByClientId(clientId);
      }
    }
    throw err;
  }
}

/**
 * Ensure wallet row exists for client (idempotent)
 */
async function ensureWallet(clientId) {
  const walletUUID = uuid.v4();
  await pool.query(
    `INSERT INTO wallets (wallet_uuid, client_id, balance, created_at, updated_at)
     VALUES ($1, $2, 0, now(), now())
     ON CONFLICT (client_id) DO NOTHING`,
    [walletUUID, clientId]
  );
}

/**
 * Return numeric balance
 */
async function getBalance(clientId) {
  const w = await createIfNotExists(clientId);
  return Number(w && w.balance ? w.balance : 0);
}

/**
 * Find wallet transaction by provider + provider_reference
 */
async function findTransactionByProvider(provider, providerReference) {
  if (!provider || !providerReference) return null;
  const { rows } = await pool.query(
    `SELECT * FROM wallet_transactions WHERE provider=$1 AND provider_reference=$2 LIMIT 1`,
    [provider, providerReference]
  );
  return rows[0] || null;
}

/**
 * Find a wallet transaction by its ID
 */
async function findTransactionById(txId) {
  if (!txId) return null;
  const { rows } = await pool.query(
    `SELECT * FROM wallet_transactions WHERE id = $1 LIMIT 1`,
    [txId]
  );
  return rows[0] || null;
}

/**
 * Credit wallet (atomic, idempotent)
 */
async function creditFromProvider(clientId, amount, opts = {}) {
  const {
    provider = null,
    providerReference = null,
    orderId = null,
    note = null,
    raw = {},
    reason = 'topup',
  } = opts;

  if (!clientId) throw new Error('clientId required');
  if (!amount || Number(amount) <= 0) throw new Error('amount must be positive');

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    if (provider && providerReference) {
      const { rows: existing } = await conn.query(
        `SELECT * FROM wallet_transactions WHERE provider=$1 AND provider_reference=$2 LIMIT 1`,
        [provider, providerReference]
      );
      if (existing && existing.length) {
        await conn.query('COMMIT');
        return existing[0];
      }
    }

    const txId = uuid.v4();
    await conn.query(
      `INSERT INTO wallet_transactions
        (id, client_id, amount, type, reason, provider, provider_reference, order_id, note, raw, created_at)
       VALUES ($1,$2,$3,'credit',$4,$5,$6,$7,$8,$9, now())`,
      [txId, clientId, amount, reason, provider, providerReference, orderId, note, raw]
    );

    await conn.query(
      `INSERT INTO wallets (wallet_uuid, client_id, balance, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (client_id) DO UPDATE
         SET balance = wallets.balance + EXCLUDED.balance, updated_at = now()`,
      [uuid.v4(), clientId, amount]
    );

    await conn.query('COMMIT');
    return { id: txId, client_id: clientId, amount, reason };
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Debit wallet if enough funds
 */
async function debitIfEnough(clientId, amount, opts = {}) {
  const { orderId = null, note = null, raw = {} } = opts;
  if (!clientId) throw new Error('clientId required');
  if (!amount || Number(amount) <= 0) throw new Error('amount must be positive');

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    const { rows } = await conn.query(
      `SELECT wallet_uuid AS id, balance FROM wallets WHERE client_id = $1 FOR UPDATE`,
      [clientId]
    );
    const balance = rows && rows[0] ? Number(rows[0].balance) : 0;

    if (balance < amount) {
      await conn.query('ROLLBACK');
      return { success: false, balance };
    }

    const txId = uuid.v4();
    await conn.query(
      `INSERT INTO wallet_transactions
        (id, client_id, amount, type, reason, provider, provider_reference, order_id, note, raw, created_at)
       VALUES ($1,$2,$3,'debit','purchase','wallet',NULL,$4,$5,$6, now())`,
      [txId, clientId, amount, orderId, note, raw]
    );

    await conn.query(
      `UPDATE wallets SET balance = balance - $1, updated_at = now() WHERE client_id = $2`,
      [amount, clientId]
    );

    await conn.query('COMMIT');
    return { success: true, balance: balance - amount, txId };
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Refund to wallet (credit back)
 */
async function refundToWallet(clientId, amount, opts = {}) {
  const {
    provider = null,
    providerReference = null,
    orderId = null,
    note = null,
    raw = {},
    original_tx_id = null,
  } = opts;

  if (!clientId) throw new Error('clientId required');
  if (!amount || Number(amount) <= 0) throw new Error('amount must be positive');

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    if (provider && providerReference) {
      const { rows: existing } = await conn.query(
        `SELECT * FROM wallet_transactions WHERE provider=$1 AND provider_reference=$2 LIMIT 1`,
        [provider, providerReference]
      );
      if (existing && existing.length) {
        await conn.query('COMMIT');
        return existing[0];
      }
    }

    const txId = uuid.v4();
    await conn.query(
      `INSERT INTO wallet_transactions
        (id, client_id, amount, type, reason, provider, provider_reference, order_id, note, raw, created_at)
       VALUES ($1,$2,$3,'credit','refund',$4,$5,$6,$7,$8, now())`,
      [txId, clientId, amount, provider, providerReference, orderId, note || `refund${original_tx_id ? ' for '+original_tx_id : ''}`, raw]
    );

    await conn.query(
      `INSERT INTO wallets (wallet_uuid, client_id, balance, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (client_id) DO UPDATE
         SET balance = wallets.balance + EXCLUDED.balance, updated_at = now()`,
      [uuid.v4(), clientId, amount]
    );

    await conn.query('COMMIT');
    return { id: txId, client_id: clientId, amount, reason: 'refund' };
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Simple wrappers
 */
async function creditWallet(clientId, amount) {
  return creditFromProvider(clientId, amount, { reason: 'manual_credit' });
}

async function debitWallet(clientId, amount) {
  const res = await debitIfEnough(clientId, amount);
  if (!res.success) {
    const err = new Error('Insufficient funds');
    err.code = 'INSUFFICIENT_FUNDS';
    throw err;
  }
  return res;
}

module.exports = {
  getByClientId,
  createIfNotExists,
  ensureWallet,
  getBalance,
  findTransactionByProvider,
  findTransactionById,
  creditFromProvider,
  debitIfEnough,
  refundToWallet,
  creditWallet,
  debitWallet,
};
