// models/withdrawalModel.js
const { pool } = require('../database/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Minimal configuration via env:
 * MIN_WITHDRAWAL_AMOUNT (default 500)
 * WITHDRAWAL_KYC_THRESHOLD (default 50000) - amounts above this require KYC
 * DAILY_WITHDRAWAL_LIMIT (default 100000)
 * WEEKLY_WITHDRAWAL_LIMIT (default 500000)
 */
const MIN_WITHDRAWAL_AMOUNT = Number(process.env.MIN_WITHDRAWAL_AMOUNT || 500);
const WITHDRAWAL_KYC_THRESHOLD = Number(process.env.WITHDRAWAL_KYC_THRESHOLD || 50000);
const DAILY_WITHDRAWAL_LIMIT = Number(process.env.DAILY_WITHDRAWAL_LIMIT || 100000);
const WEEKLY_WITHDRAWAL_LIMIT = Number(process.env.WEEKLY_WITHDRAWAL_LIMIT || 500000);

/**
 * Create a withdrawal request (status = 'pending').
 * destination is JSON with bank_name, account_number, account_name etc.
 * Performs basic checks: min amount, KYC requirement and daily/weekly limits.
 *
 * NOTE: this does not debit the wallet. Wallet is debited at admin approval
 * OR when markPaid is called (depending on your chosen flow).
 */
async function createRequest({ clientId, amount, method = 'bank', destination = {}, currency = 'NGN' }) {
  if (!clientId) throw new Error('clientId required');
  if (!amount || Number(amount) <= 0) throw new Error('amount must be positive');
  const amt = Number(amount);

  // Basic minimum check
  if (amt < MIN_WITHDRAWAL_AMOUNT) {
    const err = new Error(`Minimum withdrawal is ${MIN_WITHDRAWAL_AMOUNT}`);
    err.code = 'min_withdrawal';
    throw err;
  }

  // Load client KYC / basic info to enforce KYC threshold and location-based checks.
  const { rows: clientRows } = await pool.query('SELECT id, full_name, email, phone, kyc_verified FROM clients WHERE id = $1 LIMIT 1', [clientId]);
  const client = clientRows && clientRows[0] ? clientRows[0] : null;
  if (!client) {
    const err = new Error('Client not found');
    err.code = 'client_not_found';
    throw err;
  }

  // If amount is above KYC threshold, require kyc_verified flag on client
  if (amt >= WITHDRAWAL_KYC_THRESHOLD && !client.kyc_verified) {
    const err = new Error('Client KYC required for withdrawals above threshold');
    err.code = 'kyc_required';
    throw err;
  }

  // Enforce daily/weekly sum limits (consider only non-declined requests)
  const sinceDay = new Date();
  sinceDay.setHours(0, 0, 0, 0);
  const { rows: dayRows } = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS total FROM withdrawal_requests
      WHERE client_id = $1 AND created_at >= $2 AND status IN ('pending','approved','paid')`,
    [clientId, sinceDay]
  );
  const dayTotal = dayRows[0] ? Number(dayRows[0].total) : 0;
  if (dayTotal + amt > DAILY_WITHDRAWAL_LIMIT) {
    const err = new Error('Daily withdrawal limit exceeded');
    err.code = 'daily_limit';
    throw err;
  }

  const sinceWeek = new Date();
  sinceWeek.setDate(sinceWeek.getDate() - 7);
  const { rows: weekRows } = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS total FROM withdrawal_requests
      WHERE client_id = $1 AND created_at >= $2 AND status IN ('pending','approved','paid')`,
    [clientId, sinceWeek]
  );
  const weekTotal = weekRows[0] ? Number(weekRows[0].total) : 0;
  if (weekTotal + amt > WEEKLY_WITHDRAWAL_LIMIT) {
    const err = new Error('Weekly withdrawal limit exceeded');
    err.code = 'weekly_limit';
    throw err;
  }

  const id = uuidv4();
  const sql = `INSERT INTO withdrawal_requests
    (id, client_id, amount, currency, method, destination, status, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,'pending', now(), now()) RETURNING *`;
  const values = [id, clientId, amt, currency, method, destination];
  const { rows } = await pool.query(sql, values);
  return rows[0];
}

/**
 * Get withdrawal requests for a given client
 */
async function getRequestsByClient(clientId, limit = 50) {
  if (!clientId) return [];
  const { rows } = await pool.query(
    'SELECT * FROM withdrawal_requests WHERE client_id = $1 ORDER BY created_at DESC LIMIT $2',
    [clientId, limit]
  );
  return rows;
}

/**
 * Get pending withdrawal requests (with client basic info)
 */
async function getPendingRequests(limit = 200) {
  const sql = `
    SELECT wr.*, c.full_name AS client_name, c.email AS client_email, c.phone AS client_phone
    FROM withdrawal_requests wr
    LEFT JOIN clients c ON c.id = wr.client_id
    WHERE wr.status = 'pending'
    ORDER BY wr.created_at DESC
    LIMIT $1
  `;
  const { rows } = await pool.query(sql, [limit]);
  return rows || [];
}

/**
 * Find a withdrawal by id
 */
async function findById(id) {
  if (!id) return null;
  const { rows } = await pool.query('SELECT * FROM withdrawal_requests WHERE id = $1 LIMIT 1', [id]);
  return rows[0] || null;
}

/**
 * Sum client withdrawals (e.g. for limits). opts: { since: timestamp | null }
 */
async function sumClientWithdrawals(clientId, opts = {}) {
  if (!clientId) return 0;
  const since = opts.since || null;
  let sql = 'SELECT COALESCE(SUM(amount),0) AS total FROM withdrawal_requests WHERE client_id = $1 AND status IN (\'pending\',\'approved\',\'paid\')';
  const params = [clientId];
  if (since) {
    sql += ' AND created_at >= $2';
    params.push(since);
  }
  const { rows } = await pool.query(sql, params);
  return rows[0] ? Number(rows[0].total) : 0;
}

/**
 * Atomic approve: debits wallet (if sufficient), inserts wallet_transactions, and updates withdrawal_requests status.
 * opts: { note, markPaid (boolean), provider, providerReference }
 *
 * Returns { success:true, txId, status } or { success:false, message }
 *
 * This function implements the "debit at approval" flow (recommended if you want to prevent double-spend immediately).
 */
async function markApproved(withdrawalId, adminId, opts = {}) {
  const { note = null, markPaid = false, provider = null, providerReference = null } = opts;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query('SELECT * FROM withdrawal_requests WHERE id = $1 FOR UPDATE', [withdrawalId]);
    if (!rows || !rows.length) {
      await client.query('ROLLBACK');
      return { success: false, message: 'not_found' };
    }
    const wr = rows[0];
    if (wr.status !== 'pending') {
      await client.query('ROLLBACK');
      return { success: false, message: 'invalid_status', status: wr.status };
    }

    const amount = Number(wr.amount);
    if (!(amount > 0)) {
      await client.query('ROLLBACK');
      return { success: false, message: 'invalid_amount' };
    }

    // ensure wallet exists
    await client.query(
      `INSERT INTO wallets (client_id, balance, updated_at) VALUES ($1, 0, now())
       ON CONFLICT (client_id) DO NOTHING`,
      [wr.client_id]
    );

    // lock wallet row
    const { rows: wRows } = await client.query('SELECT balance FROM wallets WHERE client_id = $1 FOR UPDATE', [wr.client_id]);
    const balance = wRows[0] ? Number(wRows[0].balance) : 0;
    if (balance < amount) {
      await client.query('ROLLBACK');
      return { success: false, message: 'insufficient_funds', balance };
    }

    // insert wallet transactions (debit)
    const txId = uuidv4();
    const txProvider = provider || 'admin';
    const txProviderRef = providerReference || null;
    const rawObj = { adminId, withdrawalId, created_at: new Date().toISOString() };

    await client.query(
      `INSERT INTO wallet_transactions
        (id, client_id, amount, type, reason, provider, provider_reference, order_id, note, raw, created_at)
       VALUES ($1,$2,$3,'debit','withdrawal',$4,$5,NULL,$6,$7, now())`,
      [txId, wr.client_id, amount, txProvider, txProviderRef, note || `withdrawal ${withdrawalId}`, rawObj]
    );

    // update wallet balance
    await client.query('UPDATE wallets SET balance = balance - $1, updated_at = now() WHERE client_id = $2', [amount, wr.client_id]);

    // set withdrawal status to approved or paid (if markPaid)
    const status = markPaid ? 'paid' : 'approved';
    const providerRefToWrite = txProviderRef || txId;
    await client.query(
      `UPDATE withdrawal_requests
         SET status = $1,
             admin_id = $2,
             admin_note = COALESCE(admin_note, $3),
             provider = $4,
             provider_reference = $5,
             updated_at = now()
       WHERE id = $6`,
      [status, adminId, note, txProvider, providerRefToWrite, withdrawalId]
    );

    await client.query('COMMIT');
    return { success: true, txId, status };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * markPaid: called when an external payout provider confirms a payout, or admin marks a payout paid.
 *
 * This function supports two flows:
 *  - If markApproved already debited wallet (status == 'approved' or 'paid' and provider_reference matches), mark as 'paid' (idempotent).
 *  - If you use "debit at payout confirmation" flow (i.e. markApproved only sets status='approved' and didn't debit),
 *    markPaid will perform the debit and set status='paid' in one transaction.
 *
 * opts: { adminId|null, provider, providerReference, raw }
 *
 * Returns { success:true, txId?, status } or { success:false, message }
 */
async function markPaid(withdrawalId, adminId = null, opts = {}) {
  const { provider = null, providerReference = null, raw = {} } = opts;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: wrRows } = await client.query('SELECT * FROM withdrawal_requests WHERE id = $1 FOR UPDATE', [withdrawalId]);
    if (!wrRows || !wrRows.length) {
      await client.query('ROLLBACK');
      return { success: false, message: 'not_found' };
    }
    const wr = wrRows[0];

    // If already paid => idempotent success
    if (wr.status === 'paid') {
      await client.query('COMMIT');
      return { success: true, status: 'paid' };
    }

    const amount = Number(wr.amount);
    if (!(amount > 0)) {
      await client.query('ROLLBACK');
      return { success: false, message: 'invalid_amount' };
    }

    // If provider+providerReference given, ensure we haven't already processed that provider event
    if (provider && providerReference) {
      const { rows: existing } = await client.query(
        'SELECT id FROM wallet_transactions WHERE provider = $1 AND provider_reference = $2 LIMIT 1',
        [provider, providerReference]
      );
      if (existing && existing.length) {
        // Already processed externally - mark withdrawal paid if not already
        await client.query(
          `UPDATE withdrawal_requests SET status='paid', admin_id = COALESCE($1, admin_id), provider = $2, provider_reference = $3, updated_at = now() WHERE id = $4`,
          [adminId, provider, providerReference, withdrawalId]
        );
        await client.query('COMMIT');
        return { success: true, status: 'paid' };
      }
    }

    // Ensure wallet exists
    await client.query(
      `INSERT INTO wallets (client_id, balance, updated_at) VALUES ($1, 0, now())
       ON CONFLICT (client_id) DO NOTHING`,
      [wr.client_id]
    );

    // Lock wallet row
    const { rows: wRows } = await client.query('SELECT balance FROM wallets WHERE client_id = $1 FOR UPDATE', [wr.client_id]);
    const balance = wRows[0] ? Number(wRows[0].balance) : 0;

    // If wallet already debited earlier (e.g. markApproved debited), then balance check is not needed here.
    // We detect that by searching for a wallet_transactions debit for this withdrawal id OR by wr.status.
    const { rows: debitExists } = await client.query(
      `SELECT id FROM wallet_transactions WHERE raw->>'withdrawalId' = $1::text OR note LIKE $2 LIMIT 1`,
      [withdrawalId, `%withdrawal ${withdrawalId}%`]
    );
    if (debitExists && debitExists.length) {
      // debit already present; just mark paid
      await client.query(
        `UPDATE withdrawal_requests
           SET status='paid', admin_id = COALESCE($1, admin_id), provider = COALESCE($2, provider), provider_reference = COALESCE($3, provider_reference), updated_at = now()
         WHERE id = $4`,
        [adminId, provider || wr.provider, providerReference || wr.provider_reference, withdrawalId]
      );
      await client.query('COMMIT');
      return { success: true, status: 'paid' };
    }

    // Otherwise we must debit now (ensure sufficient balance)
    if (balance < amount) {
      await client.query('ROLLBACK');
      return { success: false, message: 'insufficient_funds', balance };
    }

    // Create wallet transaction debit
    const txId = uuidv4();
    const txProvider = provider || 'payout_provider';
    const txProviderRef = providerReference || txId;
    const rawObj = Object.assign({}, raw, { withdrawalId, created_at: new Date().toISOString() });

    await client.query(
      `INSERT INTO wallet_transactions
        (id, client_id, amount, type, reason, provider, provider_reference, order_id, note, raw, created_at)
       VALUES ($1,$2,$3,'debit','withdrawal',$4,$5,NULL,$6,$7, now())`,
      [txId, wr.client_id, amount, txProvider, txProviderRef, `withdrawal ${withdrawalId}`, rawObj]
    );

    // Update wallet balance
    await client.query('UPDATE wallets SET balance = balance - $1, updated_at = now() WHERE client_id = $2', [amount, wr.client_id]);

    // Mark withdrawal as paid
    await client.query(
      `UPDATE withdrawal_requests
         SET status='paid', admin_id = COALESCE($1, admin_id), provider = $2, provider_reference = $3, updated_at = now()
       WHERE id = $4`,
      [adminId, txProvider, txProviderRef, withdrawalId]
    );

    await client.query('COMMIT');
    return { success: true, txId, status: 'paid' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Mark declined (simple update)
 */
async function markDeclined(withdrawalId, adminId, opts = {}) {
  const { note = null } = opts;
  const { rows } = await pool.query(
    `UPDATE withdrawal_requests
      SET status = 'declined', admin_id = $1, admin_note = $2, updated_at = now()
      WHERE id = $3
      RETURNING *`,
    [adminId, note, withdrawalId]
  );
  return rows[0] || null;
}

module.exports = {
  createRequest,
  getRequestsByClient,
  getPendingRequests,
  findById,
  sumClientWithdrawals,
  markApproved,
  markPaid,
  markDeclined,
};
