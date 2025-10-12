// models/walletModel.js
const { pool } = require('../database/database');
const uuid = require('uuid');

/**
 * Ensure wallet row exists for client (idempotent).
 */
async function ensureWallet(clientId) {
  await pool.query(
    `INSERT INTO wallets (client_id, balance) VALUES ($1, 0)
     ON CONFLICT (client_id) DO NOTHING`,
    [clientId]
  );
}

/**
 * Return numeric balance (Number).
 */
async function getBalance(clientId) {
  await ensureWallet(clientId);
  const { rows } = await pool.query('SELECT balance FROM wallets WHERE client_id = $1', [clientId]);
  return rows[0] ? Number(rows[0].balance) : 0;
}

/**
 * Internal: persist a wallet_transactions row lookup by provider/provider_reference.
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
 * Internal: find transaction by id.
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
 * Atomically credit the wallet and insert wallet_transactions entry.
 * If provider+providerReference is set, this is idempotent: will not double-credit.
 *
 * @param {string} clientId
 * @param {number} amount - positive number
 * @param {Object} opts { provider, providerReference, orderId, note, raw, reason }
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // idempotency check: if provider+providerReference already applied, return existing row
    if (provider && providerReference) {
      const { rows: existing } = await client.query(
        `SELECT * FROM wallet_transactions WHERE provider=$1 AND provider_reference=$2 LIMIT 1`,
        [provider, providerReference]
      );
      if (existing && existing.length) {
        await client.query('COMMIT');
        return existing[0];
      }
    }

    // insert wallet transaction row (credit)
    const txId = uuid.v4();
    await client.query(
      `INSERT INTO wallet_transactions
        (id, client_id, amount, type, reason, provider, provider_reference, order_id, note, raw)
       VALUES ($1,$2,$3,'credit',$4,$5,$6,$7,$8,$9)`,
      [txId, clientId, amount, reason, provider, providerReference, orderId, note, raw]
    );

    // update or insert wallet row
    await client.query(
      `INSERT INTO wallets (client_id, balance, updated_at)
         VALUES ($1, $2, now())
       ON CONFLICT (client_id) DO UPDATE
         SET balance = wallets.balance + EXCLUDED.balance, updated_at = now()`,
      [clientId, amount]
    );

    await client.query('COMMIT');
    return { id: txId, client_id: clientId, amount, reason };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Atomically debit wallet if enough funds. Returns { success, balance, txId }.
 * Records a wallet_transactions row with type='debit'.
 *
 * @param {string} clientId
 * @param {number} amount - positive number
 * @param {Object} opts { orderId, note, raw }
 */
async function debitIfEnough(clientId, amount, opts = {}) {
  const { orderId = null, note = null, raw = {} } = opts;
  if (!clientId) throw new Error('clientId required');
  if (!amount || Number(amount) <= 0) throw new Error('amount must be positive');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // lock wallet row
    const { rows } = await client.query('SELECT balance FROM wallets WHERE client_id = $1 FOR UPDATE', [clientId]);
    const balance = rows[0] ? Number(rows[0].balance) : 0;

    if (balance < amount) {
      await client.query('ROLLBACK');
      return { success: false, balance };
    }

    // create debit transaction
    const txId = uuid.v4();
    await client.query(
      `INSERT INTO wallet_transactions
        (id, client_id, amount, type, reason, provider, provider_reference, order_id, note, raw)
       VALUES ($1,$2,$3,'debit','purchase','wallet',NULL,$4,$5,$6)`,
      [txId, clientId, amount, orderId, note, raw]
    );

    // update wallet balance
    await client.query('UPDATE wallets SET balance = balance - $1, updated_at = now() WHERE client_id = $2', [amount, clientId]);

    await client.query('COMMIT');
    return { success: true, balance: balance - amount, txId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Refund money into a client's wallet.
 *
 * This will:
 *  - insert a wallet_transactions row with type='credit' and reason='refund'
 *  - increment the wallet balance atomically
 *  - optionally accept provider/providerReference to make it idempotent (won't double-apply)
 *
 * @param {string} clientId
 * @param {number} amount
 * @param {Object} opts { provider, providerReference, orderId, note, raw, original_tx_id }
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // idempotency check when provider/providerReference supplied
    if (provider && providerReference) {
      const { rows: existing } = await client.query(
        `SELECT * FROM wallet_transactions WHERE provider = $1 AND provider_reference = $2 LIMIT 1`,
        [provider, providerReference]
      );
      if (existing && existing.length) {
        await client.query('COMMIT');
        return existing[0];
      }
    }

    const txId = uuid.v4();
    await client.query(
      `INSERT INTO wallet_transactions
        (id, client_id, amount, type, reason, provider, provider_reference, order_id, note, raw)
       VALUES ($1,$2,$3,'credit','refund',$4,$5,$6,$7,$8)`,
      [txId, clientId, amount, provider, providerReference, orderId, note || `refund${original_tx_id ? ' for '+original_tx_id : ''}`, raw]
    );

    // update wallet
    await client.query(
      `INSERT INTO wallets (client_id, balance, updated_at)
         VALUES ($1, $2, now())
       ON CONFLICT (client_id) DO UPDATE
         SET balance = wallets.balance + EXCLUDED.balance, updated_at = now()`,
      [clientId, amount]
    );

    await client.query('COMMIT');
    return { id: txId, client_id: clientId, amount, reason: 'refund' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  ensureWallet,
  getBalance,
  findTransactionByProvider,
  findTransactionById,
  creditFromProvider,
  debitIfEnough,
  refundToWallet,
};
